import { getRealm } from '../database/realmConfig';
import { ContentUsage } from '../database/realmConfig';

class UsageTrackingService {
  constructor() {
    this.realm = null;
  }

  async initWithRealm(realmInstance) {
    this.realm = realmInstance;
    console.log('📊 UsageTrackingService initialized');
  }

  // تسجيل مشاهدة محتوى
  async trackContentView(content, viewTimeSeconds = 0) {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const usageId = `usage_${content.id}`;
      const now = new Date();
      
      this.realm.write(() => {
        // البحث عن سجل موجود
        let usage = this.realm.objectForPrimaryKey('ContentUsage', usageId);
        
        if (usage) {
          // تحديث السجل الموجود
          usage.viewCount += 1;
          usage.totalViewTime += viewTimeSeconds;
          usage.lastViewedAt = now;
        } else {
          // إنشاء سجل جديد
          this.realm.create('ContentUsage', {
            id: usageId,
            contentId: content.id,
            contentName: content.bookName || content.name || 'بدون اسم',
            contentType: content.contentType || 'book',
            mainCategory: content.mainCategory || '',
            subCategory: content.subCategory || null,
            subSubCategory: content.subSubCategory || null,
            viewCount: 1,
            totalViewTime: viewTimeSeconds,
            lastViewedAt: now,
            firstViewedAt: now,
            createdAt: now,
          });
        }
      });

      console.log(`📊 Tracked view for content: ${content.bookName || content.name}`);
    } catch (error) {
      console.error('❌ Error tracking content view:', error);
    }
  }

  // الحصول على المحتوى الأكثر مشاهدة
  async getMostViewedContent(limit = 20) {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const usageRecords = this.realm
        .objects('ContentUsage')
        .sorted('viewCount', true)
        .slice(0, limit);

      // تحويل إلى مصفوفة مع تجميع البيانات
      const popularContent = [];
      for (const usage of usageRecords) {
        // البحث عن المحتوى الأصلي
        const originalContent = this.realm.objectForPrimaryKey('Book', usage.contentId);
        
        if (originalContent && !originalContent.isDeleted) {
          popularContent.push({
            id: originalContent.id,
            bookName: originalContent.bookName,
            bookUrl: originalContent.bookUrl,
            contentType: originalContent.contentType,
            mainCategory: originalContent.mainCategory,
            subCategory: originalContent.subCategory,
            subSubCategory: originalContent.subSubCategory,
            createdAt: originalContent.createdAt,
            // إحصائيات الاستخدام
            viewCount: usage.viewCount,
            totalViewTime: usage.totalViewTime,
            lastViewedAt: usage.lastViewedAt,
            firstViewedAt: usage.firstViewedAt,
          });
        }
      }

      console.log(`📊 Retrieved ${popularContent.length} popular content items`);
      return popularContent;
    } catch (error) {
      console.error('❌ Error getting most viewed content:', error);
      return [];
    }
  }

  // الحصول على المحتوى الأكثر مشاهدة حسب النوع
  async getMostViewedByType(contentType, limit = 10) {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const usageRecords = this.realm
        .objects('ContentUsage')
        .filtered('contentType = $0', contentType)
        .sorted('viewCount', true)
        .slice(0, limit);

      const popularContent = [];
      for (const usage of usageRecords) {
        const originalContent = this.realm.objectForPrimaryKey('Book', usage.contentId);
        
        if (originalContent && !originalContent.isDeleted) {
          popularContent.push({
            id: originalContent.id,
            bookName: originalContent.bookName,
            bookUrl: originalContent.bookUrl,
            contentType: originalContent.contentType,
            mainCategory: originalContent.mainCategory,
            subCategory: originalContent.subCategory,
            subSubCategory: originalContent.subSubCategory,
            viewCount: usage.viewCount,
            totalViewTime: usage.totalViewTime,
            lastViewedAt: usage.lastViewedAt,
          });
        }
      }

      return popularContent;
    } catch (error) {
      console.error('❌ Error getting most viewed by type:', error);
      return [];
    }
  }

  // الحصول على المحتوى الأكثر مشاهدة مؤخراً
  async getRecentlyViewedContent(limit = 10) {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const usageRecords = this.realm
        .objects('ContentUsage')
        .sorted('lastViewedAt', true)
        .slice(0, limit);

      const recentContent = [];
      for (const usage of usageRecords) {
        const originalContent = this.realm.objectForPrimaryKey('Book', usage.contentId);
        
        if (originalContent && !originalContent.isDeleted) {
          recentContent.push({
            id: originalContent.id,
            bookName: originalContent.bookName,
            bookUrl: originalContent.bookUrl,
            contentType: originalContent.contentType,
            mainCategory: originalContent.mainCategory,
            subCategory: originalContent.subCategory,
            subSubCategory: originalContent.subSubCategory,
            viewCount: usage.viewCount,
            lastViewedAt: usage.lastViewedAt,
          });
        }
      }

      return recentContent;
    } catch (error) {
      console.error('❌ Error getting recently viewed content:', error);
      return [];
    }
  }

  // إحصائيات الاستخدام العامة
  async getUsageStats() {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const allUsage = this.realm.objects('ContentUsage');
      
      const totalViews = allUsage.sum('viewCount');
      const totalViewTime = allUsage.sum('totalViewTime');
      const uniqueContent = allUsage.length;
      
      // إحصائيات حسب النوع
      const bookViews = allUsage.filtered('contentType = "book"').sum('viewCount');
      const videoViews = allUsage.filtered('contentType = "video"').sum('viewCount');
      const audioViews = allUsage.filtered('contentType = "audio"').sum('viewCount');

      return {
        totalViews,
        totalViewTime,
        uniqueContent,
        averageViewTime: uniqueContent > 0 ? totalViewTime / uniqueContent : 0,
        byType: {
          book: bookViews,
          video: videoViews,
          audio: audioViews,
        },
      };
    } catch (error) {
      console.error('❌ Error getting usage stats:', error);
      return {
        totalViews: 0,
        totalViewTime: 0,
        uniqueContent: 0,
        averageViewTime: 0,
        byType: { book: 0, video: 0, audio: 0 },
      };
    }
  }

  // حذف بيانات التتبع القديمة (أكثر من شهرين)
  async cleanupOldUsageData() {
    try {
      if (!this.realm) {
        this.realm = await getRealm();
      }

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const oldRecords = this.realm
        .objects('ContentUsage')
        .filtered('lastViewedAt < $0', twoMonthsAgo);

      if (oldRecords.length > 0) {
        this.realm.write(() => {
          this.realm.delete(oldRecords);
        });
        console.log(`🧹 Cleaned up ${oldRecords.length} old usage records`);
      }
    } catch (error) {
      console.error('❌ Error cleaning up old usage data:', error);
    }
  }
}

export default new UsageTrackingService(); 