import BaseModel from './BaseModel';

/**
 * نموذج الكتاب - Book Model
 * يمثل الكتب في التطبيق مع إدارة التحميل والقراءة
 * محسن للعمل Offline-First
 */
export class Book extends BaseModel {
  static schema = {
    name: 'Book',
    primaryKey: '_id',
    properties: {
      ...BaseModel.getBaseProperties(),
      
      // معلومات الكتاب الأساسية
      bookName: 'string', // اسم الكتاب الموحد
      name: { type: 'string', default: '' }, // للتوافق مع النموذج القديم
      author: { type: 'string', default: '' },
      description: { type: 'string', default: '' },
      
      // تصنيف الكتاب
      mainCategory: { type: 'string', default: '' },
      subCategory: { type: 'string', default: '' },
      subSubCategory: { type: 'string', default: '' },
      
      // نوع المحتوى
      contentType: { type: 'string', default: 'book' }, // book, video, audio
      
      // الروابط الأصلية (Firebase/Server)
      bookUrl: { type: 'string', default: '' }, // رابط Firebase الأصلي
      pdfUrl: { type: 'string', default: '' }, // للتوافق مع النموذج القديم
      imageUrl: { type: 'string', default: '' },
      
      // التخزين المحلي - Offline Content
      localFilePath: { type: 'string', default: '' }, // مسار الملف المحلي الكامل
      localFileName: { type: 'string', default: '' }, // اسم الملف المحلي
      localPath: { type: 'string', default: '' }, // للتوافق مع النموذج القديم
      
      // حالة المحتوى Offline
      isContentAvailable: { type: 'bool', default: false }, // هل المحتوى متاح محلياً؟
      contentCachedAt: { type: 'date', optional: true }, // متى تم تخزين المحتوى محلياً؟
      contentVerifiedAt: { type: 'date', optional: true }, // آخر مرة تم التحقق من وجود الملف
      
      // معلومات الملف
      fileSize: { type: 'int', default: 0 },
      localFileSize: { type: 'int', default: 0 }, // حجم الملف المحلي
      fileMimeType: { type: 'string', default: '' }, // نوع الملف
      fileHash: { type: 'string', default: '' }, // hash للتحقق من سلامة الملف
      
      // معلومات خاصة بالكتب
      totalPages: { type: 'int', default: 0 },
      
      // معلومات خاصة بالوسائط (Video/Audio)
      duration: { type: 'int', default: 0 }, // المدة بالثواني
      thumbnailPath: { type: 'string', default: '' }, // مسار الصورة المصغرة
      
      // حالة التحميل
      downloadStatus: { type: 'string', default: 'not_downloaded' }, 
      // not_downloaded, downloading, downloaded, failed, verifying
      downloadProgress: { type: 'double', default: 0.0 },
      downloadedAt: { type: 'date', optional: true },
      downloadAttempts: { type: 'int', default: 0 }, // عدد محاولات التحميل
      lastDownloadError: { type: 'string', default: '' },
      
      // Offline-First Sync Status
      isFullyOffline: { type: 'bool', default: false }, // هل هذا المحتوى جاهز للعمل بدون إنترنت؟
      needsSync: { type: 'bool', default: false }, // هل يحتاج مزامنة مع الخادم؟
      lastSyncAt: { type: 'date', optional: true }, // آخر مزامنة مع الخادم
      syncVersion: { type: 'int', default: 1 }, // إصدار المزامنة
      
      // معلومات القراءة/المشاهدة
      isBookmarked: { type: 'bool', default: false },
      lastReadPage: { type: 'int', default: 0 },
      lastAccessedAt: { type: 'date', optional: true },
      readingProgress: { type: 'double', default: 0.0 }, // نسبة مئوية
      lastPlayPosition: { type: 'int', default: 0 }, // للفيديو والصوت بالثواني
      
      // تقييم وإحصائيات
      rating: { type: 'double', default: 0.0 },
      viewCount: { type: 'int', default: 0 },
      totalReadTime: { type: 'int', default: 0 }, // بالثواني
      
      // معلومات إضافية
      tags: { type: 'string', default: '' },
      notes: { type: 'string', default: '' },
      metadata: { type: 'string', default: '{}' },
      
      // معلومات النشر
      publisher: { type: 'string', default: '' },
      publishedYear: { type: 'int', default: 0 },
      isbn: { type: 'string', default: '' },
      language: { type: 'string', default: 'ar' },
    },
    indexes: [
      ...BaseModel.getBaseIndexes(),
      ['name'],
      ['author'],
      ['mainCategory'],
      ['downloadStatus'],
      ['isBookmarked'],
      ['rating'],
      ['viewCount'],
      ['lastAccessedAt'],
    ],
  };

  /**
   * التحقق من صحة بيانات الكتاب
   */
  static validate(data) {
    const errors = [...BaseModel.validateBaseData(data)];
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('اسم الكتاب مطلوب');
    }
    
    if (!data.author || typeof data.author !== 'string' || data.author.trim().length === 0) {
      errors.push('اسم المؤلف مطلوب');
    }
    
    if (!data.pdfUrl || typeof data.pdfUrl !== 'string' || data.pdfUrl.trim().length === 0) {
      errors.push('رابط الكتاب مطلوب');
    }
    
    if (data.pdfUrl && !this.isValidUrl(data.pdfUrl)) {
      errors.push('رابط الكتاب غير صحيح');
    }
    
    if (data.imageUrl && !this.isValidUrl(data.imageUrl)) {
      errors.push('رابط صورة الكتاب غير صحيح');
    }
    
    if (data.downloadStatus && !['not_downloaded', 'downloading', 'downloaded', 'failed'].includes(data.downloadStatus)) {
      errors.push('حالة التحميل غير صحيحة');
    }
    
    if (data.downloadProgress !== undefined && (typeof data.downloadProgress !== 'number' || data.downloadProgress < 0 || data.downloadProgress > 1)) {
      errors.push('نسبة التحميل يجب أن تكون بين 0 و 1');
    }
    
    if (data.rating !== undefined && (typeof data.rating !== 'number' || data.rating < 0 || data.rating > 5)) {
      errors.push('التقييم يجب أن يكون بين 0 و 5');
    }
    
    if (data.fileSize !== undefined && (typeof data.fileSize !== 'number' || data.fileSize < 0)) {
      errors.push('حجم الملف يجب أن يكون رقم موجب');
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
   * تنظيف بيانات الكتاب
   */
  static sanitizeData(data) {
    const sanitized = BaseModel.sanitizeData(data);
    
    // تنظيف النصوص
    ['name', 'author', 'description', 'mainCategory', 'publisher', 'isbn', 'language'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field].trim();
      }
    });
    
    // تنظيف الروابط
    ['pdfUrl', 'imageUrl', 'localPath'].forEach(field => {
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
    
    if (sanitized.readingProgress === undefined) {
      sanitized.readingProgress = 0.0;
    }
    
    if (sanitized.rating === undefined) {
      sanitized.rating = 0.0;
    }
    
    if (!sanitized.language) {
      sanitized.language = 'ar';
    }
    
    return sanitized;
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
    this.localPath = localPath;
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
    this.localPath = '';
    this.downloadedAt = '';
    this.updateTimestamp();
  }

  /**
   * فتح الكتاب للقراءة
   */
  openForReading() {
    this.lastAccessedAt = new Date().toISOString();
    this.viewCount += 1;
    this.updateTimestamp();
  }

  /**
   * تحديث تقدم القراءة
   */
  updateReadingProgress(currentPage, totalPages = null) {
    if (totalPages) {
      this.totalPages = totalPages;
    }
    
    this.lastReadPage = currentPage;
    
    if (this.totalPages > 0) {
      this.readingProgress = Math.min(currentPage / this.totalPages, 1.0);
    }
    
    this.lastAccessedAt = new Date().toISOString();
    this.updateTimestamp();
  }

  /**
   * إضافة وقت القراءة
   */
  addReadingTime(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return;
    
    this.totalReadTime += seconds;
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
   * إضافة ملاحظة
   */
  addNote(note) {
    if (!note || typeof note !== 'string') return;
    
    const currentNotes = this.notes ? this.notes + '\n\n' : '';
    const timestamp = new Date().toLocaleString('ar-SA');
    this.notes = currentNotes + `[${timestamp}] ${note.trim()}`;
    this.updateTimestamp();
  }

  /**
   * الحصول على الملاحظات كمصفوفة
   */
  getNotesArray() {
    if (!this.notes) return [];
    
    return this.notes.split('\n\n').map(note => {
      const match = note.match(/^\[([^\]]+)\] (.+)$/);
      if (match) {
        return {
          timestamp: match[1],
          content: match[2],
        };
      }
      return {
        timestamp: '',
        content: note,
      };
    });
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
   * التحقق من حالة التحميل
   */
  isDownloaded() {
    return this.downloadStatus === 'downloaded' && this.localPath;
  }

  /**
   * التحقق من حالة التحميل الجاري
   */
  isDownloading() {
    return this.downloadStatus === 'downloading';
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
   * الحصول على وقت القراءة بتنسيق قابل للقراءة
   */
  getFormattedReadTime() {
    if (this.totalReadTime === 0) return '0 دقيقة';
    
    const hours = Math.floor(this.totalReadTime / 3600);
    const minutes = Math.floor((this.totalReadTime % 3600) / 60);
    
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
    
    return {
      ...baseData,
      isDownloaded: this.isDownloaded(),
      isDownloading: this.isDownloading(),
      formattedFileSize: this.getFormattedFileSize(),
      formattedReadTime: this.getFormattedReadTime(),
      notes: this.getNotesArray(),
      metadata: this.getMetadata(),
      stats: {
        viewCount: this.viewCount,
        totalReadTime: this.totalReadTime,
        readingProgress: this.readingProgress,
        rating: this.rating,
      },
    };
  }

  /**
   * البحث في الكتب
   */
  static search(realm, query, options = {}) {
    const {
      category = null,
      author = null,
      downloadStatus = null,
      isBookmarked = null,
      sortBy = 'name',
      sortOrder = 'ASC',
      limit = 50,
    } = options;
    
    let filter = 'isDeleted == false';
    
    if (query && query.trim()) {
      filter += ` AND (name CONTAINS[c] "${query.trim()}" OR author CONTAINS[c] "${query.trim()}")`;
    }
    
    if (category) {
      filter += ` AND mainCategory == "${category}"`;
    }
    
    if (author) {
      filter += ` AND author == "${author}"`;
    }
    
    if (downloadStatus) {
      filter += ` AND downloadStatus == "${downloadStatus}"`;
    }
    
    if (isBookmarked !== null) {
      filter += ` AND isBookmarked == ${isBookmarked}`;
    }
    
    const results = realm.objects('Book')
      .filtered(filter)
      .sorted(sortBy, sortOrder === 'DESC');
    
    return limit ? results.slice(0, limit) : results;
  }

  /**
   * الحصول على الكتب الأكثر قراءة
   */
  static getMostRead(realm, limit = 10) {
    return realm.objects('Book')
      .filtered('isDeleted == false AND viewCount > 0')
      .sorted('viewCount', true)
      .slice(0, limit);
  }

  /**
   * الحصول على الكتب المحملة
   */
  static getDownloaded(realm) {
    return realm.objects('Book')
      .filtered('isDeleted == false AND downloadStatus == "downloaded"');
  }

  /**
   * الحصول على الكتب المفضلة
   */
  static getBookmarked(realm) {
    return realm.objects('Book')
      .filtered('isDeleted == false AND isBookmarked == true');
  }
}

export default Book; 