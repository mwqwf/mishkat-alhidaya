import { collection, getDocs, query, orderBy, where, limit, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

class SmartCacheService {
  constructor() {
    this.realm = null;
    this.isInitialized = false;
    this.categoriesLoaded = false;
    this.pageSize = 10;
    this.loadingState = new Map(); // تتبع حالة التحميل لكل صفحة
  }

  // تهيئة الخدمة
  async initialize(realmInstance) {
    try {
      this.realm = realmInstance;
      this.isInitialized = true;
      console.log('🚀 SmartCacheService initialized');
      
      // فحص التثبيت الأول
      const isFirstInstall = await this.isFirstInstall();
      if (isFirstInstall) {
        console.log('🆕 First app install detected');
        await this.performInitialLoad();
      } else {
        console.log('🔄 App already initialized, loading categories from cache');
        await this.loadCategoriesFromCache();
      }
    } catch (error) {
      console.error('❌ Error initializing SmartCacheService:', error);
    }
  }

  // فحص التثبيت الأول
  async isFirstInstall() {
    try {
      const installFlag = await AsyncStorage.getItem('app_initial_load_complete');
      return !installFlag;
    } catch (error) {
      console.error('Error checking first install:', error);
      return true; // افتراض التثبيت الأول في حالة الخطأ
    }
  }

  // التحميل الأولي عند التثبيت الأول
  async performInitialLoad() {
    try {
      console.log('📥 Starting initial categories load...');
      
      // فحص الاتصال
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('⚠️ No internet connection for initial load');
        return false;
      }

      // تحميل جميع الأقسام
      await this.loadAllCategories();
      
      // وضع علامة على اكتمال التحميل الأولي
      await AsyncStorage.setItem('app_initial_load_complete', 'true');
      await AsyncStorage.setItem('categories_last_sync', new Date().toISOString());
      
      console.log('✅ Initial load completed successfully');
      this.categoriesLoaded = true;
      return true;
    } catch (error) {
      console.error('❌ Error in initial load:', error);
      return false;
    }
  }

  // تحميل جميع الأقسام من Firebase وحفظها في Realm
  async loadAllCategories() {
    try {
      const startTime = Date.now();
      // جلب الأقسام الرئيسية من Firebase
      const categoriesQuery = query(collection(db, 'categories'));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      // جلب الأقسام الفرعية من Firebase
      const subcategoriesQuery = query(collection(db, 'subcategories'));
      const subcategoriesSnapshot = await getDocs(subcategoriesQuery);
      console.log('DEBUG Firebase subcategoriesSnapshot size:', subcategoriesSnapshot.size);
      if (subcategoriesSnapshot.size > 0) {
        const firstDoc = subcategoriesSnapshot.docs[0];
        console.log('DEBUG First Subcategory from Firebase:', firstDoc.id, firstDoc.data());
      }
      console.log(`📂 Found ${categoriesSnapshot.size} categories and ${subcategoriesSnapshot.size} subcategories in Firebase`);
      // حفظ في Realm
      this.realm.write(() => {
        // مسح الأقسام الموجودة
        const existingCategories = this.realm.objects('Category');
        this.realm.delete(existingCategories);
        const existingSubcategories = this.realm.objects('Subcategory');
        this.realm.delete(existingSubcategories);
        // إضافة الأقسام الجديدة
        categoriesSnapshot.forEach(doc => {
          const data = doc.data();
          // طباعة تفصيلية لتشخيص المشكلة
          console.log('DEBUG Category:', {
            id: doc.id,
            name: data.name,
            nameType: typeof data.name,
            mainCategory: data.mainCategory,
            mainCategoryType: typeof data.mainCategory,
            description: data.description,
            descriptionType: typeof data.description,
            sortOrder: data.sortOrder,
            sortOrderType: typeof data.sortOrder,
            isActive: data.isActive,
            isActiveType: typeof data.isActive,
            icon: data.icon,
            iconType: typeof data.icon,
            color: data.color,
            colorType: typeof data.color,
            totalSubcategories: data.totalSubcategories,
            totalSubcategoriesType: typeof data.totalSubcategories,
            totalContent: data.totalContent,
            totalContentType: typeof data.totalContent,
            tags: data.tags,
            tagsType: typeof data.tags,
            metadata: data.metadata,
            metadataType: typeof data.metadata,
          });
          // حماية ضد السجلات التالفة أو الناقصة
          if (typeof data.name !== 'string' && typeof data.mainCategory !== 'string') {
            console.warn(`⚠️ Skipping category with missing name/mainCategory. doc.id=${doc.id}, data=`, data);
            return;
          }
          const name = (typeof data.name === 'string' && data.name.trim()) ? data.name : (typeof data.mainCategory === 'string' ? data.mainCategory : '');
          if (!name) {
            console.warn(`⚠️ Skipping category with empty name. doc.id=${doc.id}, data=`, data);
            return;
          }
          this.realm.create('Category', {
            _id: doc.id, // <-- التصحيح هنا
            name: String(name),
            mainCategory: String(data.mainCategory || name),
            description: String(data.description || ''),
            sortOrder: Number(data.sortOrder || 0),
            isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
            icon: String(data.icon || ''),
            color: String(data.color || '#4A90E2'),
            totalSubcategories: Number(data.totalSubcategories || 0),
            totalContent: Number(data.totalContent || 0),
            tags: String(data.tags || ''),
            metadata: String(data.metadata || '{}'),
            isDeleted: false,
            createdAt: data.createdAt
              ? (typeof data.createdAt.toDate === 'function'
                  ? data.createdAt.toDate()
                  : new Date(data.createdAt))
              : new Date(),
            lastSyncedAt: new Date()
          });
        });
        // ترحيل إضافي للبيانات القديمة في الريلم (لو وجدت)
        const allCategories = this.realm.objects('Category');
        allCategories.forEach(cat => {
          if (!cat.name && cat.mainCategory) {
            cat.name = cat.mainCategory;
          }
        });
        // إضافة الأقسام الفرعية الجديدة
        subcategoriesSnapshot.forEach(doc => {
          const data = doc.data();
          this.realm.create('Subcategory', {
            id: doc.id, // <-- التصحيح هنا
            name: data.name || '',
            description: data.description || '',
            categoryId: data.categoryId || '',
            sortOrder: data.sortOrder || 0,
            isActive: data.isActive !== undefined ? data.isActive : true,
            icon: data.icon || '',
            color: data.color || '#6C7B7F',
            totalLessons: data.totalLessons || 0,
            totalDuration: data.totalDuration || 0,
            tags: data.tags || '',
            metadata: data.metadata || '{}',
            isDeleted: false
          });
        });
        // كود تشخيصي شامل بعد حفظ الأقسام الفرعية
        const allSubcategories = this.realm.objects('Subcategory');
        console.log('DEBUG Subcategory COUNT:', allSubcategories.length);
        allSubcategories.slice(0, 5).forEach(sub => {
          console.log('DEBUG Subcategory:', {
            id: sub.id,
            name: sub.name,
            categoryId: sub.categoryId
          });
        });
        const allCategoriesForDebug = this.realm.objects('Category');
        console.log('DEBUG All Category IDs:', allCategoriesForDebug.map(cat => cat.id));
        // طباعة نتيجة الفلترة لدالة getSubCategories لكل قسم رئيسي
        allCategoriesForDebug.slice(0, 5).forEach(cat => {
          const filtered = this.realm.objects('Subcategory').filtered('categoryId == $0 AND isDeleted == false', cat.id);
          console.log(`DEBUG Filtered Subcategories for Category id=${cat.id} name=${cat.name}:`, Array.from(filtered).map(sub => ({id: sub.id, name: sub.name})));
        });
      });
      const endTime = Date.now();
      console.log(`✅ Categories and subcategories loaded and cached in ${endTime - startTime}ms`);
      return true;
    } catch (error) {
      console.error('❌ Error loading categories:', error);
      throw error;
    }
  }

  // تحميل الأقسام من الكاش
  async loadCategoriesFromCache() {
    try {
      const categories = this.realm.objects('Category');
      console.log(`📂 Loaded ${categories.length} categories from cache`);
      this.categoriesLoaded = true;
      return Array.from(categories);
    } catch (error) {
      console.error('❌ Error loading categories from cache:', error);
      return [];
    }
  }

  // تحميل محتوى قسم فرعي ثانوي عند التصفح
  async loadCategoryContent(mainCategory, subCategory, subSubCategory, force = false) {
    try {
      const cacheKey = `${mainCategory}_${subCategory}_${subSubCategory}`;
      
      // فحص إذا كان المحتوى موجود في الكاش
      if (!force) {
        const cachedContent = await this.getCachedContent(mainCategory, subCategory, subSubCategory);
        if (cachedContent.length > 0) {
          console.log(`📚 Found ${cachedContent.length} cached items for ${cacheKey}`);
          return cachedContent;
        }
      }
      
      // فحص الاتصال
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('⚠️ No internet connection, returning cached content only');
        return await this.getCachedContent(mainCategory, subCategory, subSubCategory);
      }

      console.log(`📥 Loading fresh content for ${cacheKey}...`);
      
      // جلب المحتوى من Firebase
      let booksQuery = query(
        collection(db, 'books'),
        where('mainCategory', '==', mainCategory),
        where('subCategory', '==', subCategory),
        orderBy('createdAt', 'desc')
      );
      
      if (subSubCategory) {
        booksQuery = query(
          collection(db, 'books'),
          where('mainCategory', '==', mainCategory),
          where('subCategory', '==', subCategory),
          where('subSubCategory', '==', subSubCategory),
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(booksQuery);
      const books = [];
      
      // حفظ في Realm
      this.realm.write(() => {
        snapshot.forEach(doc => {
          const data = doc.data();
          const book = {
            id: doc.id,
            bookName: data.bookName || '',
            bookUrl: data.bookUrl || '',
            mainCategory: data.mainCategory || '',
            subCategory: data.subCategory || '',
            subSubCategory: data.subSubCategory || '',
            contentType: data.contentType || 'book',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastAccessed: new Date(),
            isDeleted: false,
            isContentAvailable: true // متاح أوفلاين
          };
          
          // حفظ أو تحديث في Realm
          const existingBook = this.realm.objectForPrimaryKey('Book', doc.id);
          if (existingBook) {
            existingBook.lastAccessed = new Date();
            existingBook.updatedAt = book.updatedAt;
            existingBook.isContentAvailable = true;
          } else {
            this.realm.create('Book', book);
          }
          
          books.push(book);
        });
      });
      
      console.log(`✅ Loaded and cached ${books.length} items for ${cacheKey}`);
      return books;
      
    } catch (error) {
      console.error(`❌ Error loading content for ${mainCategory}/${subCategory}/${subSubCategory}:`, error);
      // إرجاع المحتوى المحفوظ في حالة الخطأ
      return await this.getCachedContent(mainCategory, subCategory, subSubCategory);
    }
  }

  // تحميل المحتوى المضاف مؤخراً مع التمرير اللانهائي
  async loadRecentContent(page = 0, pageSize = this.pageSize) {
    try {
      const cacheKey = `recent_content_${page}`;
      
      // فحص إذا كانت الصفحة قيد التحميل
      if (this.loadingState.get(cacheKey)) {
        console.log(`⏳ Page ${page} already loading, skipping...`);
        return { items: [], hasMore: false, fromCache: true };
      }
      
      this.loadingState.set(cacheKey, true);
      
      try {
        // أولاً: تحميل من الكاش
        const cachedItems = await this.getCachedRecentContent(page, pageSize);
        
        // فحص الاتصال للتحديث
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log(`📱 Offline: returning ${cachedItems.length} cached recent items (page ${page})`);
          return { 
            items: cachedItems, 
            hasMore: cachedItems.length === pageSize,
            fromCache: true 
          };
        }

        // تحميل من Firebase مع pagination
        let booksQuery = query(
          collection(db, 'books'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
        
        // إضافة startAfter للصفحات التالية
        if (page > 0) {
          const lastItemTimestamp = await this.getLastItemTimestamp(page - 1, pageSize);
          if (lastItemTimestamp) {
            booksQuery = query(
              collection(db, 'books'),
              orderBy('createdAt', 'desc'),
              startAfter(lastItemTimestamp),
              limit(pageSize)
            );
          }
        }
        
        const snapshot = await getDocs(booksQuery);
        const items = [];
        
        // حفظ في Realm
        this.realm.write(() => {
          snapshot.forEach(doc => {
            const data = doc.data();
            const book = {
              id: doc.id,
              bookName: data.bookName || '',
              bookUrl: data.bookUrl || '',
              mainCategory: data.mainCategory || '',
              subCategory: data.subCategory || '',
              subSubCategory: data.subSubCategory || '',
              contentType: data.contentType || 'book',
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
              lastAccessed: new Date(),
              isDeleted: false,
              isContentAvailable: true // متاح أوفلاين
            };
            
            // حفظ أو تحديث في Realm
            const existingBook = this.realm.objectForPrimaryKey('Book', doc.id);
            if (existingBook) {
              existingBook.lastAccessed = new Date();
              existingBook.updatedAt = book.updatedAt;
              existingBook.isContentAvailable = true;
            } else {
              this.realm.create('Book', book);
            }
            
            items.push(book);
          });
        });
        
        console.log(`✅ Loaded ${items.length} recent items (page ${page})`);
        
        return {
          items,
          hasMore: items.length === pageSize,
          fromCache: false
        };
        
      } finally {
        this.loadingState.delete(cacheKey);
      }
      
    } catch (error) {
      console.error(`❌ Error loading recent content (page ${page}):`, error);
      this.loadingState.delete(cacheKey);
      
      // إرجاع المحتوى المحفوظ في حالة الخطأ
      const cachedItems = await this.getCachedRecentContent(page, pageSize);
      return { 
        items: cachedItems, 
        hasMore: false,
        fromCache: true 
      };
    }
  }

  // تحميل مستجدات التطبيق مع التمرير اللانهائي
  async loadAppUpdates(page = 0, pageSize = this.pageSize) {
    try {
      const cacheKey = `app_updates_${page}`;
      
      if (this.loadingState.get(cacheKey)) {
        console.log(`⏳ Updates page ${page} already loading, skipping...`);
        return { items: [], hasMore: false, fromCache: true };
      }
      
      this.loadingState.set(cacheKey, true);
      
      try {
        // فحص الاتصال
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log(`📱 Offline: no app updates available`);
          return { items: [], hasMore: false, fromCache: true };
        }

        // تحميل من Firebase مع pagination
        let updatesQuery = query(
          collection(db, 'appUpdates'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
        
        if (page > 0) {
          const lastUpdateTimestamp = await this.getLastUpdateTimestamp(page - 1, pageSize);
          if (lastUpdateTimestamp) {
            updatesQuery = query(
              collection(db, 'appUpdates'),
              orderBy('createdAt', 'desc'),
              startAfter(lastUpdateTimestamp),
              limit(pageSize)
            );
          }
        }
        
        const snapshot = await getDocs(updatesQuery);
        const updates = [];
        
        snapshot.forEach(doc => {
          const data = doc.data();
          updates.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date()
          });
        });
        
        console.log(`✅ Loaded ${updates.length} app updates (page ${page})`);
        
        return {
          items: updates,
          hasMore: updates.length === pageSize,
          fromCache: false
        };
        
      } finally {
        this.loadingState.delete(cacheKey);
      }
      
    } catch (error) {
      console.error(`❌ Error loading app updates (page ${page}):`, error);
      this.loadingState.delete(cacheKey);
      return { items: [], hasMore: false, fromCache: true };
    }
  }

  // =============== Helper Methods ===============

  // الحصول على المحتوى المحفوظ - محسن للتعامل مع قاعدة البيانات القديمة
  async getCachedContent(mainCategory, subCategory, subSubCategory) {
    try {
      let filter = `mainCategory == "${mainCategory}" AND isDeleted == false`;
      
      // إضافة فلتر isContentAvailable فقط إذا كان متوفراً
      try {
        const testBooks = this.realm.objects('Book');
        if (testBooks.length > 0 && 'isContentAvailable' in testBooks[0]) {
          filter += ` AND isContentAvailable == true`;
        }
      } catch (error) {
        console.warn('isContentAvailable field not available, skipping filter');
      }
      
      if (subCategory) filter += ` AND subCategory == "${subCategory}"`;
      if (subSubCategory) filter += ` AND subSubCategory == "${subSubCategory}"`;
      
      const books = this.realm.objects('Book').filtered(filter).sorted('createdAt', true);
      return Array.from(books);
    } catch (error) {
      console.error('Error getting cached content:', error);
      return [];
    }
  }

  // الحصول على المحتوى المضاف مؤخراً من الكاش
  async getCachedRecentContent(page, pageSize) {
    try {
      const books = this.realm.objects('Book')
        .filtered('isDeleted == false AND isContentAvailable == true')
        .sorted('createdAt', true)
        .slice(page * pageSize, (page + 1) * pageSize);
      return Array.from(books);
    } catch (error) {
      console.error('Error getting cached recent content:', error);
      return [];
    }
  }

  // الحصول على timestamp آخر عنصر للـ pagination
  async getLastItemTimestamp(page, pageSize) {
    try {
      const books = this.realm.objects('Book')
        .filtered('isDeleted == false')
        .sorted('createdAt', true)
        .slice(0, (page + 1) * pageSize);
      
      if (books.length > 0) {
        return books[books.length - 1].createdAt;
      }
      return null;
    } catch (error) {
      console.error('Error getting last item timestamp:', error);
      return null;
    }
  }

  // الحصول على timestamp آخر تحديث للـ pagination
  async getLastUpdateTimestamp(page, pageSize) {
    // هذه دالة مساعدة للمستجدات، يمكن تحسينها لاحقاً
    return null;
  }

  // الحصول على الأقسام
  getCategories() {
    try {
      const categories = this.realm.objects('Category').filtered('isDeleted == false');
      return Array.from(categories);
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  // الحصول على الأقسام الرئيسية
  getMainCategories() {
    try {
      // جلب جميع الأقسام الرئيسية من موديل Category
      const categories = this.realm.objects('Category').filtered('isDeleted == false');
      return Array.from(categories);
    } catch (error) {
      console.error('Error getting main categories:', error);
      return [];
    }
  }

  // الحصول على الأقسام الفرعية
  getSubCategories(mainCategoryOrId) {
    try {
      let mainCategoryId = mainCategoryOrId;
      // إذا تم تمرير اسم القسم، ابحث أولاً بالحقل name ثم mainCategory
      if (typeof mainCategoryOrId === 'string' && mainCategoryOrId.length && !/^[a-f0-9]{24}$/i.test(mainCategoryOrId)) {
        let category = this.realm.objects('Category').filtered('name == $0 AND isDeleted == false', mainCategoryOrId)[0];
        if (!category) {
          category = this.realm.objects('Category').filtered('mainCategory == $0 AND isDeleted == false', mainCategoryOrId)[0];
        }
        if (!category) return [];
        mainCategoryId = category._id;
      }
      const subcategories = this.realm.objects('Subcategory').filtered('categoryId == $0 AND isDeleted == false', mainCategoryId);
      return Array.from(subcategories);
    } catch (error) {
      console.error('Error getting sub categories:', error);
      return [];
    }
  }

  // الحصول على الأقسام الفرعية الثانوية (إذا كان لديك موديل خاص بها)
  getSubSubCategories(subCategoryId) {
    try {
      // إذا كان لديك موديل SubSubcategory:
      if (this.realm.schema.find(s => s.name === 'SubSubcategory')) {
        const subSubcategories = this.realm.objects('SubSubcategory').filtered('subCategoryId == $0 AND isDeleted == false', subCategoryId);
        return Array.from(subSubcategories);
      }
      // إذا لم يكن لديك موديل خاص، أرجع مصفوفة فارغة
      return [];
    } catch (error) {
      console.error('Error getting sub-sub categories:', error);
      return [];
    }
  }

  // تحديث إحصائيات الاستخدام
  updateUsageStats(itemId, itemType) {
    try {
      this.realm.write(() => {
        if (itemType === 'content') {
          const book = this.realm.objectForPrimaryKey('Book', itemId);
          if (book) {
            book.lastAccessed = new Date();
          }
        }
      });
    } catch (error) {
      console.error('Error updating usage stats:', error);
    }
  }

  // تنظيف البيانات القديمة
  async cleanupOldData(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      this.realm.write(() => {
        const oldBooks = this.realm.objects('Book')
          .filtered(`lastAccessed < $0`, cutoffDate);
        
        console.log(`🧹 Cleaning up ${oldBooks.length} old books`);
        this.realm.delete(oldBooks);
      });
    } catch (error) {
      console.error('Error cleaning up old data:', error);
    }
  }
}

export default new SmartCacheService(); 