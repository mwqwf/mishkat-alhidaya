import Realm from 'realm';
import Subcategory from './models/Subcategory';

// نموذج الكتاب
export class Book extends Realm.Object {
  static schema = {
    name: 'Book',
    primaryKey: 'id',
    properties: {
      id: 'string',
      bookName: { type: 'string', indexed: true },
      bookUrl: 'string',
      mainCategory: { type: 'string', indexed: true },
      subCategory: { type: 'string', indexed: true },
      subSubCategory: 'string?',
      contentType: { type: 'string', indexed: true },
      createdAt: { type: 'date', indexed: true },
      updatedAt: 'date?',
      lastSyncedAt: 'date?',
      isDeleted: { type: 'bool', default: false, indexed: true },
    },
  };
}

// نموذج الأقسام
export class Category extends Realm.Object {
  static schema = {
    name: 'Category',
    primaryKey: 'id', // تأكيد أن المفتاح الأساسي هو id
    properties: {
      id: 'string', // تأكيد أن الحقل هو id
      name: 'string',
      description: { type: 'string', default: '' },
      sortOrder: { type: 'int', default: 0 },
      isActive: { type: 'bool', default: true },
      mainCategory: { type: 'string', indexed: true },
      subCategory: { type: 'string', optional: true, indexed: true },
      subSubCategory: 'string?',
      createdAt: 'date',
      lastSyncedAt: 'date?',
      isDeleted: { type: 'bool', default: false, indexed: true },
      icon: { type: 'string', default: '' },
      color: { type: 'string', default: '#4A90E2' },
      totalSubcategories: { type: 'int', default: 0 },
      totalContent: { type: 'int', default: 0 },
      tags: { type: 'string', default: '' },
      metadata: { type: 'string', default: '{}' },
    },
  };
}

// نموذج تتبع الاستخدام والمشاهدات
export class ContentUsage extends Realm.Object {
  static schema = {
    name: 'ContentUsage',
    primaryKey: 'id',
    properties: {
      id: 'string',
      contentId: { type: 'string', indexed: true },
      contentName: 'string',
      contentType: { type: 'string', indexed: true },
      mainCategory: { type: 'string', indexed: true },
      subCategory: 'string?',
      subSubCategory: 'string?',
      viewCount: { type: 'int', default: 0, indexed: true },
      totalViewTime: { type: 'int', default: 0 }, // بالثواني
      lastViewedAt: { type: 'date', indexed: true },
      firstViewedAt: 'date',
      createdAt: 'date',
    },
  };
}

// نموذج الإحصائيات للكاش
export class AppStats extends Realm.Object {
  static schema = {
    name: 'AppStats',
    primaryKey: 'id',
    properties: {
      id: 'string',
      totalBooks: 'int',
      totalVideos: 'int',
      totalAudios: 'int',
      totalCategories: 'int',
      lastUpdated: 'date',
    },
  };
}

// نموذج آخر تحديث للمزامنة
export class SyncStatus extends Realm.Object {
  static schema = {
    name: 'SyncStatus',
    primaryKey: 'collection',
    properties: {
      collection: 'string', // 'books' أو 'categories'
      lastSyncedAt: 'date',
      isFirstSync: { type: 'bool', default: true },
    },
  };
}

// إعداد قاعدة البيانات
const realmConfig = {
  schema: [Book, Category, Subcategory, ContentUsage, AppStats, SyncStatus],
  schemaVersion: 7, // زيادة الإصدار لتوحيد primaryKey في Subcategory
  migration: (oldRealm, newRealm) => {
    // معالجة التحديثات المستقبلية للنماذج
    const oldSchemaVersion = oldRealm.schemaVersion;
    const newSchemaVersion = newRealm.schemaVersion;
    
    console.log(`Migrating Realm from version ${oldSchemaVersion} to ${newSchemaVersion}`);
    
    if (oldSchemaVersion < 2) {
      console.log('Migrating to schema version 2');
    }
    
    if (oldSchemaVersion < 3) {
      console.log('Migrating to schema version 3 - Adding indexes for better performance');
      // الفهارس ستُضاف تلقائياً بناءً على التعريف الجديد
    }
    
    if (oldSchemaVersion < 4) {
      console.log('Migrating to schema version 4 - Fixed subCategory property definition');
      // إصلاح تعريف خاصية subCategory في نموذج Category
    }

    if (oldSchemaVersion < 5) {
      console.log('Migrating to schema version 5 - Adding ContentUsage model for tracking content views');
      // إضافة نموذج ContentUsage لتتبع المشاهدات
    }
  },
  // إعدادات الأداء
  deleteRealmIfMigrationNeeded: true, // حذف قاعدة البيانات عند وجود تعارض في المخطط (للتطوير فقط)
  disableFormatUpgrade: false,
  readOnly: false,
  inMemory: false, // استخدام التخزين الدائم
  cache: true, // تفعيل الذاكرة المؤقتة
};

let realmInstance = null;

export const getRealm = async () => {
  if (!realmInstance || realmInstance.isClosed) {
    try {
      // إغلاق أي instance موجود أولاً
      if (realmInstance && !realmInstance.isClosed) {
        realmInstance.close();
        realmInstance = null;
      }
      
      console.log('Opening Realm Database...');
      realmInstance = await Realm.open(realmConfig);
      console.log('Realm Database opened successfully');
      console.log('Realm path:', realmInstance.path);
    } catch (error) {
      console.error('Error opening Realm Database:', error);
      
      // في حالة فشل فتح قاعدة البيانات، محاولة حذفها وإعادة إنشائها
      if (error.message.includes('already opened') || error.message.includes('schema mode')) {
        console.log('Attempting to resolve schema conflict by recreating database...');
        try {
          // إغلاق جميع الاتصالات
          Realm.clearTestState();
          
          // محاولة فتح قاعدة البيانات مع حذف إجباري
          const forceResetConfig = {
            ...realmConfig,
            deleteRealmIfMigrationNeeded: true,
            schemaVersion: realmConfig.schemaVersion + 1, // زيادة الإصدار لضمان إعادة الإنشاء
          };
          
          realmInstance = await Realm.open(forceResetConfig);
          console.log('Database recreated successfully');
        } catch (retryError) {
          console.error('Failed to recreate database:', retryError);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  }
  return realmInstance;
};

export const closeRealm = () => {
  if (realmInstance && !realmInstance.isClosed) {
    try {
      realmInstance.close();
      realmInstance = null;
      console.log('Realm Database closed');
    } catch (error) {
      console.error('Error closing Realm Database:', error);
      realmInstance = null; // تعيين null حتى لو فشل الإغلاق
    }
  }
};

// تنظيف الموارد عند إغلاق التطبيق
export const cleanupRealm = () => {
  try {
    closeRealm();
    // تنظيف إضافي
    Realm.clearTestState();
    console.log('Realm cleanup completed');
  } catch (error) {
    console.error('Error during Realm cleanup:', error);
  }
};

export default realmConfig; 