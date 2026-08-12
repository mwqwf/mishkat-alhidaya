/**
 * إعدادات قاعدة البيانات المحلية - Realm Configuration
 * يحتوي على جميع الإعدادات والمايجريشن المطلوبة
 */

// إعدادات البيئة
const REALM_CONFIG = {
  development: {
    schemaVersion: 4,
    path: 'hudalibrary_dev.realm',
    deleteRealmIfMigrationNeeded: false,
    shouldCompactOnLaunch: (totalBytes, usedBytes) => {
      // ضغط قاعدة البيانات إذا كانت أكبر من 100MB وأقل من 50% استخدام
      const oneHundredMB = 100 * 1024 * 1024;
      return (totalBytes > oneHundredMB) && (usedBytes / totalBytes) < 0.5;
    },
  },
  production: {
    schemaVersion: 4,
    path: 'hudalibrary.realm',
    deleteRealmIfMigrationNeeded: false,
    shouldCompactOnLaunch: (totalBytes, usedBytes) => {
      const oneHundredMB = 100 * 1024 * 1024;
      return (totalBytes > oneHundredMB) && (usedBytes / totalBytes) < 0.5;
    },
  },
};

// إعدادات الأداء
const PERFORMANCE_CONFIG = {
  // حد أقصى للنتائج في الاستعلامات
  MAX_QUERY_RESULTS: 1000,
  // حد أقصى للعمليات في الـ batch
  MAX_BATCH_SIZE: 100,
  // مهلة زمنية للعمليات الطويلة (زيادة لدعم الملفات الكبيرة)
  OPERATION_TIMEOUT: 120000, // 2 دقيقة
  // إعدادات الذاكرة المؤقتة
  CACHE_SIZE: 50,
};

// إعدادات المزامنة
const SYNC_CONFIG = {
  // فترة المزامنة التلقائية (بالدقائق)
  AUTO_SYNC_INTERVAL: 30,
  // حد أقصى للمحاولات عند فشل المزامنة
  MAX_SYNC_RETRIES: 3,
  // مهلة زمنية للمزامنة (زيادة لدعم الملفات الكبيرة)
  SYNC_TIMEOUT: 300000, // 5 دقائق
  // حجم الدفعة في المزامنة
  SYNC_BATCH_SIZE: 50,
};

/**
 * دالة المايجريشن المتقدمة
 * تتعامل مع جميع إصدارات قاعدة البيانات بذكاء
 */
const performMigration = (oldRealm, newRealm) => {
  console.log(`🔄 بدء المايجريشن من الإصدار ${oldRealm.schemaVersion} إلى ${newRealm.schemaVersion}`);
  
  try {
    // مايجريشن من الإصدار 1 إلى 2
    if (oldRealm.schemaVersion < 2) {
      console.log('📦 مايجريشن الإصدار 2: إضافة حقول جديدة للكتب');
      
      const oldBooks = oldRealm.objects('Book');
      const newBooks = newRealm.objects('Book');
      
      for (let i = 0; i < oldBooks.length; i++) {
        const oldBook = oldBooks[i];
        const newBook = newBooks[i];
        
        // إضافة حقول جديدة مع قيم افتراضية
        newBook.downloadedAt = oldBook.downloadedAt || null;
        newBook.lastAccessedAt = oldBook.lastAccessedAt || null;
        newBook.fileSize = oldBook.fileSize || 0;
        newBook.isBookmarked = oldBook.isBookmarked || false;
      }
    }
    
    // مايجريشن من الإصدار 2 إلى 3
    if (oldRealm.schemaVersion < 3) {
      console.log('📦 مايجريشن الإصدار 3: إعادة هيكلة الأقسام');
      
      const oldCategories = oldRealm.objects('Category');
      const newCategories = newRealm.objects('Category');
      
      for (let i = 0; i < oldCategories.length; i++) {
        const oldCategory = oldCategories[i];
        const newCategory = newCategories[i];
        
        // تحديث هيكل الأقسام
        newCategory.sortOrder = oldCategory.sortOrder || i;
        newCategory.isActive = oldCategory.isActive !== undefined ? oldCategory.isActive : true;
        newCategory.description = oldCategory.description || '';
      }
    }
    
    // مايجريشن من الإصدار 3 إلى 4
    if (oldRealm.schemaVersion < 4) {
      console.log('📦 مايجريشن الإصدار 4: إضافة جداول الإحصائيات');
      
      // إنشاء إحصائيات افتراضية للمحتوى الموجود
      const books = newRealm.objects('Book');
      const lessons = newRealm.objects('Lesson');
      
      books.forEach(book => {
        // إنشاء إحصائية للكتاب إذا لم تكن موجودة
        const existingStat = newRealm.objects('ContentStats').filtered('contentId == $0', book._id);
        if (existingStat.length === 0) {
          newRealm.create('ContentStats', {
            _id: `stat_${book._id}`,
            contentId: book._id,
            contentType: 'book',
            viewCount: 0,
            totalViewTime: 0,
            lastViewedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
      
      lessons.forEach(lesson => {
        // إنشاء إحصائية للدرس إذا لم تكن موجودة
        const existingStat = newRealm.objects('ContentStats').filtered('contentId == $0', lesson._id);
        if (existingStat.length === 0) {
          newRealm.create('ContentStats', {
            _id: `stat_${lesson._id}`,
            contentId: lesson._id,
            contentType: 'lesson',
            viewCount: 0,
            totalViewTime: 0,
            lastViewedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
    }
    
    console.log('✅ تم إكمال المايجريشن بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في المايجريشن:', error);
    throw error;
  }
};

/**
 * دالة التحقق من صحة الإعدادات
 */
const validateConfig = (config) => {
  const requiredFields = ['schemaVersion', 'path'];
  
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`حقل الإعداد المطلوب مفقود: ${field}`);
    }
  }
  
  if (typeof config.schemaVersion !== 'number' || config.schemaVersion < 1) {
    throw new Error('إصدار المخطط يجب أن يكون رقماً أكبر من 0');
  }
  
  return true;
};

/**
 * الحصول على إعدادات البيئة الحالية
 */
const getCurrentConfig = () => {
  const environment = __DEV__ ? 'development' : 'production';
  const config = REALM_CONFIG[environment];
  
  validateConfig(config);
  
  return {
    ...config,
    migration: performMigration,
  };
};

export {
  REALM_CONFIG,
  PERFORMANCE_CONFIG,
  SYNC_CONFIG,
  getCurrentConfig,
  performMigration,
  validateConfig,
}; 