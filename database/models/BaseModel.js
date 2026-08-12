import Realm from 'realm';

/**
 * النموذج الأساسي - Base Model
 * يحتوي على الخصائص والوظائف المشتركة لجميع النماذج
 */
export class BaseModel extends Realm.Object {
  /**
   * الخصائص الأساسية المشتركة
   */
  static getBaseProperties() {
    return {
      id: 'string',
      createdAt: { type: 'string', default: () => new Date().toISOString() },
      updatedAt: { type: 'string', default: () => new Date().toISOString() },
      isDeleted: { type: 'bool', default: false },
      syncStatus: { type: 'string', default: 'synced' }, // synced, pending, failed
    };
  }

  /**
   * الفهارس الأساسية المشتركة
   */
  static getBaseIndexes() {
    return [
      ['createdAt'],
      ['updatedAt'],
      ['isDeleted'],
      ['syncStatus'],
    ];
  }

  /**
   * تحديث وقت التعديل
   */
  updateTimestamp() {
    this.updatedAt = new Date().toISOString();
  }

  /**
   * تحديد حالة المزامنة
   */
  setSyncStatus(status) {
    this.syncStatus = status;
    this.updateTimestamp();
  }

  /**
   * حذف ناعم للسجل
   */
  softDelete() {
    this.isDeleted = true;
    this.updateTimestamp();
  }

  /**
   * استرجاع السجل المحذوف
   */
  restore() {
    this.isDeleted = false;
    this.updateTimestamp();
  }

  /**
   * تحويل إلى JSON مع تنظيف البيانات
   */
  toJSON() {
    const obj = {};
    
    // نسخ جميع الخصائص
    for (const key in this) {
      if (this.hasOwnProperty(key) && key !== 'realm') {
        obj[key] = this[key];
      }
    }
    
    return obj;
  }

  /**
   * تحويل إلى JSON مع إخفاء الحقول الحساسة
   */
  toSafeJSON() {
    const obj = this.toJSON();
    
    // إخفاء الحقول الحساسة
    delete obj.syncStatus;
    delete obj.isDeleted;
    
    return obj;
  }

  /**
   * تحقق من صحة البيانات الأساسية
   */
  static validateBaseData(data) {
    const errors = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('المعرف (id) مطلوب ويجب أن يكون نص');
    }
    
    if (data.createdAt && !this.isValidDateString(data.createdAt)) {
      errors.push('تاريخ الإنشاء غير صحيح');
    }
    
    if (data.updatedAt && !this.isValidDateString(data.updatedAt)) {
      errors.push('تاريخ التحديث غير صحيح');
    }
    
    if (data.syncStatus && !['synced', 'pending', 'failed'].includes(data.syncStatus)) {
      errors.push('حالة المزامنة غير صحيحة');
    }
    
    return errors;
  }

  /**
   * التحقق من صحة تاريخ النص
   */
  static isValidDateString(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * إنشاء معرف فريد
   */
  static generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}_${randomStr}` : `${timestamp}_${randomStr}`;
  }

  /**
   * تنظيف البيانات قبل الحفظ
   */
  static sanitizeData(data) {
    const sanitized = { ...data };
    
    // تنظيف النصوص
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].trim();
      }
    });
    
    // تعيين التواريخ الافتراضية
    if (!sanitized.createdAt) {
      sanitized.createdAt = new Date().toISOString();
    }
    
    if (!sanitized.updatedAt) {
      sanitized.updatedAt = new Date().toISOString();
    }
    
    // تعيين القيم الافتراضية
    if (sanitized.isDeleted === undefined) {
      sanitized.isDeleted = false;
    }
    
    if (!sanitized.syncStatus) {
      sanitized.syncStatus = 'pending';
    }
    
    return sanitized;
  }

  /**
   * مقارنة سجلين لتحديد الاختلافات
   */
  static compareRecords(record1, record2) {
    const differences = {};
    const keys = new Set([...Object.keys(record1), ...Object.keys(record2)]);
    
    keys.forEach(key => {
      if (record1[key] !== record2[key]) {
        differences[key] = {
          old: record1[key],
          new: record2[key]
        };
      }
    });
    
    return differences;
  }
}

export default BaseModel; 