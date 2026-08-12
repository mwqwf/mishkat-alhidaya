import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

class FileManager {
  constructor() {
    this.fileCache = new Map();
    this.lastCacheUpdate = 0;
    this.cacheValidityTime = 30000; // 30 seconds
    this.isChecking = false;
    this.pendingChecks = [];
  }

  // فحص الملفات بطريقة غير متزامنة ومحسنة
  async checkFilesOptimized(items, options = {}) {
    const {
      maxConcurrent = 5,
      batchSize = 10,
      useCache = true,
      onProgress = null
    } = options;

    // منع التشغيل المتزامن
    if (this.isChecking) {
      console.log('🔄 File check already in progress, queuing...');
      return new Promise((resolve) => {
        this.pendingChecks.push(resolve);
      });
    }

    this.isChecking = true;
    
    try {
      console.log(`🔍 Starting optimized file check for ${items.length} items`);
      
      // استخدام الـ cache إذا كان حديث
      if (useCache && this.isCacheValid()) {
        console.log('📄 Using cached file results');
        const cachedResults = this.getCachedResults(items);
        if (Object.keys(cachedResults).length > 0) {
          return cachedResults;
        }
      }

      const results = {};
      const batches = this.createBatches(items, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // معالجة الدفعة بالتوازي المحدود
        const batchPromises = batch.map((item, index) => 
          this.checkSingleFileWithDelay(item, index * 50) // تأخير 50ms بين الملفات
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // دمج النتائج
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            Object.assign(results, result.value);
          }
        });
        
        // تقرير التقدم
        if (onProgress) {
          const progress = Math.round(((i + 1) / batches.length) * 100);
          onProgress(progress);
        }
        
        // تأخير بين الدفعات لمنع حجب UI
        if (i < batches.length - 1) {
          await this.delay(100);
        }
      }
      
      // تحديث الـ cache
      this.updateCache(results);
      
      console.log(`✅ File check completed: ${Object.keys(results).length} files found`);
      
      // تنفيذ المهام المؤجلة
      this.processPendingChecks(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error in optimized file check:', error);
      this.processPendingChecks({});
      throw error;
    } finally {
      this.isChecking = false;
    }
  }

  async checkSingleFileWithDelay(item, delay = 0) {
    if (delay > 0) {
      await this.delay(delay);
    }
    
    return this.checkSingleFile(item);
  }

  async checkSingleFile(item) {
    try {
      const fileName = this.generateFileName(item);
      const fileUri = FileSystem.documentDirectory + fileName;
      
      // استخدام getInfoAsync بدلاً من readDirectoryAsync للأداء
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (fileInfo.exists && fileInfo.size > 100) {
        return {
          [item.id]: {
            uri: fileUri,
            name: item.bookName,
            type: item.contentType || 'book',
            size: fileInfo.size,
            lastModified: fileInfo.modificationTime
          }
        };
      }
      
      return null;
    } catch (error) {
      // تجاهل أخطاء الملفات الفردية
      console.warn(`⚠️ Could not check file for ${item.bookName}:`, error.message);
      return null;
    }
  }

  generateFileName(item) {
    const baseName = this.sanitizeFileName(item.bookName || item.id);
    
    if (item.contentType === 'video' || item.contentType === 'audio') {
      return baseName;
    } else {
      return baseName + '.pdf';
    }
  }

  sanitizeFileName(name) {
    return (name || 'file').replace(/[^\w\d\-_\.]/g, '_');
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // إدارة الـ Cache
  isCacheValid() {
    return Date.now() - this.lastCacheUpdate < this.cacheValidityTime;
  }

  getCachedResults(items) {
    const results = {};
    items.forEach(item => {
      if (this.fileCache.has(item.id)) {
        results[item.id] = this.fileCache.get(item.id);
      }
    });
    return results;
  }

  updateCache(results) {
    Object.entries(results).forEach(([id, fileInfo]) => {
      this.fileCache.set(id, fileInfo);
    });
    this.lastCacheUpdate = Date.now();
  }

  clearCache() {
    this.fileCache.clear();
    this.lastCacheUpdate = 0;
  }

  processPendingChecks(results) {
    const callbacks = this.pendingChecks.splice(0);
    callbacks.forEach(callback => callback(results));
  }

  // فحص سريع لملف واحد
  async quickCheckFile(item) {
    const cachedResult = this.fileCache.get(item.id);
    if (cachedResult && this.isCacheValid()) {
      return cachedResult;
    }
    
    const result = await this.checkSingleFile(item);
    if (result && result[item.id]) {
      this.fileCache.set(item.id, result[item.id]);
      return result[item.id];
    }
    
    return null;
  }

  // حذف ملف مع تنظيف الـ cache
  async deleteFile(item) {
    try {
      const fileName = this.generateFileName(item);
      const fileUri = FileSystem.documentDirectory + fileName;
      
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(fileUri);
        console.log(`✅ File deleted: ${fileName}`);
      }
      
      // إزالة من الـ cache
      this.fileCache.delete(item.id);
      
      // إزالة من AsyncStorage
      await AsyncStorage.removeItem(`downloaded_${fileName}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error deleting file for ${item.bookName}:`, error);
      return false;
    }
  }

  // إحصائيات الـ cache
  getCacheStats() {
    return {
      size: this.fileCache.size,
      lastUpdate: this.lastCacheUpdate,
      isValid: this.isCacheValid(),
      validityTime: this.cacheValidityTime
    };
  }
}

// إنشاء مثيل واحد للاستخدام العالمي
const fileManager = new FileManager();

export default fileManager; 