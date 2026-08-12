/**
 * مدخل قاعدة البيانات الرئيسي - Database Main Entry Point
 * يوفر واجهة موحدة للوصول إلى قاعدة البيانات المحترفة
 */

import { DatabaseManager } from './core/DatabaseManager';
import { Models, Schemas, ModelNames } from './models';
import { getCurrentConfig } from './config/RealmConfig';
import { getRealm as getOldRealm } from './realmConfig';

// إنشاء instance مدير قاعدة البيانات
const dbManager = new DatabaseManager();

// متغيرات التحكم في التهيئة
let isInitialized = false;
let initializationPromise = null;

/**
 * تهيئة قاعدة البيانات المحترفة
 */
export const initializeDatabase = async () => {
  if (isInitialized) {
    return dbManager.getInstance();
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = dbManager.initialize();
  
  try {
    const realm = await initializationPromise;
    isInitialized = true;
    console.log('✅ تم تهيئة قاعدة البيانات المحترفة بنجاح');
    return realm;
  } catch (error) {
    console.error('❌ خطأ في تهيئة قاعدة البيانات المحترفة:', error);
    initializationPromise = null;
    throw error;
  }
};

/**
 * الحصول على instance قاعدة البيانات (متوافق مع النظام القديم)
 */
export const getRealm = async () => {
  try {
    // محاولة استخدام النظام الجديد
    if (isInitialized) {
      return dbManager.getInstance();
    }
    
    // تهيئة النظام الجديد
    return await initializeDatabase();
  } catch (error) {
    console.warn('⚠️ فشل في استخدام النظام الجديد، العودة للنظام القديم:', error);
    // العودة للنظام القديم في حالة الفشل
    return await getOldRealm();
  }
};

/**
 * الحصول على مدير قاعدة البيانات
 */
export const getDatabaseManager = () => {
  return dbManager;
};

/**
 * عمليات الكتابة الآمنة
 */
export const safeWrite = async (callback) => {
  try {
    if (isInitialized) {
      return await dbManager.safeWrite(callback);
    }
    
    // استخدام النظام القديم
    const realm = await getRealm();
    return new Promise((resolve, reject) => {
      try {
        let result;
        realm.write(() => {
          result = callback(realm);
        });
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.error('❌ خطأ في عملية الكتابة:', error);
    throw error;
  }
};

/**
 * عمليات القراءة الآمنة
 */
export const safeRead = async (callback) => {
  try {
    if (isInitialized) {
      return await dbManager.safeRead(callback);
    }
    
    // استخدام النظام القديم
    const realm = await getRealm();
    return callback(realm);
  } catch (error) {
    console.error('❌ خطأ في عملية القراءة:', error);
    throw error;
  }
};

/**
 * تنفيذ عمليات batch
 */
export const batchWrite = async (operations) => {
  try {
    if (isInitialized) {
      return await dbManager.batchWrite(operations);
    }
    
    // تنفيذ بسيط للنظام القديم
    const realm = await getRealm();
    return new Promise((resolve, reject) => {
      try {
        const results = [];
        realm.write(() => {
          operations.forEach(operation => {
            results.push(operation(realm));
          });
        });
        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.error('❌ خطأ في عمليات batch:', error);
    throw error;
  }
};

/**
 * إحصائيات قاعدة البيانات
 */
export const getDatabaseStats = async () => {
  try {
    if (isInitialized) {
      return dbManager.getStats();
    }
    
    // إحصائيات بسيطة للنظام القديم
    const realm = await getRealm();
    return {
      totalBooks: realm.objects('Book').length,
      totalCategories: realm.objects('Category').length,
      totalUsage: realm.objects('ContentUsage').length,
      databaseSize: 'غير متاح',
      lastUpdate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ خطأ في الحصول على الإحصائيات:', error);
    return null;
  }
};

/**
 * تنظيف قاعدة البيانات
 */
export const cleanup = async () => {
  try {
    if (isInitialized) {
      await dbManager.cleanup();
    }
    
    // تنظيف النظام القديم
    const { cleanupRealm } = await import('./realmConfig');
    cleanupRealm();
    
    isInitialized = false;
    initializationPromise = null;
    
    console.log('✅ تم تنظيف قاعدة البيانات');
  } catch (error) {
    console.error('❌ خطأ في تنظيف قاعدة البيانات:', error);
  }
};

/**
 * إعادة تشغيل قاعدة البيانات
 */
export const restart = async () => {
  try {
    await cleanup();
    return await initializeDatabase();
  } catch (error) {
    console.error('❌ خطأ في إعادة تشغيل قاعدة البيانات:', error);
    throw error;
  }
};

/**
 * التحقق من حالة قاعدة البيانات
 */
export const isConnected = () => {
  return isInitialized && dbManager.isConnected();
};

/**
 * إضافة مستمع للأحداث
 */
export const addEventListener = (event, callback) => {
  if (isInitialized) {
    dbManager.addEventListener(event, callback);
  }
};

/**
 * إزالة مستمع الأحداث
 */
export const removeEventListener = (event, callback) => {
  if (isInitialized) {
    dbManager.removeEventListener(event, callback);
  }
};

// تصدير النماذج والمخططات للاستخدام المباشر
export { Models, Schemas, ModelNames };

// تصدير النماذج القديمة للتوافق
export { 
  Book, 
  Category, 
  ContentUsage, 
  AppStats, 
  SyncStatus 
} from './realmConfig';

// تصدير النماذج الجديدة
export {
  Category as NewCategory,
  Book as NewBook,
  Subcategory,
  Lesson,
  ContentStats,
  BaseModel
} from './models';

// تصدير الإعدادات
export { getCurrentConfig } from './config/RealmConfig';

export default {
  initialize: initializeDatabase,
  getRealm,
  getDatabaseManager,
  safeWrite,
  safeRead,
  batchWrite,
  getDatabaseStats,
  cleanup,
  restart,
  isConnected,
  addEventListener,
  removeEventListener,
  Models,
  Schemas,
  ModelNames,
}; 