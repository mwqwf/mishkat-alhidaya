import BaseModel from './BaseModel';

/**
 * نموذج الدرس - Lesson Model
 * يمثل الدروس الصوتية في التطبيق
 */
export class Lesson extends BaseModel {
  static schema = {
    name: 'Lesson',
    primaryKey: '_id',
    properties: {
      ...BaseModel.getBaseProperties(),
      title: 'string',
      description: { type: 'string', default: '' },
      categoryId: 'string',
      subcategoryId: 'string',
      
      // معلومات الصوت
      audioUrl: 'string',
      localAudioPath: { type: 'string', default: '' },
      duration: { type: 'int', default: 0 }, // بالثواني
      fileSize: { type: 'int', default: 0 },
      
      // حالة التحميل
      downloadStatus: { type: 'string', default: 'not_downloaded' },
      downloadProgress: { type: 'double', default: 0.0 },
      downloadedAt: { type: 'string', default: '' },
      
      // معلومات التشغيل
      isBookmarked: { type: 'bool', default: false },
      lastPlayedAt: { type: 'string', default: '' },
      lastPosition: { type: 'int', default: 0 }, // آخر موضع تشغيل بالثواني
      playCount: { type: 'int', default: 0 },
      totalListenTime: { type: 'int', default: 0 }, // إجمالي وقت الاستماع
      
      // تقييم
      rating: { type: 'double', default: 0.0 },
      
      // معلومات إضافية
      speaker: { type: 'string', default: '' }, // اسم المتحدث
      tags: { type: 'string', default: '' },
      notes: { type: 'string', default: '' },
      metadata: { type: 'string', default: '{}' },
      
      // ترتيب
      sortOrder: { type: 'int', default: 0 },
      isActive: { type: 'bool', default: true },
    },
    indexes: [
      ...BaseModel.getBaseIndexes(),
      ['title'],
      ['categoryId'],
      ['subcategoryId'],
      ['speaker'],
      ['downloadStatus'],
      ['isBookmarked'],
      ['lastPlayedAt'],
      ['playCount'],
      ['rating'],
      ['sortOrder'],
      ['isActive'],
    ],
  };

  /**
   * التحقق من صحة بيانات الدرس
   */
  static validate(data) {
    const errors = [...BaseModel.validateBaseData(data)];
    
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push('عنوان الدرس مطلوب');
    }
    
    if (!data.categoryId || typeof data.categoryId !== 'string' || data.categoryId.trim().length === 0) {
      errors.push('معرف القسم الرئيسي مطلوب');
    }
    
    if (!data.subcategoryId || typeof data.subcategoryId !== 'string' || data.subcategoryId.trim().length === 0) {
      errors.push('معرف القسم الفرعي مطلوب');
    }
    
    if (!data.audioUrl || typeof data.audioUrl !== 'string' || data.audioUrl.trim().length === 0) {
      errors.push('رابط الصوت مطلوب');
    }
    
    if (data.audioUrl && !this.isValidUrl(data.audioUrl)) {
      errors.push('رابط الصوت غير صحيح');
    }
    
    if (data.duration !== undefined && (typeof data.duration !== 'number' || data.duration < 0)) {
      errors.push('مدة الدرس يجب أن تكون رقم موجب');
    }
    
    if (data.rating !== undefined && (typeof data.rating !== 'number' || data.rating < 0 || data.rating > 5)) {
      errors.push('التقييم يجب أن يكون بين 0 و 5');
    }
    
    return errors;
  }

  /**
   * التحقق من صحة الرابط
   */
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * تنظيف بيانات الدرس
   */
  static sanitizeData(data) {
    const sanitized = BaseModel.sanitizeData(data);
    
    // تنظيف النصوص
    ['title', 'description', 'categoryId', 'subcategoryId', 'speaker'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field].trim();
      }
    });
    
    // تنظيف الروابط
    ['audioUrl', 'localAudioPath'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field].trim();
      }
    });
    
    // تعيين القيم الافتراضية
    if (!sanitized.downloadStatus) {
      sanitized.downloadStatus = 'not_downloaded';
    }
    
    if (sanitized.downloadProgress === undefined) {
      sanitized.downloadProgress = 0.0;
    }
    
    if (sanitized.rating === undefined) {
      sanitized.rating = 0.0;
    }
    
    if (sanitized.sortOrder === undefined) {
      sanitized.sortOrder = 0;
    }
    
    if (sanitized.isActive === undefined) {
      sanitized.isActive = true;
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
   * الحصول على القسم الفرعي
   */
  getSubcategory() {
    return this.realm.objectForPrimaryKey('Subcategory', this.subcategoryId);
  }

  /**
   * بدء التحميل
   */
  startDownload() {
    this.downloadStatus = 'downloading';
    this.downloadProgress = 0.0;
    this.updateTimestamp();
  }

  /**
   * تحديث نسبة التحميل
   */
  updateDownloadProgress(progress) {
    if (typeof progress !== 'number' || progress < 0 || progress > 1) {
      throw new Error('نسبة التحميل يجب أن تكون بين 0 و 1');
    }
    
    this.downloadProgress = progress;
    this.updateTimestamp();
  }

  /**
   * إكمال التحميل
   */
  completeDownload(localPath, fileSize = 0) {
    this.downloadStatus = 'downloaded';
    this.downloadProgress = 1.0;
    this.localAudioPath = localPath;
    this.fileSize = fileSize;
    this.downloadedAt = new Date().toISOString();
    this.updateTimestamp();
  }

  /**
   * فشل التحميل
   */
  failDownload() {
    this.downloadStatus = 'failed';
    this.updateTimestamp();
  }

  /**
   * إعادة تعيين التحميل
   */
  resetDownload() {
    this.downloadStatus = 'not_downloaded';
    this.downloadProgress = 0.0;
    this.localAudioPath = '';
    this.downloadedAt = '';
    this.updateTimestamp();
  }

  /**
   * بدء التشغيل
   */
  startPlaying() {
    this.lastPlayedAt = new Date().toISOString();
    this.playCount += 1;
    this.updateTimestamp();
  }

  /**
   * تحديث موضع التشغيل
   */
  updatePlayPosition(position) {
    if (typeof position !== 'number' || position < 0) return;
    
    this.lastPosition = position;
    this.lastPlayedAt = new Date().toISOString();
    this.updateTimestamp();
  }

  /**
   * إضافة وقت الاستماع
   */
  addListenTime(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return;
    
    this.totalListenTime += seconds;
    this.updateTimestamp();
  }

  /**
   * تبديل حالة المفضلة
   */
  toggleBookmark() {
    this.isBookmarked = !this.isBookmarked;
    this.updateTimestamp();
  }

  /**
   * تحديث التقييم
   */
  updateRating(rating) {
    if (typeof rating !== 'number' || rating < 0 || rating > 5) {
      throw new Error('التقييم يجب أن يكون بين 0 و 5');
    }
    
    this.rating = rating;
    this.updateTimestamp();
  }

  /**
   * التحقق من حالة التحميل
   */
  isDownloaded() {
    return this.downloadStatus === 'downloaded' && this.localAudioPath;
  }

  /**
   * التحقق من حالة التحميل الجاري
   */
  isDownloading() {
    return this.downloadStatus === 'downloading';
  }

  /**
   * الحصول على المدة بتنسيق قابل للقراءة
   */
  getFormattedDuration() {
    if (this.duration === 0) return '0:00';
    
    const minutes = Math.floor(this.duration / 60);
    const seconds = this.duration % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * الحصول على حجم الملف بتنسيق قابل للقراءة
   */
  getFormattedFileSize() {
    if (this.fileSize === 0) return '0 KB';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.fileSize;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * الحصول على وقت الاستماع بتنسيق قابل للقراءة
   */
  getFormattedListenTime() {
    if (this.totalListenTime === 0) return '0 دقيقة';
    
    const hours = Math.floor(this.totalListenTime / 3600);
    const minutes = Math.floor((this.totalListenTime % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} ساعة ${minutes} دقيقة`;
    }
    
    return `${minutes} دقيقة`;
  }

  /**
   * الحصول على نسبة التقدم في التشغيل
   */
  getPlayProgress() {
    if (this.duration === 0) return 0;
    return Math.min(this.lastPosition / this.duration, 1.0);
  }

  /**
   * تحويل إلى JSON مع البيانات الإضافية
   */
  toDetailedJSON() {
    const baseData = this.toJSON();
    const category = this.getCategory();
    const subcategory = this.getSubcategory();
    
    return {
      ...baseData,
      category: category ? category.toSafeJSON() : null,
      subcategory: subcategory ? subcategory.toSafeJSON() : null,
      isDownloaded: this.isDownloaded(),
      isDownloading: this.isDownloading(),
      formattedDuration: this.getFormattedDuration(),
      formattedFileSize: this.getFormattedFileSize(),
      formattedListenTime: this.getFormattedListenTime(),
      playProgress: this.getPlayProgress(),
      stats: {
        playCount: this.playCount,
        totalListenTime: this.totalListenTime,
        rating: this.rating,
      },
    };
  }

  /**
   * البحث في الدروس
   */
  static search(realm, query, options = {}) {
    const {
      categoryId = null,
      subcategoryId = null,
      speaker = null,
      downloadStatus = null,
      isBookmarked = null,
      sortBy = 'title',
      sortOrder = 'ASC',
      limit = 50,
    } = options;
    
    let filter = 'isDeleted == false AND isActive == true';
    
    if (query && query.trim()) {
      filter += ` AND (title CONTAINS[c] "${query.trim()}" OR description CONTAINS[c] "${query.trim()}")`;
    }
    
    if (categoryId) {
      filter += ` AND categoryId == "${categoryId}"`;
    }
    
    if (subcategoryId) {
      filter += ` AND subcategoryId == "${subcategoryId}"`;
    }
    
    if (speaker) {
      filter += ` AND speaker == "${speaker}"`;
    }
    
    if (downloadStatus) {
      filter += ` AND downloadStatus == "${downloadStatus}"`;
    }
    
    if (isBookmarked !== null) {
      filter += ` AND isBookmarked == ${isBookmarked}`;
    }
    
    const results = realm.objects('Lesson')
      .filtered(filter)
      .sorted(sortBy, sortOrder === 'DESC');
    
    return limit ? results.slice(0, limit) : results;
  }

  /**
   * الحصول على الدروس الأكثر استماعاً
   */
  static getMostPlayed(realm, limit = 10) {
    return realm.objects('Lesson')
      .filtered('isDeleted == false AND isActive == true AND playCount > 0')
      .sorted('playCount', true)
      .slice(0, limit);
  }

  /**
   * الحصول على الدروس المحملة
   */
  static getDownloaded(realm) {
    return realm.objects('Lesson')
      .filtered('isDeleted == false AND downloadStatus == "downloaded"');
  }

  /**
   * الحصول على الدروس المفضلة
   */
  static getBookmarked(realm) {
    return realm.objects('Lesson')
      .filtered('isDeleted == false AND isBookmarked == true');
  }

  /**
   * الحصول على الدروس الأخيرة
   */
  static getRecent(realm, limit = 20) {
    return realm.objects('Lesson')
      .filtered('isDeleted == false AND isActive == true')
      .sorted('createdAt', true)
      .slice(0, limit);
  }

  /**
   * الحصول على الدروس حسب المتحدث
   */
  static getBySpeaker(realm, speaker) {
    return realm.objects('Lesson')
      .filtered('speaker == $0 AND isDeleted == false AND isActive == true', speaker)
      .sorted('title');
  }
}

export default Lesson; 