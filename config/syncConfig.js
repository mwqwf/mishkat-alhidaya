// إعدادات المزامنة
export const SYNC_CONFIG = {
  BOOKS_SYNC_INTERVAL: 5 * 60 * 1000, // 5 دقائق (تقليل التكرار)
  CATEGORIES_SYNC_INTERVAL: 10 * 60 * 1000, // 10 دقائق (تقليل التكرار)
  MIN_BOOKS_FOR_OFFLINE: 0, // أي عدد من الكتب - الاعتماد على Realm دائماً
  MIN_CATEGORIES_FOR_OFFLINE: 0, // أي عدد من الأقسام - الاعتماد على Realm دائماً
  MAX_RETRIES: 3,
  BATCH_SIZE: 50, // حجم أصغر للباتش لسرعة أكبر
  TIMEOUT: 30000, // 30 ثانية (مهلة أطول للشبكات الضعيفة)
  
  // إعدادات جديدة للعمل Offline-First
  OFFLINE_FIRST_PRIORITY: true, // إعطاء الأولوية لبيانات Realm
  BACKGROUND_SYNC_ENABLED: true, // تفعيل المزامنة الخلفية
  INITIAL_SYNC_TIMEOUT: 15000, // 15 ثانية للمزامنة الأولية (زيادة لدعم الملفات الكبيرة)
  ALLOW_EMPTY_REALM: true, // السماح بالعمل مع Realm فارغ
  
  // إعدادات جديدة للتحميل
  DOWNLOAD_TIMEOUT_VIDEO: 1800000, // 30 دقيقة للفيديو
  DOWNLOAD_TIMEOUT_AUDIO: 900000,  // 15 دقيقة للصوت
  DOWNLOAD_TIMEOUT_BOOK: 600000,   // 10 دقائق للكتب
  LARGE_FILE_THRESHOLD: 100 * 1024 * 1024, // 100MB كحد للملفات الكبيرة
};

// أدوات المزامنة
export const syncUtils = {
  // تسجيل أداء المزامنة
  logSyncPerformance: (operation, startTime, itemCount = 0) => {
    const endTime = new Date();
    const duration = endTime - startTime;
    console.log(`🔄 ${operation} completed in ${duration}ms${itemCount > 0 ? ` (${itemCount} items)` : ''}`);
  },

  // تسجيل حالة المزامنة
  logSyncStatus: (message, data = null) => {
    if (data) {
      console.log(`📊 ${message}:`, data);
    } else {
      console.log(`📊 ${message}`);
    }
  },

  // التحقق من الحاجة للمزامنة
  isSyncDue: (lastSyncTime, interval) => {
    if (!lastSyncTime) return true;
    const now = new Date();
    const timeDiff = now - lastSyncTime;
    return timeDiff >= interval;
  },

  // تحديد إذا كانت المزامنة مطلوبة (جديد)
  shouldSyncInBackground: (isOnline, hasLocalData) => {
    // لا تزامن إذا كنا غير متصلين
    if (!isOnline) return false;
    
    // إذا كان لدينا بيانات محلية، المزامنة اختيارية
    if (hasLocalData) return SYNC_CONFIG.BACKGROUND_SYNC_ENABLED;
    
    // إذا لم تكن لدينا بيانات محلية، المزامنة ضرورية
    return true;
  },

  // التحقق من حالة البيانات المحلية (جديد)
  hasMinimumData: (booksCount, categoriesCount) => {
    return booksCount >= SYNC_CONFIG.MIN_BOOKS_FOR_OFFLINE && 
           categoriesCount >= SYNC_CONFIG.MIN_CATEGORIES_FOR_OFFLINE;
  },

  // تأخير التنفيذ
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // إعادة المحاولة مع تأخير
  retryWithDelay: async (fn, maxRetries = SYNC_CONFIG.MAX_RETRIES, delay = 1000) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          console.log(`🔄 Retry ${i + 1}/${maxRetries} after ${delay}ms`);
          await syncUtils.delay(delay * (i + 1)); // تأخير متزايد
        }
      }
    }
    throw lastError;
  },

  // تنسيق حجم البيانات
  formatDataSize: (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // تنسيق الوقت
  formatDuration: (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}; 