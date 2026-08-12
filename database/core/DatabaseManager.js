import Realm from 'realm';
import { getCurrentConfig, PERFORMANCE_CONFIG } from '../config/RealmConfig';
import { Schemas } from '../models';

/**
 * مدير قاعدة البيانات الرئيسي - Database Manager
 * يدير الاتصال والعمليات الأساسية لقاعدة البيانات
 */
export class DatabaseManager {
  constructor() {
    this.realm = null;
    this.isInitialized = false;
    this.connectionPromise = null;
    this.eventListeners = new Map();
  }

  /**
   * تهيئة قاعدة البيانات
   */
  async initialize() {
    if (this.isInitialized) {
      return this.realm;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._initializeRealm();
    
    try {
      this.realm = await this.connectionPromise;
      this.isInitialized = true;
      this._setupEventListeners();
      this._emitEvent('initialized', { realm: this.realm });
      
      console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
      return this.realm;
    } catch (error) {
      console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
      this.connectionPromise = null;
      this._emitEvent('error', { error, type: 'initialization' });
      throw error;
    }
  }

  /**
   * تهيئة Realm الداخلية
   */
  async _initializeRealm() {
    const config = getCurrentConfig();
    
    try {
      console.log('🔄 جاري تهيئة قاعدة البيانات...');
      console.log(`📊 إصدار المخطط: ${config.schemaVersion}`);
      console.log(`📁 مسار قاعدة البيانات: ${config.path}`);
      
      const realm = await Realm.open({
        schema: Schemas,
        ...config,
      });
      
      // التحقق من صحة قاعدة البيانات
      await this._validateDatabase(realm);
      
      return realm;
    } catch (error) {
      console.error('❌ خطأ في فتح قاعدة البيانات:', error);
      throw error;
    }
  }

  /**
   * التحقق من صحة قاعدة البيانات
   */
  async _validateDatabase(realm) {
    try {
      console.log('🔍 التحقق من صحة قاعدة البيانات...');
      
      // التحقق من وجود الجداول
      const expectedTables = ['Category', 'Subcategory', 'Lesson', 'Book', 'ContentStats'];
      for (const tableName of expectedTables) {
        const objects = realm.objects(tableName);
        console.log(`📋 جدول ${tableName}: ${objects.length} سجل`);
      }
      
      // التحقق من الفهارس
      console.log('📇 التحقق من الفهارس...');
      
      console.log('✅ تم التحقق من صحة قاعدة البيانات');
    } catch (error) {
      console.error('❌ خطأ في التحقق من صحة قاعدة البيانات:', error);
      throw error;
    }
  }

  /**
   * إعداد مستمعي الأحداث
   */
  _setupEventListeners() {
    if (!this.realm) return;

    // مراقبة تغييرات قاعدة البيانات
    this.realm.addListener('change', () => {
      this._emitEvent('change', { realm: this.realm });
    });

    // مراقبة إغلاق قاعدة البيانات
    this.realm.addListener('beforenotify', () => {
      this._emitEvent('beforeNotify', { realm: this.realm });
    });
  }

  /**
   * الحصول على instance قاعدة البيانات
   */
  getInstance() {
    if (!this.isInitialized || !this.realm) {
      throw new Error('قاعدة البيانات غير مهيئة. يرجى استدعاء initialize() أولاً');
    }
    return this.realm;
  }

  /**
   * التحقق من حالة الاتصال
   */
  isConnected() {
    return this.isInitialized && this.realm && !this.realm.isClosed;
  }

  /**
   * تنفيذ عملية كتابة آمنة
   */
  async safeWrite(callback) {
    if (!this.isConnected()) {
      throw new Error('قاعدة البيانات غير متصلة');
    }

    return new Promise((resolve, reject) => {
      try {
        let result;
        this.realm.write(() => {
          result = callback(this.realm);
        });
        resolve(result);
      } catch (error) {
        console.error('❌ خطأ في عملية الكتابة:', error);
        this._emitEvent('error', { error, type: 'write' });
        reject(error);
      }
    });
  }

  /**
   * تنفيذ عملية قراءة آمنة
   */
  async safeRead(callback) {
    if (!this.isConnected()) {
      throw new Error('قاعدة البيانات غير متصلة');
    }

    try {
      return callback(this.realm);
    } catch (error) {
      console.error('❌ خطأ في عملية القراءة:', error);
      this._emitEvent('error', { error, type: 'read' });
      throw error;
    }
  }

  /**
   * تنفيذ عملية batch للكتابة
   */
  async batchWrite(operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new Error('العمليات يجب أن تكون مصفوفة غير فارغة');
    }

    const batchSize = PERFORMANCE_CONFIG.MAX_BATCH_SIZE;
    const batches = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      batches.push(operations.slice(i, i + batchSize));
    }

    const results = [];
    
    for (const batch of batches) {
      try {
        const batchResult = await this.safeWrite((realm) => {
          return batch.map(operation => operation(realm));
        });
        results.push(...batchResult);
      } catch (error) {
        console.error('❌ خطأ في batch write:', error);
        throw error;
      }
    }

    return results;
  }

  /**
   * تنظيف قاعدة البيانات
   */
  async cleanup() {
    console.log('🧹 بدء تنظيف قاعدة البيانات...');
    
    try {
      await this.safeWrite((realm) => {
        // حذف السجلات المحذوفة نهائياً
        const deletedRecords = realm.objects('Category').filtered('isDeleted == true');
        realm.delete(deletedRecords);
        
        const deletedSubcategories = realm.objects('Subcategory').filtered('isDeleted == true');
        realm.delete(deletedSubcategories);
        
        const deletedLessons = realm.objects('Lesson').filtered('isDeleted == true');
        realm.delete(deletedLessons);
        
        const deletedBooks = realm.objects('Book').filtered('isDeleted == true');
        realm.delete(deletedBooks);
        
        const deletedStats = realm.objects('ContentStats').filtered('isDeleted == true');
        realm.delete(deletedStats);
        
        console.log('✅ تم تنظيف قاعدة البيانات');
      });
    } catch (error) {
      console.error('❌ خطأ في تنظيف قاعدة البيانات:', error);
      throw error;
    }
  }

  /**
   * ضغط قاعدة البيانات
   */
  async compact() {
    if (!this.isConnected()) {
      throw new Error('قاعدة البيانات غير متصلة');
    }

    try {
      console.log('🗜️ بدء ضغط قاعدة البيانات...');
      
      const sizeBefore = this.realm.size;
      await this.realm.compact();
      const sizeAfter = this.realm.size;
      
      const savedSpace = sizeBefore - sizeAfter;
      console.log(`✅ تم ضغط قاعدة البيانات. تم توفير ${savedSpace} بايت`);
      
      this._emitEvent('compacted', { sizeBefore, sizeAfter, savedSpace });
    } catch (error) {
      console.error('❌ خطأ في ضغط قاعدة البيانات:', error);
      throw error;
    }
  }

  /**
   * إحصائيات قاعدة البيانات
   */
  getStats() {
    if (!this.isConnected()) {
      throw new Error('قاعدة البيانات غير متصلة');
    }

    return {
      isConnected: this.isConnected(),
      size: this.realm.size,
      path: this.realm.path,
      schemaVersion: this.realm.schemaVersion,
      tables: {
        categories: this.realm.objects('Category').length,
        subcategories: this.realm.objects('Subcategory').length,
        lessons: this.realm.objects('Lesson').length,
        books: this.realm.objects('Book').length,
        contentStats: this.realm.objects('ContentStats').length,
      },
      performance: {
        maxBatchSize: PERFORMANCE_CONFIG.MAX_BATCH_SIZE,
        maxQueryResults: PERFORMANCE_CONFIG.MAX_QUERY_RESULTS,
        cacheSize: PERFORMANCE_CONFIG.CACHE_SIZE,
      },
    };
  }

  /**
   * إضافة مستمع للأحداث
   */
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);
  }

  /**
   * إزالة مستمع للأحداث
   */
  removeEventListener(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
    }
  }

  /**
   * إطلاق حدث
   */
  _emitEvent(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ خطأ في مستمع الحدث ${event}:`, error);
        }
      });
    }
  }

  /**
   * إغلاق قاعدة البيانات
   */
  async close() {
    if (this.realm && !this.realm.isClosed) {
      try {
        console.log('🔒 إغلاق قاعدة البيانات...');
        
        // إزالة جميع مستمعي الأحداث
        this.realm.removeAllListeners();
        
        // إغلاق قاعدة البيانات
        this.realm.close();
        
        this.realm = null;
        this.isInitialized = false;
        this.connectionPromise = null;
        
        this._emitEvent('closed', {});
        console.log('✅ تم إغلاق قاعدة البيانات');
      } catch (error) {
        console.error('❌ خطأ في إغلاق قاعدة البيانات:', error);
        throw error;
      }
    }
  }

  /**
   * إعادة تشغيل قاعدة البيانات
   */
  async restart() {
    await this.close();
    return this.initialize();
  }
}

// إنشاء instance واحد مشترك
const databaseManager = new DatabaseManager();

export default databaseManager; 