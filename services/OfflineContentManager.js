import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

/**
 * مدير المحتوى الـ Offline
 * يحل المشكلة الجذرية: تخزين المحتوى محلياً للعمل بدون إنترنت
 */
class OfflineContentManager {
  constructor() {
    this.realm = null;
    this.contentDirectory = FileSystem.documentDirectory + 'offline_content/';
    this.downloadQueue = new Map();
    this.isInitialized = false;
  }

  // تهيئة المدير
  async initialize(realmInstance) {
    try {
      this.realm = realmInstance;
      
      // إنشاء مجلد المحتوى
      const dirInfo = await FileSystem.getInfoAsync(this.contentDirectory);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.contentDirectory, { intermediates: true });
      }
      
      this.isInitialized = true;
      console.log('✅ OfflineContentManager initialized');
      
      // التحقق من المحتوى الموجود وتحديث Realm
      this.syncLocalContentWithRealm();
      
    } catch (error) {
      console.error('❌ Error initializing OfflineContentManager:', error);
    }
  }

  // مزامنة المحتوى المحلي مع Realm
  async syncLocalContentWithRealm() {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      const books = this.realm.objects('Book');
      let syncedCount = 0;
      
      for (const book of books) {
        if (book.localFilePath) {
          const fileInfo = await FileSystem.getInfoAsync(book.localFilePath);
          if (fileInfo.exists) {
            // الملف موجود - تأكيد حالة offline
            this.realm.write(() => {
              book.isContentAvailable = true;
              book.isFullyOffline = true;
              book.downloadStatus = 'downloaded';
              book.localFileSize = fileInfo.size;
            });
            syncedCount++;
          } else {
            // الملف مفقود - إعادة تعيين الحالة
            this.realm.write(() => {
              book.isContentAvailable = false;
              book.isFullyOffline = false;
              book.downloadStatus = 'not_downloaded';
              book.localFilePath = '';
              book.localFileSize = 0;
            });
          }
        }
      }
      
      console.log(`📊 Offline content synced: ${syncedCount} files available`);
      
    } catch (error) {
      console.error('Error syncing local content:', error);
    }
  }

  // تحميل محتوى للتخزين المحلي
  async downloadAndCacheContent(contentItem, onProgress = null) {
    try {
      if (!this.isInitialized) {
        throw new Error('OfflineContentManager not initialized');
      }

      // التحقق من الإنترنت
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        throw new Error('No internet connection available');
      }

      // التحقق من وجود رابط صالح
      if (!contentItem.bookUrl || !contentItem.bookUrl.startsWith('http')) {
        throw new Error(`No valid URL for: ${contentItem.bookName}`);
      }

      console.log(`📥 Starting offline download: ${contentItem.bookName}`);

      // إنشاء اسم ملف فريد
      const fileName = this.generateSafeFileName(contentItem);
      const localPath = this.contentDirectory + fileName;

      // محاولة الحصول على حجم الملف من الخادم أولاً
      let expectedSize = 0;
      try {
        const headResponse = await fetch(contentItem.bookUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            expectedSize = parseInt(contentLength, 10);
            console.log(`📊 Expected file size: ${this.formatFileSize(expectedSize)}`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not get file size from server:', error);
      }

      // بدء التحميل
      const downloadResumable = FileSystem.createDownloadResumable(
        contentItem.bookUrl,
        localPath,
        {
          headers: {
            'User-Agent': 'HudaLibrary-OfflineFirst/1.0'
          }
        },
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          
          // تحديث التقدم في Realm
          this.updateDownloadProgress(contentItem.id, progress);
          
          if (onProgress) onProgress(progress);
          
          // إظهار معلومات التحميل المفصلة
          const downloadedMB = (downloadProgress.totalBytesWritten / (1024 * 1024)).toFixed(2);
          const totalMB = (downloadProgress.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(2);
          console.log(`📊 Download progress: ${(progress * 100).toFixed(1)}% (${downloadedMB}MB / ${totalMB}MB)`);
        }
      );

      // تحديث حالة البداية
      this.updateContentStatus(contentItem.id, {
        downloadStatus: 'downloading',
        downloadProgress: 0,
        expectedFileSize: expectedSize,
        isContentAvailable: false, // تأكيد أن المحتوى غير متاح حتى اكتمال التحميل
        isFullyOffline: false
      });

      // التحميل مع timeout ديناميكي ومحاولات الاستئناف
      const timeoutDuration = this.getDynamicTimeoutForContent(contentItem.contentType, expectedSize);
      console.log(`⏱️ Download timeout set to: ${Math.round(timeoutDuration / 60000)} minutes`);
      
      let result;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          const downloadPromise = downloadResumable.downloadAsync();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Download timeout after ${Math.round(timeoutDuration / 60000)} minutes`)), timeoutDuration);
          });

          result = await Promise.race([downloadPromise, timeoutPromise]);
          break; // نجح التحميل، اخرج من الحلقة
          
        } catch (error) {
          retryCount++;
          console.log(`🔄 Download attempt ${retryCount}/${maxRetries} failed:`, error.message);
          
          if (retryCount >= maxRetries) {
            throw error; // فشلت جميع المحاولات
          }
          
          // انتظار قبل المحاولة التالية
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          
          // محاولة استئناف التحميل
          try {
            result = await downloadResumable.downloadAsync();
            break; // نجح الاستئناف
          } catch (resumeError) {
            console.log(`🔄 Resume attempt ${retryCount} failed:`, resumeError.message);
            // استمر في الحلقة للمحاولة التالية
          }
        }
      }

      if (result && result.uri) {
        // التحقق من سلامة الملف
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists && fileInfo.size > 0) {
          
          // التحقق من أن الملف مكتمل (إذا كان الحجم المتوقع معروف)
          if (expectedSize > 0 && fileInfo.size < expectedSize * 0.95) {
            throw new Error(`Downloaded file is incomplete. Expected: ${this.formatFileSize(expectedSize)}, Got: ${this.formatFileSize(fileInfo.size)}`);
          }
          
          // تحديث معلومات المحتوى في Realm
          this.updateContentStatus(contentItem.id, {
            downloadStatus: 'downloaded',
            downloadProgress: 1.0,
            localFilePath: result.uri,
            localFileName: fileName,
            localFileSize: fileInfo.size,
            isContentAvailable: true,
            isFullyOffline: true,
            contentCachedAt: new Date(),
            downloadedAt: new Date()
          });

          console.log(`✅ Content cached successfully: ${contentItem.bookName} (${this.formatFileSize(fileInfo.size)})`);
          return { success: true, localPath: result.uri };
          
        } else {
          throw new Error('Downloaded file is empty or corrupted');
        }
      } else {
        throw new Error('Download failed - no result');
      }

    } catch (error) {
      console.error(`❌ Offline download failed for ${contentItem.bookName}:`, error);
      
      // تحديث حالة الخطأ
      this.updateContentStatus(contentItem.id, {
        downloadStatus: 'failed',
        lastDownloadError: error.message
      });
      
      throw error;
    }
  }

  // تحديث حالة المحتوى في Realm
  updateContentStatus(contentId, updates) {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      this.realm.write(() => {
        const content = this.realm.objectForPrimaryKey('Book', contentId);
        if (content) {
          Object.keys(updates).forEach(key => {
            content[key] = updates[key];
          });
        }
      });
    } catch (error) {
      console.error('Error updating content status:', error);
    }
  }

  // تحديث تقدم التحميل
  updateDownloadProgress(contentId, progress) {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      this.realm.write(() => {
        const content = this.realm.objectForPrimaryKey('Book', contentId);
        if (content) {
          content.downloadProgress = progress;
        }
      });
    } catch (error) {
      // تجاهل الأخطاء في تحديث التقدم لتجنب التداخل
    }
  }

  // إنشاء اسم ملف آمن
  generateSafeFileName(contentItem) {
    const safeName = contentItem.bookName
      .replace(/[^\w\d\-_\u0600-\u06FF]/g, '_')
      .substring(0, 50);
    
    const extension = this.getFileExtension(contentItem.contentType);
    const timestamp = Date.now();
    
    return `${safeName}_${contentItem.id}_${timestamp}${extension}`;
  }

  // الحصول على امتداد الملف
  getFileExtension(contentType) {
    switch (contentType) {
      case 'video': return '.mp4';
      case 'audio': return '.m4a';
      default: return '.pdf';
    }
  }

  // الحصول على timeout للمحتوى
  getTimeoutForContent(contentType) {
    switch (contentType) {
      case 'video': return 7200000; // 120 دقيقة للفيديو (الملفات الكبيرة جداً)
      case 'audio': return 3600000;  // 60 دقيقة للصوت
      default: return 2400000;       // 40 دقيقة للكتب
    }
  }

  // الحصول على timeout ديناميكي حسب حجم الملف المتوقع
  getDynamicTimeoutForContent(contentType, expectedSize = 0) {
    if (expectedSize > 0) {
      // افتراض سرعة تحميل 0.25MB/دقيقة (بطيئة جداً للإنترنت الضعيف جداً)
      const estimatedMinutes = Math.ceil(expectedSize / (256 * 1024));
      const timeoutMinutes = Math.max(estimatedMinutes * 4, 30); // أربعة أضعاف الوقت المتوقع + 30 دقيقة كحد أدنى
      console.log(`📊 File size: ${this.formatFileSize(expectedSize)}, Estimated time: ${estimatedMinutes}min, Timeout: ${timeoutMinutes}min`);
      return timeoutMinutes * 60 * 1000;
    }
    return this.getTimeoutForContent(contentType);
  }

  // التحقق من توفر المحتوى محلياً
  async isContentAvailableOffline(contentId) {
    try {
      if (!this.realm || this.realm.isClosed) return false;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      if (!content || !content.isContentAvailable || !content.localFilePath) {
        return false;
      }

      // تحقق فعلي من وجود الملف
      const fileInfo = await FileSystem.getInfoAsync(content.localFilePath);
      return fileInfo.exists && fileInfo.size > 0;
      
    } catch (error) {
      console.error('Error checking offline availability:', error);
      return false;
    }
  }

  // الحصول على مسار المحتوى المحلي
  getLocalContentPath(contentId) {
    try {
      if (!this.realm || this.realm.isClosed) return null;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      return content && content.isContentAvailable ? content.localFilePath : null;
      
    } catch (error) {
      console.error('Error getting local content path:', error);
      return null;
    }
  }

  // الحصول على جميع المحتوى المتاح محلياً
  getOfflineContent() {
    try {
      if (!this.realm || this.realm.isClosed) return [];
      
      const offlineContent = this.realm.objects('Book').filtered(
        'isContentAvailable == true AND isFullyOffline == true'
      );
      
      return Array.from(offlineContent);
      
    } catch (error) {
      console.error('Error getting offline content:', error);
      return [];
    }
  }

  // حذف محتوى محلي
  async deleteLocalContent(contentId) {
    try {
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      if (!content || !content.localFilePath) {
        return false;
      }

      // حذف الملف
      await FileSystem.deleteAsync(content.localFilePath, { idempotent: true });
      
      // تحديث Realm
      this.updateContentStatus(contentId, {
        isContentAvailable: false,
        isFullyOffline: false,
        downloadStatus: 'not_downloaded',
        localFilePath: '',
        localFileName: '',
        localFileSize: 0,
        downloadProgress: 0
      });

      console.log(`🗑️ Local content deleted: ${content.bookName}`);
      return true;
      
    } catch (error) {
      console.error('Error deleting local content:', error);
      return false;
    }
  }

  // الحصول على إحصائيات التخزين
  async getStorageStats() {
    try {
      const offlineContent = this.getOfflineContent();
      const totalSize = offlineContent.reduce((sum, item) => sum + (item.localFileSize || 0), 0);
      
      return {
        totalFiles: offlineContent.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
      
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalFiles: 0, totalSize: 0, totalSizeMB: '0.00' };
    }
  }

  // تسجيل الوصول للمحتوى
  recordContentAccess(contentId) {
    try {
      this.updateContentStatus(contentId, {
        lastAccessedAt: new Date(),
        viewCount: this.getContentField(contentId, 'viewCount') + 1
      });
    } catch (error) {
      console.error('Error recording content access:', error);
    }
  }

  // الحصول على حقل من المحتوى
  getContentField(contentId, fieldName) {
    try {
      if (!this.realm || this.realm.isClosed) return 0;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      return content ? (content[fieldName] || 0) : 0;
    } catch (error) {
      return 0;
    }
  }

  // تنسيق حجم الملف
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// إنشاء مثيل واحد
const offlineContentManager = new OfflineContentManager();
export default offlineContentManager; 