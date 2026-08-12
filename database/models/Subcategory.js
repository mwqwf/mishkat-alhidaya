import BaseModel from './BaseModel';

/**
 * نموذج القسم الفرعي - Subcategory Model
 * يمثل الأقسام الفرعية داخل الأقسام الرئيسية
 */
export class Subcategory extends BaseModel {
  static schema = {
    name: 'Subcategory',
    primaryKey: 'id',
    properties: {
      id: 'string',
      ...BaseModel.getBaseProperties(),
      name: 'string',
      description: { type: 'string', default: '' },
      categoryId: 'string',
      sortOrder: { type: 'int', default: 0 },
      isActive: { type: 'bool', default: true },
      icon: { type: 'string', default: '' },
      color: { type: 'string', default: '#6C7B7F' },
      
      // إحصائيات
      totalLessons: { type: 'int', default: 0 },
      totalDuration: { type: 'int', default: 0 }, // بالثواني
      
      // معلومات إضافية
      tags: { type: 'string', default: '' },
      metadata: { type: 'string', default: '{}' },
    },
  };

  /**
   * التحقق من صحة بيانات القسم الفرعي
   */
  static validate(data) {
    const errors = [...BaseModel.validateBaseData(data)];
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('اسم القسم الفرعي مطلوب');
    }
    
    if (!data.categoryId || typeof data.categoryId !== 'string' || data.categoryId.trim().length === 0) {
      errors.push('معرف القسم الرئيسي مطلوب');
    }
    
    if (data.name && data.name.length > 100) {
      errors.push('اسم القسم الفرعي يجب أن يكون أقل من 100 حرف');
    }
    
    if (data.description && data.description.length > 500) {
      errors.push('وصف القسم الفرعي يجب أن يكون أقل من 500 حرف');
    }
    
    if (data.sortOrder !== undefined && (typeof data.sortOrder !== 'number' || data.sortOrder < 0)) {
      errors.push('ترتيب القسم الفرعي يجب أن يكون رقم موجب');
    }
    
    return errors;
  }

  /**
   * تنظيف بيانات القسم الفرعي
   */
  static sanitizeData(data) {
    const sanitized = BaseModel.sanitizeData(data);
    
    // تنظيف النصوص
    ['name', 'description', 'categoryId', 'icon'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field].trim();
      }
    });
    
    // تعيين القيم الافتراضية
    if (sanitized.sortOrder === undefined) {
      sanitized.sortOrder = 0;
    }
    
    if (sanitized.isActive === undefined) {
      sanitized.isActive = true;
    }
    
    if (!sanitized.color) {
      sanitized.color = '#6C7B7F';
    }
    
    if (!sanitized.icon) {
      sanitized.icon = 'folder-open';
    }
    
    return sanitized;
  }

  /**
   * الحصول على القسم الرئيسي
   */
  getCategory() {
    return this.realm.objectForPrimaryKey('Category', this.categoryId);
  }

  /**
   * الحصول على الدروس في هذا القسم الفرعي
   */
  getLessons() {
    return this.realm.objects('Lesson').filtered('subcategoryId == $0 AND isDeleted == false', this.id);
  }

  /**
   * تحديث إحصائيات القسم الفرعي
   */
  updateStats() {
    const lessons = this.getLessons();
    this.totalLessons = lessons.length;
    
    // حساب إجمالي المدة
    let totalDuration = 0;
    lessons.forEach(lesson => {
      if (lesson.duration && typeof lesson.duration === 'number') {
        totalDuration += lesson.duration;
      }
    });
    this.totalDuration = totalDuration;
    
    this.updateTimestamp();
  }

  /**
   * الحصول على المدة الإجمالية بتنسيق قابل للقراءة
   */
  getFormattedDuration() {
    if (this.totalDuration === 0) return '0 دقيقة';
    
    const hours = Math.floor(this.totalDuration / 3600);
    const minutes = Math.floor((this.totalDuration % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} ساعة ${minutes} دقيقة`;
    }
    
    return `${minutes} دقيقة`;
  }

  /**
   * تحويل إلى JSON مع البيانات الإضافية
   */
  toDetailedJSON() {
    const baseData = this.toJSON();
    const category = this.getCategory();
    
    return {
      ...baseData,
      category: category ? category.toSafeJSON() : null,
      lessons: this.getLessons().map(lesson => lesson.toSafeJSON()),
      formattedDuration: this.getFormattedDuration(),
      stats: {
        totalLessons: this.totalLessons,
        totalDuration: this.totalDuration,
      },
    };
  }

  /**
   * البحث في الأقسام الفرعية
   */
  static search(realm, query, options = {}) {
    const {
      categoryId = null,
      includeInactive = false,
      sortBy = 'sortOrder',
      sortOrder = 'ASC',
      limit = 50,
    } = options;
    
    let filter = 'isDeleted == false';
    
    if (!includeInactive) {
      filter += ' AND isActive == true';
    }
    
    if (categoryId) {
      filter += ` AND categoryId == "${categoryId}"`;
    }
    
    if (query && query.trim()) {
      filter += ` AND name CONTAINS[c] "${query.trim()}"`;
    }
    
    const results = realm.objects('Subcategory')
      .filtered(filter)
      .sorted(sortBy, sortOrder === 'DESC');
    
    return limit ? results.slice(0, limit) : results;
  }

  /**
   * الحصول على الأقسام الفرعية حسب القسم الرئيسي
   */
  static getByCategory(realm, categoryId) {
    return realm.objects('Subcategory')
      .filtered('categoryId == $0 AND isDeleted == false AND isActive == true', categoryId)
      .sorted('sortOrder');
  }
}

export default Subcategory; 