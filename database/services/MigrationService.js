/**
 * خدمة المايجريشن - Migration Service
 * تساعد في الانتقال من النظام القديم إلى النظام الجديد
 */

import { DatabaseManager } from '../core/DatabaseManager';
import { getRealm as getOldRealm } from '../realmConfig';
import { Models, ModelNames } from '../models';

export class MigrationService {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.migrationStatus = {
      isRunning: false,
      completed: false,
      progress: 0,
      errors: [],
      migratedCounts: {
        books: 0,
        categories: 0,
        contentUsage: 0,
        subcategories: 0,
        lessons: 0,
        contentStats: 0,
      }
    };
  }

  /**
   * تشغيل المايجريشن الكامل
   */
  async runFullMigration() {
    if (this.migrationStatus.isRunning) {
      throw new Error('المايجريشن قيد التشغيل بالفعل');
    }

    try {
      this.migrationStatus.isRunning = true;
      this.migrationStatus.progress = 0;
      this.migrationStatus.errors = [];
      
      console.log('🔄 بدء المايجريشن الكامل...');
      
      // تهيئة قاعدة البيانات الجديدة
      await this.dbManager.initialize();
      
      // الحصول على قاعدة البيانات القديمة
      const oldRealm = await getOldRealm();
      
      // تشغيل خطوات المايجريشن
      await this.migrateCategories(oldRealm);
      this.migrationStatus.progress = 20;
      
      await this.migrateBooks(oldRealm);
      this.migrationStatus.progress = 50;
      
      await this.migrateContentUsage(oldRealm);
      this.migrationStatus.progress = 70;
      
      await this.createSubcategoriesFromBooks(oldRealm);
      this.migrationStatus.progress = 80;
      
      await this.createLessonsFromAudio(oldRealm);
      this.migrationStatus.progress = 90;
      
      await this.generateContentStats();
      this.migrationStatus.progress = 100;
      
      this.migrationStatus.completed = true;
      console.log('✅ تم إكمال المايجريشن بنجاح');
      
      return this.migrationStatus;
      
    } catch (error) {
      console.error('❌ خطأ في المايجريشن:', error);
      this.migrationStatus.errors.push(error.message);
      throw error;
    } finally {
      this.migrationStatus.isRunning = false;
    }
  }

  /**
   * مايجريشن الأقسام
   */
  async migrateCategories(oldRealm) {
    try {
      console.log('📂 مايجريشن الأقسام...');
      
      const oldCategories = oldRealm.objects('Category');
      const newRealm = this.dbManager.getInstance();
      
      await this.dbManager.safeWrite((realm) => {
        oldCategories.forEach(oldCategory => {
          try {
            // التحقق من وجود القسم
            const existing = realm.objects('Category').filtered('name == $0', oldCategory.mainCategory);
            if (existing.length > 0) {
              return;
            }
            
            // إنشاء قسم جديد
            const newCategory = realm.create('Category', {
              _id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: oldCategory.mainCategory,
              description: `قسم ${oldCategory.mainCategory}`,
              sortOrder: this.migrationStatus.migratedCounts.categories,
              isActive: true,
              color: this.getRandomColor(),
              icon: this.getCategoryIcon(oldCategory.mainCategory),
              tags: [oldCategory.mainCategory],
              metadata: {
                migratedFrom: 'old_system',
                originalId: oldCategory.id,
              },
              createdAt: oldCategory.createdAt ? oldCategory.createdAt.toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.categories++;
            console.log(`✅ تم مايجريشن القسم: ${oldCategory.mainCategory}`);
            
          } catch (error) {
            console.error(`❌ خطأ في مايجريشن القسم ${oldCategory.mainCategory}:`, error);
            this.migrationStatus.errors.push(`خطأ في مايجريشن القسم ${oldCategory.mainCategory}: ${error.message}`);
          }
        });
      });
      
      console.log(`📊 تم مايجريشن ${this.migrationStatus.migratedCounts.categories} قسم`);
      
    } catch (error) {
      console.error('❌ خطأ في مايجريشن الأقسام:', error);
      throw error;
    }
  }

  /**
   * مايجريشن الكتب
   */
  async migrateBooks(oldRealm) {
    try {
      console.log('📚 مايجريشن الكتب...');
      
      const oldBooks = oldRealm.objects('Book');
      const newRealm = this.dbManager.getInstance();
      
      await this.dbManager.safeWrite((realm) => {
        oldBooks.forEach(oldBook => {
          try {
            // التحقق من وجود الكتاب
            const existing = realm.objects('Book').filtered('title == $0 AND author == $1', 
              oldBook.bookName, 'غير محدد');
            if (existing.length > 0) {
              return;
            }
            
            // البحث عن القسم المطابق
            const category = realm.objects('Category').filtered('name == $0', oldBook.mainCategory)[0];
            const categoryId = category ? category._id : null;
            
            // إنشاء كتاب جديد
            const newBook = realm.create('Book', {
              _id: `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              title: oldBook.bookName,
              author: 'غير محدد',
              description: `كتاب ${oldBook.bookName}`,
              categoryId: categoryId,
              subcategoryId: null,
              contentType: oldBook.contentType || 'book',
              fileUrl: oldBook.bookUrl,
              fileName: this.extractFileName(oldBook.bookUrl),
              fileSize: 0,
              filePath: null,
              downloadStatus: 'not_downloaded',
              downloadProgress: 0,
              downloadedAt: null,
              isBookmarked: false,
              lastAccessedAt: null,
              readingProgress: {
                currentPage: 0,
                totalPages: 0,
                percentage: 0,
                timeSpent: 0,
                bookmarks: [],
              },
              rating: {
                userRating: 0,
                averageRating: 0,
                totalRatings: 0,
              },
              tags: [oldBook.mainCategory, oldBook.subCategory, oldBook.contentType].filter(Boolean),
              metadata: {
                migratedFrom: 'old_system',
                originalId: oldBook.id,
                originalCategory: oldBook.mainCategory,
                originalSubCategory: oldBook.subCategory,
                originalSubSubCategory: oldBook.subSubCategory,
              },
              createdAt: oldBook.createdAt ? oldBook.createdAt.toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.books++;
            console.log(`✅ تم مايجريشن الكتاب: ${oldBook.bookName}`);
            
          } catch (error) {
            console.error(`❌ خطأ في مايجريشن الكتاب ${oldBook.bookName}:`, error);
            this.migrationStatus.errors.push(`خطأ في مايجريشن الكتاب ${oldBook.bookName}: ${error.message}`);
          }
        });
      });
      
      console.log(`📊 تم مايجريشن ${this.migrationStatus.migratedCounts.books} كتاب`);
      
    } catch (error) {
      console.error('❌ خطأ في مايجريشن الكتب:', error);
      throw error;
    }
  }

  /**
   * مايجريشن بيانات الاستخدام
   */
  async migrateContentUsage(oldRealm) {
    try {
      console.log('📊 مايجريشن بيانات الاستخدام...');
      
      const oldUsage = oldRealm.objects('ContentUsage');
      const newRealm = this.dbManager.getInstance();
      
      await this.dbManager.safeWrite((realm) => {
        oldUsage.forEach(oldUsageItem => {
          try {
            // البحث عن المحتوى المطابق
            const book = realm.objects('Book').filtered('metadata.originalId == $0', oldUsageItem.contentId)[0];
            if (!book) {
              return;
            }
            
            // إنشاء إحصائية جديدة
            const contentStats = realm.create('ContentStats', {
              _id: `stats_${book._id}`,
              contentId: book._id,
              contentType: oldUsageItem.contentType || 'book',
              viewCount: oldUsageItem.viewCount || 0,
              totalViewTime: oldUsageItem.totalViewTime || 0,
              lastViewedAt: oldUsageItem.lastViewedAt ? oldUsageItem.lastViewedAt.toISOString() : null,
              firstViewedAt: oldUsageItem.firstViewedAt ? oldUsageItem.firstViewedAt.toISOString() : null,
              playbackStats: {
                totalPlayTime: oldUsageItem.totalViewTime || 0,
                averageSessionTime: 0,
                completionRate: 0,
                lastPosition: 0,
              },
              interactionStats: {
                likes: 0,
                shares: 0,
                downloads: 0,
                bookmarks: 0,
              },
              engagementScore: this.calculateEngagementScore(oldUsageItem.viewCount, oldUsageItem.totalViewTime),
              createdAt: oldUsageItem.createdAt ? oldUsageItem.createdAt.toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.contentUsage++;
            console.log(`✅ تم مايجريشن إحصائية: ${oldUsageItem.contentName}`);
            
          } catch (error) {
            console.error(`❌ خطأ في مايجريشن الإحصائية ${oldUsageItem.contentName}:`, error);
            this.migrationStatus.errors.push(`خطأ في مايجريشن الإحصائية: ${error.message}`);
          }
        });
      });
      
      console.log(`📊 تم مايجريشن ${this.migrationStatus.migratedCounts.contentUsage} إحصائية`);
      
    } catch (error) {
      console.error('❌ خطأ في مايجريشن بيانات الاستخدام:', error);
      throw error;
    }
  }

  /**
   * إنشاء الأقسام الفرعية من الكتب
   */
  async createSubcategoriesFromBooks(oldRealm) {
    try {
      console.log('📁 إنشاء الأقسام الفرعية...');
      
      const oldBooks = oldRealm.objects('Book');
      const newRealm = this.dbManager.getInstance();
      
      // جمع الأقسام الفرعية الفريدة
      const subcategoriesMap = new Map();
      
      oldBooks.forEach(book => {
        if (book.subCategory) {
          const key = `${book.mainCategory}|${book.subCategory}`;
          if (!subcategoriesMap.has(key)) {
            subcategoriesMap.set(key, {
              mainCategory: book.mainCategory,
              subCategory: book.subCategory,
              books: []
            });
          }
          subcategoriesMap.get(key).books.push(book);
        }
      });
      
      await this.dbManager.safeWrite((realm) => {
        subcategoriesMap.forEach((data, key) => {
          try {
            // البحث عن القسم الرئيسي
            const parentCategory = realm.objects('Category').filtered('name == $0', data.mainCategory)[0];
            if (!parentCategory) {
              return;
            }
            
            // إنشاء القسم الفرعي
            const subcategory = realm.create('Subcategory', {
              _id: `subcat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: data.subCategory,
              description: `قسم فرعي: ${data.subCategory}`,
              parentCategoryId: parentCategory._id,
              sortOrder: this.migrationStatus.migratedCounts.subcategories,
              isActive: true,
              color: this.getRandomColor(),
              icon: this.getSubcategoryIcon(data.subCategory),
              tags: [data.mainCategory, data.subCategory],
              statistics: {
                totalLessons: 0,
                totalDuration: 0,
                totalSize: 0,
                averageRating: 0,
              },
              metadata: {
                createdFrom: 'migration',
                bookCount: data.books.length,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.subcategories++;
            console.log(`✅ تم إنشاء القسم الفرعي: ${data.subCategory}`);
            
          } catch (error) {
            console.error(`❌ خطأ في إنشاء القسم الفرعي ${data.subCategory}:`, error);
          }
        });
      });
      
      console.log(`📊 تم إنشاء ${this.migrationStatus.migratedCounts.subcategories} قسم فرعي`);
      
    } catch (error) {
      console.error('❌ خطأ في إنشاء الأقسام الفرعية:', error);
      throw error;
    }
  }

  /**
   * إنشاء الدروس من الملفات الصوتية
   */
  async createLessonsFromAudio(oldRealm) {
    try {
      console.log('🎵 إنشاء الدروس من الملفات الصوتية...');
      
      const oldAudioBooks = oldRealm.objects('Book').filtered('contentType == "audio"');
      const newRealm = this.dbManager.getInstance();
      
      await this.dbManager.safeWrite((realm) => {
        oldAudioBooks.forEach(audioBook => {
          try {
            // البحث عن القسم الفرعي
            const subcategory = realm.objects('Subcategory').filtered('name == $0', audioBook.subCategory)[0];
            
            // إنشاء درس صوتي
            const lesson = realm.create('Lesson', {
              _id: `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              title: audioBook.bookName,
              description: `درس صوتي: ${audioBook.bookName}`,
              categoryId: null,
              subcategoryId: subcategory ? subcategory._id : null,
              speaker: 'غير محدد',
              duration: 0,
              fileUrl: audioBook.bookUrl,
              fileName: this.extractFileName(audioBook.bookUrl),
              fileSize: 0,
              filePath: null,
              downloadStatus: 'not_downloaded',
              downloadProgress: 0,
              downloadedAt: null,
              playbackStats: {
                currentPosition: 0,
                totalPlayTime: 0,
                playCount: 0,
                lastPlayedAt: null,
                completionRate: 0,
              },
              tags: [audioBook.mainCategory, audioBook.subCategory, 'audio'].filter(Boolean),
              metadata: {
                migratedFrom: 'old_system',
                originalId: audioBook.id,
                originalBookName: audioBook.bookName,
              },
              createdAt: audioBook.createdAt ? audioBook.createdAt.toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.lessons++;
            console.log(`✅ تم إنشاء الدرس: ${audioBook.bookName}`);
            
          } catch (error) {
            console.error(`❌ خطأ في إنشاء الدرس ${audioBook.bookName}:`, error);
          }
        });
      });
      
      console.log(`📊 تم إنشاء ${this.migrationStatus.migratedCounts.lessons} درس`);
      
    } catch (error) {
      console.error('❌ خطأ في إنشاء الدروس:', error);
      throw error;
    }
  }

  /**
   * توليد إحصائيات المحتوى
   */
  async generateContentStats() {
    try {
      console.log('📈 توليد إحصائيات المحتوى...');
      
      const newRealm = this.dbManager.getInstance();
      
      await this.dbManager.safeWrite((realm) => {
        // إنشاء إحصائيات للكتب التي لا تحتوي على إحصائيات
        const booksWithoutStats = realm.objects('Book').filtered('NOT _id IN $0', 
          realm.objects('ContentStats').map(stat => stat.contentId));
        
        booksWithoutStats.forEach(book => {
          try {
            const contentStats = realm.create('ContentStats', {
              _id: `stats_${book._id}`,
              contentId: book._id,
              contentType: book.contentType,
              viewCount: 0,
              totalViewTime: 0,
              lastViewedAt: null,
              firstViewedAt: null,
              playbackStats: {
                totalPlayTime: 0,
                averageSessionTime: 0,
                completionRate: 0,
                lastPosition: 0,
              },
              interactionStats: {
                likes: 0,
                shares: 0,
                downloads: 0,
                bookmarks: 0,
              },
              engagementScore: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.contentStats++;
            
          } catch (error) {
            console.error(`❌ خطأ في إنشاء إحصائية للكتاب ${book.title}:`, error);
          }
        });
        
        // إنشاء إحصائيات للدروس
        const lessonsWithoutStats = realm.objects('Lesson').filtered('NOT _id IN $0', 
          realm.objects('ContentStats').map(stat => stat.contentId));
        
        lessonsWithoutStats.forEach(lesson => {
          try {
            const contentStats = realm.create('ContentStats', {
              _id: `stats_${lesson._id}`,
              contentId: lesson._id,
              contentType: 'lesson',
              viewCount: 0,
              totalViewTime: 0,
              lastViewedAt: null,
              firstViewedAt: null,
              playbackStats: {
                totalPlayTime: 0,
                averageSessionTime: 0,
                completionRate: 0,
                lastPosition: 0,
              },
              interactionStats: {
                likes: 0,
                shares: 0,
                downloads: 0,
                bookmarks: 0,
              },
              engagementScore: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            this.migrationStatus.migratedCounts.contentStats++;
            
          } catch (error) {
            console.error(`❌ خطأ في إنشاء إحصائية للدرس ${lesson.title}:`, error);
          }
        });
      });
      
      console.log(`📊 تم توليد ${this.migrationStatus.migratedCounts.contentStats} إحصائية`);
      
    } catch (error) {
      console.error('❌ خطأ في توليد الإحصائيات:', error);
      throw error;
    }
  }

  /**
   * الحصول على حالة المايجريشن
   */
  getMigrationStatus() {
    return { ...this.migrationStatus };
  }

  /**
   * دوال مساعدة
   */
  getRandomColor() {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getCategoryIcon(categoryName) {
    const iconMap = {
      'القرآن الكريم': 'book',
      'الحديث الشريف': 'record_voice_over',
      'الفقه': 'gavel',
      'التفسير': 'description',
      'العقيدة': 'star',
      'السيرة': 'person',
      'الأخلاق': 'favorite',
      'الدعوة': 'campaign',
    };
    return iconMap[categoryName] || 'book';
  }

  getSubcategoryIcon(subcategoryName) {
    return 'folder';
  }

  extractFileName(url) {
    if (!url) return 'unknown';
    return url.split('/').pop().split('?')[0] || 'unknown';
  }

  calculateEngagementScore(viewCount, totalViewTime) {
    // حساب نقاط التفاعل بناءً على المشاهدات والوقت
    const viewScore = Math.min(viewCount * 10, 100);
    const timeScore = Math.min(totalViewTime / 60, 100); // تحويل إلى دقائق
    return Math.round((viewScore + timeScore) / 2);
  }
}

export default MigrationService; 