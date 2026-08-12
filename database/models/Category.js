import BaseModel from './BaseModel';

/**
 * نموذج القسم الرئيسي - Category Model
 * يمثل الأقسام الرئيسية في التطبيق مثل (الفقه، السيرة، إلخ)
 */
export class Category extends BaseModel {
  static schema = {
    name: 'Category',
    primaryKey: '_id',
    properties: {
      ...BaseModel.getBaseProperties(),
      name: 'string',
      description: { type: 'string', default: '' },
      sortOrder: { type: 'int', default: 0 },
      isActive: { type: 'bool', default: true },
      icon: { type: 'string', default: '' },
      color: { type: 'string', default: '#4A90E2' },
      
      // إحصائيات
      totalSubcategories: { type: 'int', default: 0 },
      totalContent: { type: 'int', default: 0 },
      
      // معلومات إضافية
      tags: { type: 'string', default: '' }, // مفصولة بفواصل
      metadata: { type: 'string', default: '{}' }, // JSON string للبيانات الإضافية
    },
    indexes: [
      ...BaseModel.getBaseIndexes(),
      ['name'],
      ['sortOrder'],
      ['isActive'],
      ['totalContent'],
    ],
  };

  /**
   * التحقق من صحة بيانات القسم
   */
  static validate(data) {
    const errors = [...BaseModel.validateBaseData(data)];
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('اسم القسم مطلوب');
    }
    
    if (data.name && data.name.length > 100) {
      errors.push('اسم القسم يجب أن يكون أقل من 100 حرف');
    }
    
    if (data.description && data.description.length > 500) {
      errors.push('وصف القسم يجب أن يكون أقل من 500 حرف');
    }
    
    if (data.sortOrder !== undefined && (typeof data.sortOrder !== 'number' || data.sortOrder < 0)) {
      errors.push('ترتيب القسم يجب أن يكون رقم موجب');
    }
    
    if (data.color && !this.isValidColor(data.color)) {
      errors.push('لون القسم غير صحيح');
    }
    
    return errors;
  }

  /**
   * التحقق من صحة اللون
   */
  static isValidColor(color) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  }

  /**
   * تنظيف بيانات القسم
   */
  static sanitizeData(data) {
    const sanitized = BaseModel.sanitizeData(data);
    
    // تنظيف الاسم
    if (sanitized.name) {
      sanitized.name = sanitized.name.trim();
    }
    
    // تنظيف الوصف
    if (sanitized.description) {
      sanitized.description = sanitized.description.trim();
    }
    
    // تعيين القيم الافتراضية
    if (sanitized.sortOrder === undefined) {
      sanitized.sortOrder = 0;
    }
    
    if (sanitized.isActive === undefined) {
      sanitized.isActive = true;
    }
    
    if (!sanitized.color) {
      sanitized.color = '#4A90E2';
    }
    
    if (!sanitized.icon) {
      sanitized.icon = 'folder';
    }
    
    // تنظيف الـ tags
    if (sanitized.tags) {
      sanitized.tags = sanitized.tags.split(',').map(tag => tag.trim()).filter(tag => tag).join(',');
    }
    
    // التحقق من صحة الـ metadata
    if (sanitized.metadata) {
      try {
        JSON.parse(sanitized.metadata);
      } catch (error) {
        sanitized.metadata = '{}';
      }
    }
    
    return sanitized;
  }

  /**
   * الحصول على الأقسام الفرعية
   */
  getSubcategories() {
    return this.realm.objects('Subcategory').filtered('categoryId == $0 AND isDeleted == false', this._id);
  }

  /**
   * الحصول على جميع المحتوى في هذا القسم
   */
  getAllContent() {
    const subcategories = this.getSubcategories();
    const subcategoryIds = subcategories.map(sub => sub._id);
    
    if (subcategoryIds.length === 0) {
      return [];
    }
    
    const books = this.realm.objects('Book').filtered('mainCategory == $0 AND isDeleted == false', this.name);
    const lessons = this.realm.objects('Lesson').filtered('subcategoryId IN $0 AND isDeleted == false', subcategoryIds);
    
    return [...books, ...lessons];
  }

  /**
   * تحديث إحصائيات القسم
   */
  updateStats() {
    const subcategories = this.getSubcategories();
    const allContent = this.getAllContent();
    
    this.totalSubcategories = subcategories.length;
    this.totalContent = allContent.length;
    this.updateTimestamp();
  }

  /**
   * إضافة tag جديد
   */
  addTag(tag) {
    if (!tag || typeof tag !== 'string') return;
    
    const currentTags = this.getTags();
    if (!currentTags.includes(tag.trim())) {
      currentTags.push(tag.trim());
      this.tags = currentTags.join(',');
      this.updateTimestamp();
    }
  }

  /**
   * حذف tag
   */
  removeTag(tag) {
    if (!tag || typeof tag !== 'string') return;
    
    const currentTags = this.getTags();
    const updatedTags = currentTags.filter(t => t !== tag.trim());
    this.tags = updatedTags.join(',');
    this.updateTimestamp();
  }

  /**
   * الحصول على قائمة الـ tags
   */
  getTags() {
    if (!this.tags) return [];
    return this.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
  }

  /**
   * تحديث الـ metadata
   */
  updateMetadata(key, value) {
    let metadata = {};
    
    try {
      metadata = JSON.parse(this.metadata || '{}');
    } catch (error) {
      metadata = {};
    }
    
    metadata[key] = value;
    this.metadata = JSON.stringify(metadata);
    this.updateTimestamp();
  }

  /**
   * الحصول على قيمة من الـ metadata
   */
  getMetadata(key) {
    try {
      const metadata = JSON.parse(this.metadata || '{}');
      return metadata[key];
    } catch (error) {
      return null;
    }
  }

  /**
   * تحويل إلى JSON مع البيانات الإضافية
   */
  toDetailedJSON() {
    const baseData = this.toJSON();
    
    return {
      ...baseData,
      tags: this.getTags(),
      metadata: this.getMetadata(),
      subcategories: this.getSubcategories().map(sub => sub.toSafeJSON()),
      stats: {
        totalSubcategories: this.totalSubcategories,
        totalContent: this.totalContent,
      },
    };
  }

  /**
   * البحث في الأقسام
   */
  static search(realm, query, options = {}) {
    const {
      includeInactive = false,
      sortBy = 'sortOrder',
      sortOrder = 'ASC',
      limit = 50,
    } = options;
    
    let filter = 'isDeleted == false';
    
    if (!includeInactive) {
      filter += ' AND isActive == true';
    }
    
    if (query && query.trim()) {
      filter += ` AND name CONTAINS[c] "${query.trim()}"`;
    }
    
    const results = realm.objects('Category')
      .filtered(filter)
      .sorted(sortBy, sortOrder === 'DESC');
    
    return limit ? results.slice(0, limit) : results;
  }
}

export default Category; 