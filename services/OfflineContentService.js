import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

/**
 * خدمة إدارة المحتوى Offline-First - محسنة
 * تدير تحميل وتخزين ومزامنة المحتوى للعمل بدون إنترنت
 * مع حل مشاكل التحميل والمهلة والتحقق من اكتمال التحميل
 */
class OfflineContentService {
  constructor() {
    this.realm = null;
    this.downloadQueue = new Map(); // قائمة التحميلات الجارية
    this.isInitialized = false;
    this.contentDirectory = FileSystem.documentDirectory + 'offline_content/';
    this.maxCacheSize = 1024 * 1024 * 1024; // 1GB بحد أقصى
    this.downloadConcurrency = 2; // تقليل عدد التحميلات المتزامنة لتجنب الضغط
    this.activeDownloads = 0;
    this.downloadVerificationQueue = new Map(); // قائمة التحقق من اكتمال التحميل
  }

  // تهيئة الخدمة
  async initialize(realmInstance) {
    try {
      this.realm = realmInstance;
      
      // إنشاء مجلد المحتوى إذا لم يكن موجوداً
      const dirInfo = await FileSystem.getInfoAsync(this.contentDirectory);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.contentDirectory, { intermediates: true });
      }
      
      // إصلاح مشاكل التخزين المؤقت أولاً
      await this.fixCacheIssues();
      
      // تنظيف الملفات التالفة أو المنتهية الصلاحية
      await this.cleanupExpiredContent();
      
      // التحقق من سلامة الملفات الموجودة
      await this.verifyExistingContent();
      
      this.isInitialized = true;
      console.log('🔄 OfflineContentService initialized successfully');
      
      // بدء معالجة قائمة التحميل التلقائي
      this.startAutoDownloadProcessor();
      
    } catch (error) {
      console.error('❌ Error initializing OfflineContentService:', error);
      throw error;
    }
  }

  // إصلاح مشاكل التخزين المؤقت - محسن للتعامل مع قاعدة البيانات القديمة
  async fixCacheIssues() {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      console.log('🔧 Fixing cache issues...');
      
      // التحقق من وجود الحقول الجديدة في قاعدة البيانات
      const testBooks = this.realm.objects('Book');
      const hasNewFields = testBooks.length > 0 && 
        'isContentAvailable' in testBooks[0] && 
        'downloadAttempts' in testBooks[0] && 
        'lastAccessedAt' in testBooks[0];
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema is old - adding missing fields...');
        await this._migrateDatabaseSchema();
        return;
      }
      
      // إصلاح مشاكل isContentAvailable
      const booksWithIssues = this.realm.objects('Book').filtered(
        'isContentAvailable == true AND (localFilePath == "" OR localFilePath == null)'
      );
      
      let fixedCount = 0;
      for (const book of booksWithIssues) {
        this.realm.write(() => {
          book.isContentAvailable = false;
          book.isFullyOffline = false;
          book.downloadStatus = 'not_downloaded';
          book.localFilePath = '';
          book.localFileName = '';
          book.localFileSize = 0;
        });
        fixedCount++;
      }
      
      // إصلاح مشاكل التحميل المعلق
      const stuckDownloads = this.realm.objects('Book').filtered(
        'downloadStatus == "downloading"'
      );
      
      for (const book of stuckDownloads) {
        this.realm.write(() => {
          book.downloadStatus = 'not_downloaded';
          book.downloadProgress = 0;
          book.lastDownloadError = 'Download was interrupted';
        });
      }
      
      // إصلاح مشاكل الملفات المفقودة
      const downloadedBooks = this.realm.objects('Book').filtered(
        'downloadStatus == "downloaded" AND localFilePath != ""'
      );
      
      for (const book of downloadedBooks) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(book.localFilePath);
          if (!fileInfo.exists || fileInfo.size === 0) {
            this.realm.write(() => {
              book.isContentAvailable = false;
              book.isFullyOffline = false;
              book.downloadStatus = 'not_downloaded';
              book.localFilePath = '';
              book.localFileName = '';
              book.localFileSize = 0;
            });
            fixedCount++;
          }
        } catch (error) {
          console.warn(`Warning: Could not verify file ${book.localFilePath}:`, error);
        }
      }
      
      console.log(`🔧 Fixed ${fixedCount} cache issues, reset ${stuckDownloads.length} stuck downloads`);
      
    } catch (error) {
      console.error('Error fixing cache issues:', error);
    }
  }

  // ترقية قاعدة البيانات لإضافة الحقول المفقودة
  async _migrateDatabaseSchema() {
    try {
      console.log('🔄 Migrating database schema...');
      
      const books = this.realm.objects('Book');
      let migratedCount = 0;
      
      this.realm.write(() => {
        for (const book of books) {
          // إضافة الحقول المفقودة
          if (!('isContentAvailable' in book)) {
            book.isContentAvailable = false;
          }
          if (!('isFullyOffline' in book)) {
            book.isFullyOffline = false;
          }
          if (!('downloadAttempts' in book)) {
            book.downloadAttempts = 0;
          }
          if (!('lastDownloadError' in book)) {
            book.lastDownloadError = '';
          }
          if (!('lastAccessedAt' in book)) {
            book.lastAccessedAt = new Date();
          }
          if (!('localFilePath' in book)) {
            book.localFilePath = '';
          }
          if (!('localFileName' in book)) {
            book.localFileName = '';
          }
          if (!('localFileSize' in book)) {
            book.localFileSize = 0;
          }
          if (!('fileHash' in book)) {
            book.fileHash = '';
          }
          if (!('contentCachedAt' in book)) {
            book.contentCachedAt = null;
          }
          if (!('contentVerifiedAt' in book)) {
            book.contentVerifiedAt = null;
          }
          if (!('downloadedAt' in book)) {
            book.downloadedAt = null;
          }
          if (!('downloadProgress' in book)) {
            book.downloadProgress = 0.0;
          }
          if (!('downloadStatus' in book)) {
            book.downloadStatus = 'not_downloaded';
          }
          
          migratedCount++;
        }
      });
      
      console.log(`✅ Database migration completed: ${migratedCount} books updated`);
      
    } catch (error) {
      console.error('Error migrating database schema:', error);
    }
  }

  // تحميل محتوى واحد وتخزينه محلياً - محسن
  async downloadContent(contentItem, options = {}) {
    const {
      priority = 'normal', // high, normal, low
      retryCount = 3,
      onProgress = null,
      forceRedownload = false
    } = options;

    try {
      if (!this.isInitialized) {
        throw new Error('OfflineContentService not initialized');
      }

      // التحقق من الاتصال بالإنترنت
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        throw new Error('No internet connection');
      }

      // التحقق من وجود URL صالح
      if (!contentItem.bookUrl || !contentItem.bookUrl.startsWith('http')) {
        throw new Error(`Invalid URL for content: ${contentItem.bookName}`);
      }

      const contentId = contentItem.id;
      
      // تحقق من وجود تحميل جاري
      if (this.downloadQueue.has(contentId)) {
        console.log(`⚠️ Content already downloading: ${contentItem.bookName}`);
        return this.downloadQueue.get(contentId);
      }

      // إنشاء promise للتحميل
      const downloadPromise = this._performDownload(contentItem, {
        retryCount,
        onProgress,
        forceRedownload
      });
      
      // إضافة للقائمة
      this.downloadQueue.set(contentId, downloadPromise);
      
      const result = await downloadPromise;
      
      // إزالة من القائمة بعد الانتهاء
      this.downloadQueue.delete(contentId);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Download failed for ${contentItem.bookName}:`, error);
      
      // تحديث حالة الخطأ في Realm
      await this._updateContentStatus(contentItem.id, {
        downloadStatus: 'failed',
        lastDownloadError: error.message,
        downloadAttempts: (contentItem.downloadAttempts || 0) + 1
      });
      
      throw error;
    }
  }

  // التحميل الفعلي للمحتوى - محسن مع مهلة أطول
  async _performDownload(contentItem, options) {
    const { retryCount, onProgress, forceRedownload } = options;
    
    // انتظار دور التحميل حسب الأولوية
    await this._waitForDownloadSlot();
    
    try {
      this.activeDownloads++;
      
      // تحديث حالة البداية
      await this._updateContentStatus(contentItem.id, {
        downloadStatus: 'downloading',
        downloadProgress: 0,
        lastDownloadError: '',
        isContentAvailable: false, // تأكيد أن المحتوى غير متاح حتى اكتمال التحميل
        isFullyOffline: false
      });

      // إنشاء اسم ملف فريد
      const fileName = this._generateFileName(contentItem);
      const filePath = this.contentDirectory + fileName;
      
      // حذف الملف القديم إذا كان موجوداً وطُلب إعادة التحميل
      if (forceRedownload) {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(filePath);
        }
      }

      // بدء التحميل مع معالجة التقدم
      const downloadResumable = FileSystem.createDownloadResumable(
        contentItem.bookUrl,
        filePath,
        {
          headers: {
            'User-Agent': 'HudaLibrary/1.0 (Offline-First)',
            'Accept': this._getAcceptHeader(contentItem.contentType)
          }
        },
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          
          // تحديث التقدم في Realm
          this._updateContentStatus(contentItem.id, {
            downloadProgress: progress
          });
          
          // استدعاء callback إذا كان متوفراً
          if (onProgress) {
            onProgress(progress);
          }
        }
      );

      // تحميل مع مهلة أطول بكثير - محسن للملفات الكبيرة
      const timeoutDuration = this._getExtendedTimeoutForContentType(contentItem.contentType);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Download timeout after ${timeoutDuration / 60000} minutes`)), timeoutDuration);
      });

      console.log(`⏱️ Starting download with ${timeoutDuration / 60000} minutes timeout for ${contentItem.bookName}`);

      const { uri: downloadedPath } = await Promise.race([
        downloadResumable.downloadAsync(),
        timeoutPromise
      ]);

      // التحقق من سلامة الملف المحمل
      const fileInfo = await FileSystem.getInfoAsync(downloadedPath);
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('Downloaded file is empty or corrupted');
      }

      console.log(`✅ File downloaded successfully: ${contentItem.bookName} (${fileInfo.size} bytes)`);

      // إنشاء hash للملف للتحقق من السلامة
      const fileHash = await this._generateFileHash(downloadedPath);
      
      // تحديث معلومات المحتوى في Realm - محسن مع تحقق إضافي
      await this._updateContentStatus(contentItem.id, {
        downloadStatus: 'downloaded',
        downloadProgress: 1.0,
        localFilePath: downloadedPath,
        localFileName: fileName,
        localFileSize: fileInfo.size,
        fileHash: fileHash,
        isContentAvailable: true,
        isFullyOffline: true,
        contentCachedAt: new Date(),
        contentVerifiedAt: new Date(),
        downloadedAt: new Date(),
        lastDownloadError: ''
      });

      // تحقق إضافي من اكتمال التحميل
      const isComplete = await this.isDownloadComplete(contentItem.id);
      if (!isComplete) {
        throw new Error('Download verification failed - file may be corrupted');
      }

      console.log(`✅ Content downloaded and verified successfully: ${contentItem.bookName}`);
      
      // إضافة إلى إحصائيات التخزين
      await this._updateStorageStats();
      
      return {
        success: true,
        filePath: downloadedPath,
        fileSize: fileInfo.size
      };
      
    } catch (error) {
      // في حالة فشل التحميل، تأكد من عدم عرض المحتوى كمحمل
      await this._updateContentStatus(contentItem.id, {
        isContentAvailable: false,
        isFullyOffline: false,
        downloadStatus: 'failed',
        downloadProgress: 0,
        lastDownloadError: error.message
      });
      
      throw error;
    } finally {
      this.activeDownloads--;
    }
  }

  // انتظار دور التحميل
  async _waitForDownloadSlot() {
    while (this.activeDownloads >= this.downloadConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // إنشاء اسم ملف فريد وآمن
  _generateFileName(contentItem) {
    const sanitizedName = contentItem.bookName
      .replace(/[^\w\d\-_\u0600-\u06FF]/g, '_')
      .substring(0, 50);
    
    const extension = this._getFileExtension(contentItem.contentType);
    const timestamp = Date.now();
    
    return `${sanitizedName}_${contentItem.id}_${timestamp}${extension}`;
  }

  // الحصول على امتداد الملف المناسب
  _getFileExtension(contentType) {
    switch (contentType) {
      case 'video': return '.mp4';
      case 'audio': return '.m4a';
      default: return '.pdf';
    }
  }

  // الحصول على Accept header المناسب
  _getAcceptHeader(contentType) {
    switch (contentType) {
      case 'video': return 'video/mp4,video/*';
      case 'audio': return 'audio/mpeg,audio/mp4,audio/*';
      default: return 'application/pdf,*/*';
    }
  }

  // الحصول على مهلة ممتدة لنوع المحتوى - محسن للملفات الكبيرة جداً
  _getExtendedTimeoutForContentType(contentType) {
    switch (contentType) {
      case 'video': return 28800000; // 8 ساعات للفيديو (الملفات الكبيرة جداً)
      case 'audio': return 14400000;  // 4 ساعة للصوت
      default: return 7200000;       // 2 ساعة للكتب
    }
  }

  // الحصول على timeout مناسب لنوع المحتوى - محسن للملفات الكبيرة جداً
  _getTimeoutForContentType(contentType) {
    switch (contentType) {
      case 'video': return 28800000; // 8 ساعات للفيديو (الملفات الكبيرة جداً)
      case 'audio': return 14400000;  // 4 ساعة للصوت
      default: return 7200000;       // 2 ساعة للكتب
    }
  }

  // إنشاء hash للملف
  async _generateFileHash(filePath) {
    try {
      // قراءة الملف وإنشاء hash
      const fileUri = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
        length: 1024 // قراءة أول 1KB فقط للسرعة
      });
      
      return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        fileUri,
        { encoding: Crypto.CryptoEncoding.HEX }
      );
    } catch (error) {
      console.warn('Warning: Could not generate file hash:', error);
      return '';
    }
  }

  // تحديث حالة المحتوى في Realm - محسن للتعامل مع قاعدة البيانات القديمة
  async _updateContentStatus(contentId, updates) {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      this.realm.write(() => {
        const content = this.realm.objectForPrimaryKey('Book', contentId);
        if (content) {
          // التحقق من وجود الحقول قبل تحديثها
          Object.keys(updates).forEach(key => {
            if (key in content) {
              content[key] = updates[key];
            } else {
              console.warn(`Field ${key} not found in Book schema, skipping update`);
            }
          });
        }
      });
    } catch (error) {
      console.error('Error updating content status:', error);
    }
  }

  // التحقق من سلامة المحتوى الموجود - محسن للتعامل مع قاعدة البيانات القديمة
  async verifyExistingContent() {
    try {
      if (!this.realm || this.realm.isClosed) return;
      
      // التحقق من وجود الحقول الجديدة
      const testBooks = this.realm.objects('Book');
      const hasNewFields = testBooks.length > 0 && 'isContentAvailable' in testBooks[0];
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema not ready for content verification');
        return;
      }
      
      const content = this.realm.objects('Book').filtered('isContentAvailable == true');
      let verifiedCount = 0;
      let removedCount = 0;
      
      console.log(`🔍 Verifying ${content.length} existing content files...`);
      
      for (const item of content) {
        if (item.localFilePath) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(item.localFilePath);
            
            if (fileInfo.exists && fileInfo.size > 0) {
              // الملف موجود - تحديث تاريخ التحقق
              await this._updateContentStatus(item.id, {
                contentVerifiedAt: new Date(),
                localFileSize: fileInfo.size
              });
              verifiedCount++;
            } else {
              // الملف مفقود - تحديث الحالة
              await this._updateContentStatus(item.id, {
                isContentAvailable: false,
                isFullyOffline: false,
                downloadStatus: 'not_downloaded',
                localFilePath: '',
                localFileName: '',
                localFileSize: 0
              });
              removedCount++;
            }
          } catch (error) {
            console.warn(`Warning: Could not verify file ${item.localFilePath}:`, error);
            // في حالة الخطأ، نفترض أن الملف مفقود
            await this._updateContentStatus(item.id, {
              isContentAvailable: false,
              isFullyOffline: false,
              downloadStatus: 'not_downloaded',
              localFilePath: '',
              localFileName: '',
              localFileSize: 0
            });
            removedCount++;
          }
        }
      }
      
      console.log(`🔍 Content verification: ${verifiedCount} verified, ${removedCount} removed`);
      
    } catch (error) {
      console.error('Error verifying existing content:', error);
    }
  }

  // تنظيف المحتوى المنتهي الصلاحية - محسن للتعامل مع قاعدة البيانات القديمة
  async cleanupExpiredContent() {
    try {
      // حذف الملفات القديمة (أكثر من 30 يوم بدون استخدام)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      if (!this.realm || this.realm.isClosed) return;
      
      // التحقق من وجود الحقول الجديدة
      const testBooks = this.realm.objects('Book');
      const hasNewFields = testBooks.length > 0 && 
        'isContentAvailable' in testBooks[0] && 
        'lastAccessedAt' in testBooks[0];
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema not ready for content cleanup');
        return;
      }
      
      const expiredContent = this.realm.objects('Book').filtered(
        'lastAccessedAt < $0 AND isContentAvailable == true',
        thirtyDaysAgo
      );
      
      let cleanedCount = 0;
      
      for (const item of expiredContent) {
        if (item.localFilePath) {
          try {
            await FileSystem.deleteAsync(item.localFilePath, { idempotent: true });
            
            await this._updateContentStatus(item.id, {
              isContentAvailable: false,
              isFullyOffline: false,
              downloadStatus: 'not_downloaded',
              localFilePath: '',
              localFileName: '',
              localFileSize: 0
            });
            
            cleanedCount++;
          } catch (error) {
            console.warn(`Warning: Could not delete file ${item.localFilePath}:`, error);
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired content files`);
      }
      
    } catch (error) {
      console.error('Error cleaning up expired content:', error);
    }
  }

  // معالج التحميل التلقائي في الخلفية - محسن
  startAutoDownloadProcessor() {
    // تشغيل معالج كل 10 ثوانٍ (بدلاً من 5)
    setInterval(async () => {
      await this._processAutoDownloadQueue();
    }, 10000);
  }

  // معالجة قائمة التحميل التلقائي - محسن للتعامل مع قاعدة البيانات القديمة
  async _processAutoDownloadQueue() {
    try {
      // التحقق من تفعيل التحميل التلقائي
      const autoDownloadEnabled = await this._getAutoDownloadSetting();
      if (!autoDownloadEnabled) {
        return; // التحميل التلقائي غير مفعل
      }

      if (this.activeDownloads >= this.downloadConcurrency) {
        return; // التحميلات ممتلئة
      }

      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return; // لا يوجد إنترنت
      }

      // العثور على محتوى يحتاج تحميل
      if (!this.realm || this.realm.isClosed) return;
      
      // التحقق من وجود الحقول الجديدة
      const testBooks = this.realm.objects('Book');
      const hasNewFields = testBooks.length > 0 && 
        'downloadAttempts' in testBooks[0] && 
        'downloadStatus' in testBooks[0];
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema not ready for auto download');
        return;
      }
      
      const pendingContent = this.realm.objects('Book').filtered(
        'downloadStatus == "not_downloaded" AND bookUrl != "" AND downloadAttempts < 3'
      ).sorted('createdAt', false); // الأحدث أولاً

      const slotsAvailable = this.downloadConcurrency - this.activeDownloads;
      const contentToDownload = Array.from(pendingContent).slice(0, slotsAvailable);

      for (const content of contentToDownload) {
        // التحميل بدون انتظار لعدم حجب المعالج
        this.downloadContent(content, {
          priority: 'low',
          onProgress: null
        }).catch(error => {
          console.log(`Background download failed for ${content.bookName}:`, error.message);
        });
      }

    } catch (error) {
      console.error('Error in auto download processor:', error);
    }
  }

  // الحصول على المحتوى المتاح محلياً - محسن للتعامل مع قاعدة البيانات القديمة
  async getOfflineContent() {
    try {
      if (!this.realm || this.realm.isClosed) return [];
      
      // التحقق من وجود الحقول الجديدة
      const testBooks = this.realm.objects('Book');
      const hasNewFields = testBooks.length > 0 && 
        'isContentAvailable' in testBooks[0] && 
        'isFullyOffline' in testBooks[0];
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema not ready for offline content');
        return [];
      }
      
      const offlineContent = this.realm.objects('Book').filtered(
        'isContentAvailable == true AND isFullyOffline == true'
      );
      
      return Array.from(offlineContent).map(item => ({
        id: item.id,
        bookName: item.bookName,
        contentType: item.contentType,
        localFilePath: item.localFilePath,
        fileSize: item.localFileSize,
        lastAccessedAt: item.lastAccessedAt,
        mainCategory: item.mainCategory,
        subCategory: item.subCategory,
        subSubCategory: item.subSubCategory
      }));
      
    } catch (error) {
      console.error('Error getting offline content:', error);
      return [];
    }
  }

  // التحقق من اكتمال التحميل - محسن للتعامل مع قاعدة البيانات القديمة
  async isDownloadComplete(contentId) {
    try {
      if (!this.realm || this.realm.isClosed) return false;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      if (!content) return false;
      
      // التحقق من وجود الحقول الجديدة
      const hasNewFields = 'downloadStatus' in content && 'isContentAvailable' in content;
      
      if (!hasNewFields) {
        console.log('⚠️ Database schema not ready for download completion check');
        return false;
      }
      
      // التحقق من الحالة في قاعدة البيانات
      if (content.downloadStatus !== 'downloaded' || !content.isContentAvailable) {
        return false;
      }
      
      // التحقق من وجود الملف فعلياً
      if (!content.localFilePath) {
        return false;
      }
      
      const fileInfo = await FileSystem.getInfoAsync(content.localFilePath);
      if (!fileInfo.exists || fileInfo.size === 0) {
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error('Error checking download completion:', error);
      return false;
    }
  }

  // تحديث إحصائيات التخزين
  async _updateStorageStats() {
    try {
      const offlineContent = await this.getOfflineContent();
      const totalSize = offlineContent.reduce((sum, item) => sum + (item.fileSize || 0), 0);
      
      await AsyncStorage.setItem('offline_content_stats', JSON.stringify({
        totalFiles: offlineContent.length,
        totalSize: totalSize,
        lastUpdated: new Date().toISOString()
      }));
      
    } catch (error) {
      console.error('Error updating storage stats:', error);
    }
  }

  // الحصول على إحصائيات التخزين
  async getStorageStats() {
    try {
      const stats = await AsyncStorage.getItem('offline_content_stats');
      return stats ? JSON.parse(stats) : {
        totalFiles: 0,
        totalSize: 0,
        lastUpdated: null
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalFiles: 0, totalSize: 0, lastUpdated: null };
    }
  }

  // حذف محتوى معين
  async deleteContent(contentId) {
    try {
      if (!this.realm || this.realm.isClosed) return false;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      if (!content || !content.localFilePath) {
        return false;
      }

      // حذف الملف من النظام
      await FileSystem.deleteAsync(content.localFilePath, { idempotent: true });
      
      // تحديث حالة المحتوى
      await this._updateContentStatus(contentId, {
        isContentAvailable: false,
        isFullyOffline: false,
        downloadStatus: 'not_downloaded',
        localFilePath: '',
        localFileName: '',
        localFileSize: 0,
        downloadProgress: 0
      });
      
      // تحديث الإحصائيات
      await this._updateStorageStats();
      
      console.log(`🗑️ Content deleted: ${content.bookName}`);
      return true;
      
    } catch (error) {
      console.error('Error deleting content:', error);
      return false;
    }
  }

  // تسجيل وصول للمحتوى - محسن للتعامل مع قاعدة البيانات القديمة
  async recordAccess(contentId) {
    try {
      const updates = {};
      
      // التحقق من وجود الحقول قبل تحديثها
      if (await this._hasField(contentId, 'lastAccessedAt')) {
        updates.lastAccessedAt = new Date();
      }
      
      if (await this._hasField(contentId, 'viewCount')) {
        const currentViewCount = await this._getContentField(contentId, 'viewCount') || 0;
        updates.viewCount = currentViewCount + 1;
      }
      
      if (Object.keys(updates).length > 0) {
        await this._updateContentStatus(contentId, updates);
      }
    } catch (error) {
      console.error('Error recording access:', error);
    }
  }

  // التحقق من وجود حقل معين في الكائن
  async _hasField(contentId, fieldName) {
    try {
      if (!this.realm || this.realm.isClosed) return false;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      return content && fieldName in content;
    } catch (error) {
      return false;
    }
  }

  // الحصول على قيمة حقل معين
  async _getContentField(contentId, fieldName) {
    try {
      if (!this.realm || this.realm.isClosed) return null;
      
      const content = this.realm.objectForPrimaryKey('Book', contentId);
      return content ? content[fieldName] : null;
    } catch (error) {
      return null;
    }
  }

  // الحصول على إعدادات التحميل التلقائي
  async _getAutoDownloadSetting() {
    try {
      const settings = await AsyncStorage.getItem('autoDownloadSettings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        return parsedSettings.enabled || false;
      }
      return false; // الافتراضي معطل
    } catch (error) {
      console.error('Error getting auto download setting:', error);
      return false; // في حالة الخطأ، نفترض أنه معطل
    }
  }
}

// إنشاء مثيل واحد من الخدمة
const offlineContentService = new OfflineContentService();
export default offlineContentService; 