import BaseModel from './BaseModel';

/**
 * نموذج إحصائيات المحتوى - ContentStats Model
 * يتتبع الاستخدام والتفاعل مع المحتوى
 */
export class ContentStats extends BaseModel {
  static schema = {
    name: 'ContentStats',
    primaryKey: '_id',
    properties: {
      ...BaseModel.getBaseProperties(),
      contentId: 'string',
      contentType: 'string', // book, lesson, category, subcategory
      
      // إحصائيات الاستخدام
      viewCount: { type: 'int', default: 0 },
      totalViewTime: { type: 'int', default: 0 }, // بالثواني
      lastViewedAt: { type: 'string', default: '' },
      
      // إحصائيات التفاعل
      likeCount: { type: 'int', default: 0 },
      shareCount: { type: 'int', default: 0 },
      downloadCount: { type: 'int', default: 0 },
      
      // إحصائيات التقييم
      averageRating: { type: 'double', default: 0.0 },
      totalRatings: { type: 'int', default: 0 },
      
      // إحصائيات التشغيل (للدروس الصوتية)
      playCount: { type: 'int', default: 0 },
      totalPlayTime: { type: 'int', default: 0 }, // بالثواني
      completionRate: { type: 'double', default: 0.0 }, // نسبة الإكمال
      
      // إحصائيات القراءة (للكتب)
      readCount: { type: 'int', default: 0 },
      totalReadTime: { type: 'int', default: 0 }, // بالثواني
      averageReadingProgress: { type: 'double', default: 0.0 },
      
      // إحصائيات زمنية
      firstAccessedAt: { type: 'string', default: '' },
      lastAccessedAt: { type: 'string', default: '' },
      
      // معلومات إضافية
      metadata: { type: 'string', default: '{}' },
    },
    indexes: [
      ...BaseModel.getBaseIndexes(),
      ['contentId'],
      ['contentType'],
      ['viewCount'],
      ['totalViewTime'],
      ['lastViewedAt'],
      ['averageRating'],
      ['playCount'],
      ['readCount'],
      ['lastAccessedAt'],
    ],
  };

  /**
   * التحقق من صحة بيانات الإحصائيات
   */
  static validate(data) {
    const errors = [...BaseModel.validateBaseData(data)];
    
    if (!data.contentId || typeof data.contentId !== 'string' || data.contentId.trim().length === 0) {
      errors.push('معرف المحتوى مطلوب');
    }
    
    if (!data.contentType || typeof data.contentType !== 'string' || data.contentType.trim().length === 0) {
      errors.push('نوع المحتوى مطلوب');
    }
    
    if (data.contentType && !['book', 'lesson', 'category', 'subcategory'].includes(data.contentType)) {
      errors.push('نوع المحتوى غير صحيح');
    }
    
    // التحقق من الأرقام الموجبة
    const positiveFields = ['viewCount', 'totalViewTime', 'likeCount', 'shareCount', 'downloadCount', 'totalRatings', 'playCount', 'totalPlayTime', 'readCount', 'totalReadTime'];
    positiveFields.forEach(field => {
      if (data[field] !== undefined && (typeof data[field] !== 'number' || data[field] < 0)) {
        errors.push(`${field} يجب أن يكون رقم موجب`);
      }
    });
    
    // التحقق من النسب المئوية
    const percentageFields = ['averageRating', 'completionRate', 'averageReadingProgress'];
    percentageFields.forEach(field => {
      if (data[field] !== undefined && (typeof data[field] !== 'number' || data[field] < 0 || data[field] > (field === 'averageRating' ? 5 : 1))) {
        errors.push(`${field} يجب أن يكون بين 0 و ${field === 'averageRating' ? '5' : '1'}`);
      }
    });
    
    return errors;
  }

  /**
   * تنظيف بيانات الإحصائيات
   */
  static sanitizeData(data) {
    const sanitized = BaseModel.sanitizeData(data);
    
    // تنظيف النصوص
    ['contentId', 'contentType'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = sanitized[field].trim();
      }
    });
    
    // تعيين القيم الافتراضية للأرقام
    const numericFields = [
      'viewCount', 'totalViewTime', 'likeCount', 'shareCount', 'downloadCount',
      'totalRatings', 'playCount', 'totalPlayTime', 'readCount', 'totalReadTime'
    ];
    
    numericFields.forEach(field => {
      if (sanitized[field] === undefined) {
        sanitized[field] = 0;
      }
    });
    
    // تعيين القيم الافتراضية للنسب
    const percentageFields = ['averageRating', 'completionRate', 'averageReadingProgress'];
    percentageFields.forEach(field => {
      if (sanitized[field] === undefined) {
        sanitized[field] = 0.0;
      }
    });
    
    return sanitized;
  }

  /**
   * تسجيل مشاهدة جديدة
   */
  recordView(viewTime = 0) {
    this.viewCount += 1;
    this.totalViewTime += viewTime;
    this.lastViewedAt = new Date().toISOString();
    this.lastAccessedAt = new Date().toISOString();
    
    if (!this.firstAccessedAt) {
      this.firstAccessedAt = new Date().toISOString();
    }
    
    this.updateTimestamp();
  }

  /**
   * تسجيل إعجاب
   */
  recordLike() {
    this.likeCount += 1;
    this.updateTimestamp();
  }

  /**
   * تسجيل مشاركة
   */
  recordShare() {
    this.shareCount += 1;
    this.updateTimestamp();
  }

  /**
   * تسجيل تحميل
   */
  recordDownload() {
    this.downloadCount += 1;
    this.updateTimestamp();
  }

  /**
   * تسجيل تشغيل (للدروس الصوتية)
   */
  recordPlay(playTime = 0) {
    this.playCount += 1;
    this.totalPlayTime += playTime;
    this.lastAccessedAt = new Date().toISOString();
    
    if (!this.firstAccessedAt) {
      this.firstAccessedAt = new Date().toISOString();
    }
    
    this.updateTimestamp();
  }

  /**
   * تسجيل قراءة (للكتب)
   */
  recordRead(readTime = 0) {
    this.readCount += 1;
    this.totalReadTime += readTime;
    this.lastAccessedAt = new Date().toISOString();
    
    if (!this.firstAccessedAt) {
      this.firstAccessedAt = new Date().toISOString();
    }
    
    this.updateTimestamp();
  }

  /**
   * تحديث التقييم
   */
  updateRating(newRating, oldRating = null) {
    if (typeof newRating !== 'number' || newRating < 0 || newRating > 5) {
      throw new Error('التقييم يجب أن يكون بين 0 و 5');
    }
    
    if (oldRating !== null) {
      // تحديث تقييم موجود
      const totalScore = this.averageRating * this.totalRatings;
      const newTotalScore = totalScore - oldRating + newRating;
      this.averageRating = newTotalScore / this.totalRatings;
    } else {
      // إضافة تقييم جديد
      const totalScore = this.averageRating * this.totalRatings;
      this.totalRatings += 1;
      this.averageRating = (totalScore + newRating) / this.totalRatings;
    }
    
    this.updateTimestamp();
  }

  /**
   * تحديث معدل الإكمال
   */
  updateCompletionRate(rate) {
    if (typeof rate !== 'number' || rate < 0 || rate > 1) {
      throw new Error('معدل الإكمال يجب أن يكون بين 0 و 1');
    }
    
    this.completionRate = rate;
    this.updateTimestamp();
  }

  /**
   * تحديث متوسط تقدم القراءة
   */
  updateAverageReadingProgress(progress) {
    if (typeof progress !== 'number' || progress < 0 || progress > 1) {
      throw new Error('تقدم القراءة يجب أن يكون بين 0 و 1');
    }
    
    this.averageReadingProgress = progress;
    this.updateTimestamp();
  }

  /**
   * الحصول على الوقت الإجمالي بتنسيق قابل للقراءة
   */
  getFormattedTotalTime() {
    const totalTime = this.totalViewTime + this.totalPlayTime + this.totalReadTime;
    
    if (totalTime === 0) return '0 دقيقة';
    
    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} ساعة ${minutes} دقيقة`;
    }
    
    return `${minutes} دقيقة`;
  }

  /**
   * الحصول على معدل التفاعل
   */
  getEngagementRate() {
    if (this.viewCount === 0) return 0;
    
    const totalInteractions = this.likeCount + this.shareCount + this.downloadCount;
    return totalInteractions / this.viewCount;
  }

  /**
   * الحصول على نشاط المحتوى (نشاط حديث)
   */
  getActivityScore() {
    const now = new Date();
    const lastAccessed = new Date(this.lastAccessedAt);
    const daysSinceLastAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);
    
    // كلما قل الوقت منذ آخر وصول، كلما زاد النشاط
    const recencyScore = Math.max(0, 1 - daysSinceLastAccess / 30); // 30 يوم كحد أقصى
    
    // دمج النشاط مع التفاعل
    const engagementScore = this.getEngagementRate();
    
    return (recencyScore * 0.6) + (engagementScore * 0.4);
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
      formattedTotalTime: this.getFormattedTotalTime(),
      engagementRate: this.getEngagementRate(),
      activityScore: this.getActivityScore(),
      metadata: this.getMetadata(),
      summary: {
        totalInteractions: this.likeCount + this.shareCount + this.downloadCount,
        totalTime: this.totalViewTime + this.totalPlayTime + this.totalReadTime,
        isActive: this.getActivityScore() > 0.3,
        popularityRank: this.viewCount > 100 ? 'high' : this.viewCount > 20 ? 'medium' : 'low',
      },
    };
  }

  /**
   * الحصول على إحصائيات المحتوى
   */
  static getContentStats(realm, contentId) {
    return realm.objectForPrimaryKey('ContentStats', contentId);
  }

  /**
   * الحصول على أكثر المحتوى مشاهدة
   */
  static getMostViewed(realm, contentType = null, limit = 10) {
    let filter = 'isDeleted == false AND viewCount > 0';
    
    if (contentType) {
      filter += ` AND contentType == "${contentType}"`;
    }
    
    return realm.objects('ContentStats')
      .filtered(filter)
      .sorted('viewCount', true)
      .slice(0, limit);
  }

  /**
   * الحصول على أكثر المحتوى تفاعلاً
   */
  static getMostEngaged(realm, contentType = null, limit = 10) {
    let results = realm.objects('ContentStats')
      .filtered('isDeleted == false' + (contentType ? ` AND contentType == "${contentType}"` : ''));
    
    // ترتيب حسب معدل التفاعل
    const sortedResults = Array.from(results).sort((a, b) => b.getEngagementRate() - a.getEngagementRate());
    
    return sortedResults.slice(0, limit);
  }

  /**
   * الحصول على المحتوى الأكثر نشاطاً
   */
  static getMostActive(realm, contentType = null, limit = 10) {
    let results = realm.objects('ContentStats')
      .filtered('isDeleted == false' + (contentType ? ` AND contentType == "${contentType}"` : ''));
    
    // ترتيب حسب نشاط المحتوى
    const sortedResults = Array.from(results).sort((a, b) => b.getActivityScore() - a.getActivityScore());
    
    return sortedResults.slice(0, limit);
  }

  /**
   * الحصول على إحصائيات عامة
   */
  static getOverallStats(realm, contentType = null) {
    let filter = 'isDeleted == false';
    
    if (contentType) {
      filter += ` AND contentType == "${contentType}"`;
    }
    
    const stats = realm.objects('ContentStats').filtered(filter);
    
    const totalViews = stats.sum('viewCount');
    const totalViewTime = stats.sum('totalViewTime');
    const totalLikes = stats.sum('likeCount');
    const totalShares = stats.sum('shareCount');
    const totalDownloads = stats.sum('downloadCount');
    const averageRating = stats.avg('averageRating');
    
    return {
      totalContent: stats.length,
      totalViews,
      totalViewTime,
      totalLikes,
      totalShares,
      totalDownloads,
      averageRating: averageRating || 0,
      engagementRate: totalViews > 0 ? (totalLikes + totalShares + totalDownloads) / totalViews : 0,
    };
  }
}

export default ContentStats; 