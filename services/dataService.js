import { collection, getDocs, query, orderBy, where, limit, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { SYNC_CONFIG, syncUtils } from '../config/syncConfig';
import offlineContentManager from './OfflineContentManager';
import offlineContentService from './OfflineContentService';

class DataService {
  constructor() {
    this.realm = null;
    this.isInitialized = false;
    this.offlineContentManager = offlineContentManager;
    this.offlineContentService = offlineContentService;
  }

  // تهيئة مع Realm instance من RealmProvider
  async initWithRealm(realmInstance) {
    try {
      const startTime = new Date();
      this.realm = realmInstance;
      this.isInitialized = true;
      
      // تهيئة مدير المحتوى الـ Offline
      this.offlineContentManager.initialize(realmInstance);
      
             // تهيئة خدمة المحتوى الـ Offline المحسنة
       await this.offlineContentService.initialize(realmInstance);
       
       // تنظيف الأقسام المكررة عند التهيئة
       await this.cleanupDuplicateCategories();
      
      syncUtils.logSyncPerformance('Realm Initialization', startTime);
      syncUtils.logSyncStatus('✅ DataService initialized with Realm Database + Offline Content Manager + Enhanced Offline Content Service');
    } catch (error) {
      console.error('Error initializing DataService:', error);
      throw error;
    }
  }

  async ensureRealm() {
    if (!this.realm || !this.isInitialized) {
      throw new Error('DataService not initialized. Call initWithRealm() first.');
    }
    
    // التحقق من أن Realm لم يتم إغلاقه
    if (this.realm.isClosed) {
      throw new Error('Realm has been closed. Please reinitialize DataService.');
    }
    
    return this.realm;
  }

  // =============== إدارة الكتب ===============

  // جلب جميع الكتب من Realm
  async getAllBooks() {
    try {
      const realm = await this.ensureRealm();
      const books = realm.objects('Book').filtered('isDeleted == false');
      return Array.from(books).map(book => ({
        id: book.id,
        bookName: book.bookName,
        bookUrl: book.bookUrl,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory,
        contentType: book.contentType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      }));
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، أرجع مصفوفة فارغة بدلاً من تسجيل الخطأ
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('Realm was closed - returning empty books array');
        return [];
      }
      console.error('Error getting books from Realm:', error);
      return [];
    }
  }

  // جلب الكتب حسب الأقسام
  async getBooksByCategory(mainCategory, subCategory = null, subSubCategory = null) {
    try {
      const realm = await this.ensureRealm();
      
      let filter = `mainCategory == "${mainCategory}" AND isDeleted == false`;
      if (subCategory) {
        filter += ` AND subCategory == "${subCategory}"`;
      }
      if (subSubCategory) {
        filter += ` AND subSubCategory == "${subSubCategory}"`;
      }
      
      const books = realm.objects('Book').filtered(filter);
      return Array.from(books).map(book => ({
        id: book.id,
        bookName: book.bookName,
        bookUrl: book.bookUrl,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory,
        contentType: book.contentType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      }));
    } catch (error) {
      console.error('Error getting books by category from Realm:', error);
      return [];
    }
  }

  // جلب الكتب المضافة مؤخراً مع إمكانية التحكم في العدد والبداية
  async getRecentBooks(limit = 20, offset = 0) {
    try {
      const realm = await this.ensureRealm();
      const books = realm.objects('Book')
        .filtered('isDeleted == false')
        .sorted('createdAt', true);
      
      // تطبيق الـ offset والـ limit
      const totalBooks = books.length;
      const startIndex = offset;
      const endIndex = Math.min(offset + limit, totalBooks);
      
      if (startIndex >= totalBooks) {
        return []; // لا توجد المزيد من الكتب
      }
      
      const slicedBooks = books.slice(startIndex, endIndex);
      
      return Array.from(slicedBooks).map(book => ({
        id: book.id,
        bookName: book.bookName,
        bookUrl: book.bookUrl,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory,
        contentType: book.contentType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      }));
    } catch (error) {
      console.error('Error getting recent books from Realm:', error);
      return [];
    }
  }

  // =============== إدارة الأقسام ===============

  // جلب الأقسام الرئيسية
  async getMainCategories() {
    try {
      const realm = await this.ensureRealm();
      
      // جلب الأقسام الرئيسية من جدول Book
      console.log('📊 Getting main categories from Book table...');
      const books = realm.objects('Book').filtered('isDeleted == false');
      
      let mainCategoriesFromBooks = [];
      if (books.length > 0) {
        console.log(`📊 Found ${books.length} books, extracting main categories...`);
        mainCategoriesFromBooks = [...new Set(Array.from(books).map(book => book.mainCategory))];
        mainCategoriesFromBooks = mainCategoriesFromBooks.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${mainCategoriesFromBooks.length} main categories from Book table:`, mainCategoriesFromBooks);
      }
      
      // جلب الأقسام الرئيسية من جدول Category (الأقسام الفارغة)
      console.log('📊 Getting main categories from Category table...');
      const categories = realm.objects('Category').filtered('isDeleted == false');
      
      let mainCategoriesFromCategory = [];
      if (categories.length > 0) {
        console.log(`📊 Found ${categories.length} categories, extracting main categories...`);
        mainCategoriesFromCategory = [...new Set(Array.from(categories).map(cat => cat.mainCategory))];
        mainCategoriesFromCategory = mainCategoriesFromCategory.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${mainCategoriesFromCategory.length} main categories from Category table:`, mainCategoriesFromCategory);
      }
      
      // دمج الأقسام من كلا الجدولين مع إزالة التكرار
      const allMainCategories = [...new Set([...mainCategoriesFromBooks, ...mainCategoriesFromCategory])];
      console.log(`📊 Combined ${allMainCategories.length} unique main categories:`, allMainCategories);
      
      return allMainCategories;
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، أرجع مصفوفة فارغة بدلاً من تسجيل الخطأ
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('Realm was closed - returning empty categories array');
        return [];
      }
      console.error('Error getting main categories from Realm:', error);
      return [];
    }
  }

  // إنشاء الأقسام الفرعية الفارغة إذا لم تكن موجودة
  async createEmptySubCategories(mainCategory) {
    try {
      const realm = await this.ensureRealm();
      
      // إنشاء بعض الأقسام الفرعية الافتراضية لكل قسم رئيسي
      const defaultSubCategories = [
        'عام',
        'متنوع',
        'أساسي',
        'متقدم'
      ];
      
             realm.write(() => {
         defaultSubCategories.forEach(subCategory => {
           const existingSubCategory = realm.objects('Category')
             .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory}" AND isDeleted == false`);
           
           if (existingSubCategory.length === 0) {
             realm.create('Category', {
               id: `empty_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: subCategory,
               mainCategory: mainCategory.trim(),
               subCategory: subCategory,
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
             console.log(`📂 Created empty sub category: ${mainCategory.trim()} > ${subCategory}`);
           } else {
             console.log(`📂 Sub category already exists: ${mainCategory.trim()} > ${subCategory}`);
           }
         });
       });
      
      console.log(`📂 Empty sub categories created for: ${mainCategory}`);
    } catch (error) {
      console.error('❌ Error creating empty sub categories:', error);
    }
  }

    // جلب الأقسام الفرعية
  async getSubCategories(mainCategory) {
    try {
      const realm = await this.ensureRealm();
      
      // جلب الأقسام الفرعية من جدول Category (الأقسام الفارغة)
      console.log(`📊 Getting sub-categories from Category table for ${mainCategory}...`);
      const categories = realm.objects('Category')
        .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory != null AND isDeleted == false`);
      
      let subCategoriesFromCategory = [];
      if (categories.length > 0) {
        console.log(`📊 Found ${categories.length} sub-categories in Category table`);
        subCategoriesFromCategory = [...new Set(Array.from(categories).map(cat => cat.subCategory))];
        subCategoriesFromCategory = subCategoriesFromCategory.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${subCategoriesFromCategory.length} sub-categories from Category table:`, subCategoriesFromCategory);
      }
      
      // جلب الأقسام الفرعية من جدول Book (الأقسام التي تحتوي على محتوى)
      console.log(`📊 Getting sub-categories from Book table for ${mainCategory}...`);
      const books = realm.objects('Book')
        .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory != null AND isDeleted == false`);
      
      let subCategoriesFromBooks = [];
      if (books.length > 0) {
        console.log(`📊 Found ${books.length} books, extracting sub-categories...`);
        subCategoriesFromBooks = [...new Set(Array.from(books).map(book => book.subCategory))];
        subCategoriesFromBooks = subCategoriesFromBooks.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${subCategoriesFromBooks.length} sub-categories from Book table:`, subCategoriesFromBooks);
      }
      
      // دمج الأقسام من كلا الجدولين مع إزالة التكرار
      const allSubCategories = [...new Set([...subCategoriesFromCategory, ...subCategoriesFromBooks])];
      console.log(`📊 Combined ${allSubCategories.length} unique sub-categories for ${mainCategory}:`, allSubCategories);
      
      return allSubCategories;
    } catch (error) {
      console.error('Error getting sub categories from Realm:', error);
      return [];
    }
  }

  // إنشاء جميع الأقسام الموجودة في Firebase
  async createAllExistingCategoriesInFirebase() {
    try {
      console.log('📂 Creating all existing categories in Firebase...');
      
      const realm = await this.ensureRealm();
      
      // جلب جميع الأقسام الرئيسية من جدول Book
      const allBooks = realm.objects('Book').filtered('isDeleted == false');
      const mainCategories = [...new Set(Array.from(allBooks).map(book => book.mainCategory?.trim()).filter(Boolean))];
      
      console.log(`📂 Found ${mainCategories.length} main categories to create in Firebase:`, mainCategories);
      
      for (const mainCategory of mainCategories) {
        // إنشاء القسم الرئيسي
        const mainCategoryQuery = query(collection(db, 'categories'), where('mainCategory', '==', mainCategory));
        const mainCategorySnap = await getDocs(mainCategoryQuery);
        
        if (mainCategorySnap.empty) {
          await addDoc(collection(db, 'categories'), {
            mainCategory: mainCategory,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`📂 Created main category in Firebase: ${mainCategory}`);
        }
        
        // جلب الأقسام الفرعية لهذا القسم الرئيسي
        const booksInMainCategory = allBooks.filtered(`mainCategory == "${mainCategory}"`);
        const subCategories = [...new Set(Array.from(booksInMainCategory).map(book => book.subCategory?.trim()).filter(Boolean))];
        
        for (const subCategory of subCategories) {
          // إنشاء القسم الفرعي
          const subCategoryQuery = query(
            collection(db, 'categories'), 
            where('mainCategory', '==', mainCategory),
            where('subCategory', '==', subCategory)
          );
          const subCategorySnap = await getDocs(subCategoryQuery);
          
          if (subCategorySnap.empty) {
            await addDoc(collection(db, 'categories'), {
              mainCategory: mainCategory,
              subCategory: subCategory,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            console.log(`📂 Created sub category in Firebase: ${mainCategory} > ${subCategory}`);
          }
          
          // جلب الأقسام الفرعية الثانوية
          const booksInSubCategory = booksInMainCategory.filtered(`subCategory == "${subCategory}"`);
          const subSubCategories = [...new Set(Array.from(booksInSubCategory).map(book => book.subSubCategory?.trim()).filter(Boolean))];
          
          for (const subSubCategory of subSubCategories) {
            // إنشاء القسم الفرعي الثانوي
            const subSubCategoryQuery = query(
              collection(db, 'categories'), 
              where('mainCategory', '==', mainCategory),
              where('subCategory', '==', subCategory),
              where('subSubCategory', '==', subSubCategory)
            );
            const subSubCategorySnap = await getDocs(subSubCategoryQuery);
            
            if (subSubCategorySnap.empty) {
              await addDoc(collection(db, 'categories'), {
                mainCategory: mainCategory,
                subCategory: subCategory,
                subSubCategory: subSubCategory,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              console.log(`📂 Created sub-sub category in Firebase: ${mainCategory} > ${subCategory} > ${subSubCategory}`);
            }
          }
        }
      }
      
      console.log('📂 All existing categories created in Firebase successfully');
    } catch (error) {
      console.error('❌ Error creating existing categories in Firebase:', error);
    }
  }

  // إنشاء جميع الأقسام الموجودة في Realm المحلي
  async createAllExistingCategoriesInRealm() {
    try {
      console.log('📂 Creating all existing categories in Realm...');
      
      const realm = await this.ensureRealm();
      
      // جلب جميع الأقسام الرئيسية من جدول Book
      const allBooks = realm.objects('Book').filtered('isDeleted == false');
      const mainCategories = [...new Set(Array.from(allBooks).map(book => book.mainCategory?.trim()).filter(Boolean))];
      
      console.log(`📂 Found ${mainCategories.length} main categories to create in Realm:`, mainCategories);
      
      realm.write(() => {
        for (const mainCategory of mainCategories) {
          // إنشاء القسم الرئيسي إذا لم يكن موجوداً
          const existingMainCategory = realm.objects('Category')
            .filtered(`mainCategory == "${mainCategory}" AND isDeleted == false`);
          
                     if (existingMainCategory.length === 0) {
             realm.create('Category', {
               id: `main_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: mainCategory,
               mainCategory: mainCategory,
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
            console.log(`📂 Created main category in Realm: ${mainCategory}`);
          }
          
          // جلب الأقسام الفرعية لهذا القسم الرئيسي
          const booksInMainCategory = allBooks.filtered(`mainCategory == "${mainCategory}"`);
          const subCategories = [...new Set(Array.from(booksInMainCategory).map(book => book.subCategory?.trim()).filter(Boolean))];
          
          for (const subCategory of subCategories) {
            // إنشاء القسم الفرعي إذا لم يكن موجوداً
            const existingSubCategory = realm.objects('Category')
              .filtered(`mainCategory == "${mainCategory}" AND subCategory == "${subCategory}" AND isDeleted == false`);
            
                         if (existingSubCategory.length === 0) {
               realm.create('Category', {
                 id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                 name: subCategory,
                 mainCategory: mainCategory,
                 subCategory: subCategory,
                 createdAt: new Date(),
                 updatedAt: new Date(),
                 isDeleted: false
               });
              console.log(`📂 Created sub category in Realm: ${mainCategory} > ${subCategory}`);
            }
            
            // جلب الأقسام الفرعية الثانوية
            const booksInSubCategory = booksInMainCategory.filtered(`subCategory == "${subCategory}"`);
            const subSubCategories = [...new Set(Array.from(booksInSubCategory).map(book => book.subSubCategory?.trim()).filter(Boolean))];
            
            for (const subSubCategory of subSubCategories) {
              // إنشاء القسم الفرعي الثانوي إذا لم يكن موجوداً
              const existingSubSubCategory = realm.objects('Category')
                .filtered(`mainCategory == "${mainCategory}" AND subCategory == "${subCategory}" AND subSubCategory == "${subSubCategory}" AND isDeleted == false`);
              
                             if (existingSubSubCategory.length === 0) {
                 realm.create('Category', {
                   id: `subsub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                   name: subSubCategory,
                   mainCategory: mainCategory,
                   subCategory: subCategory,
                   subSubCategory: subSubCategory,
                   createdAt: new Date(),
                   updatedAt: new Date(),
                   isDeleted: false
                 });
                console.log(`📂 Created sub-sub category in Realm: ${mainCategory} > ${subCategory} > ${subSubCategory}`);
              }
            }
          }
        }
      });
      
      console.log('📂 All existing categories created in Realm successfully');
    } catch (error) {
      console.error('❌ Error creating existing categories in Realm:', error);
    }
  }

  // إنشاء الأقسام في Realm المحلي
  async createCategoriesInRealm(mainCategory, subCategory, subSubCategory) {
    try {
      const realm = await this.ensureRealm();
      
      console.log('📂 Creating categories in Realm:', { mainCategory, subCategory, subSubCategory });
      
      // إنشاء القسم الرئيسي إذا لم يكن موجوداً
      if (mainCategory && mainCategory.trim()) {
        const existingMainCategory = realm.objects('Category')
          .filtered(`mainCategory == "${mainCategory.trim()}" AND isDeleted == false`);
        
        if (existingMainCategory.length === 0) {
                     realm.write(() => {
             realm.create('Category', {
               id: `main_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: mainCategory.trim(),
               mainCategory: mainCategory.trim(),
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
           });
          console.log(`📂 Created main category in Realm: ${mainCategory.trim()}`);
        }
      }
      
      // إنشاء القسم الفرعي إذا لم يكن موجوداً
      if (subCategory && subCategory.trim()) {
        const existingSubCategory = realm.objects('Category')
          .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory.trim()}" AND isDeleted == false`);
        
        if (existingSubCategory.length === 0) {
                     realm.write(() => {
             realm.create('Category', {
               id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: subCategory.trim(),
               mainCategory: mainCategory.trim(),
               subCategory: subCategory.trim(),
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
           });
          console.log(`📂 Created sub category in Realm: ${mainCategory.trim()} > ${subCategory.trim()}`);
        }
      }
      
      // إنشاء القسم الفرعي الثانوي إذا لم يكن موجوداً
      if (subSubCategory && subSubCategory.trim()) {
        const existingSubSubCategory = realm.objects('Category')
          .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory.trim()}" AND subSubCategory == "${subSubCategory.trim()}" AND isDeleted == false`);
        
        if (existingSubSubCategory.length === 0) {
                     realm.write(() => {
             realm.create('Category', {
               id: `subsub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: subSubCategory.trim(),
               mainCategory: mainCategory.trim(),
               subCategory: subCategory.trim(),
               subSubCategory: subSubCategory.trim(),
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
           });
          console.log(`📂 Created sub-sub category in Realm: ${mainCategory.trim()} > ${subCategory.trim()} > ${subSubCategory.trim()}`);
        }
      }
      
      console.log('📂 Categories creation in Realm completed successfully');
    } catch (error) {
      console.error('❌ Error creating categories in Realm:', error);
    }
  }

  // جلب الأقسام الفرعية الثانوية
  async getSubSubCategories(mainCategory, subCategory) {
    try {
      const realm = await this.ensureRealm();
      
      // جلب الأقسام الفرعية الثانوية من جدول Category (الأقسام الفارغة)
      console.log(`📊 Getting sub-sub-categories from Category table for ${mainCategory} > ${subCategory}...`);
      const categories = realm.objects('Category')
        .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory.trim()}" AND subSubCategory != null AND isDeleted == false`);
      
      let subSubCategoriesFromCategory = [];
      if (categories.length > 0) {
        console.log(`📊 Found ${categories.length} sub-sub-categories in Category table`);
        subSubCategoriesFromCategory = [...new Set(Array.from(categories).map(cat => cat.subSubCategory))];
        subSubCategoriesFromCategory = subSubCategoriesFromCategory.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${subSubCategoriesFromCategory.length} sub-sub-categories from Category table:`, subSubCategoriesFromCategory);
      }
      
      // جلب الأقسام الفرعية الثانوية من جدول Book (الأقسام التي تحتوي على محتوى)
      console.log(`📊 Getting sub-sub-categories from Book table for ${mainCategory} > ${subCategory}...`);
      const books = realm.objects('Book')
        .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory.trim()}" AND subSubCategory != null AND isDeleted == false`);
      
      let subSubCategoriesFromBooks = [];
      if (books.length > 0) {
        console.log(`📊 Found ${books.length} books, extracting sub-sub-categories...`);
        subSubCategoriesFromBooks = [...new Set(Array.from(books).map(book => book.subSubCategory))];
        subSubCategoriesFromBooks = subSubCategoriesFromBooks.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1
        );
        console.log(`📊 Extracted ${subSubCategoriesFromBooks.length} sub-sub-categories from Book table:`, subSubCategoriesFromBooks);
      }
      
      // دمج الأقسام من كلا الجدولين مع إزالة التكرار
      const allSubSubCategories = [...new Set([...subSubCategoriesFromCategory, ...subSubCategoriesFromBooks])];
      console.log(`📊 Combined ${allSubSubCategories.length} unique sub-sub-categories for ${mainCategory} > ${subCategory}:`, allSubSubCategories);
      
      return allSubSubCategories;
    } catch (error) {
      console.error('Error getting sub-sub categories from Realm:', error);
      return [];
    }
  }

  // =============== إدارة الإحصائيات ===============

  // حساب الإحصائيات
  async calculateStats() {
    try {
      const realm = await this.ensureRealm();
      
      const allBooks = realm.objects('Book').filtered('isDeleted == false');
      const totalBooks = allBooks.filtered('contentType == "book"').length;
      const totalVideos = allBooks.filtered('contentType == "video"').length;
      const totalAudios = allBooks.filtered('contentType == "audio"').length;
      
      // حساب الأقسام من جدول Book بدلاً من Category
      const categoryTable = realm.objects('Category').filtered('isDeleted == false');
      let totalCategories = categoryTable.length;
      
      // إذا كان جدول Category فارغ، احسب من جدول Book
      if (totalCategories === 0) {
        const mainCategories = [...new Set(Array.from(allBooks).map(book => book.mainCategory))];
        totalCategories = mainCategories.filter(cat => cat && cat.trim()).length;
        console.log(`📊 Calculated categories from Book table: ${totalCategories}`);
      } else {
        console.log(`📊 Using categories from Category table: ${totalCategories}`);
      }

      const stats = {
        totalBooks,
        totalVideos,
        totalAudios,
        totalCategories,
        totalContent: allBooks.length,
      };

      // حفظ الإحصائيات في Realm
      realm.write(() => {
        const existingStats = realm.objectForPrimaryKey('AppStats', 'main');
        const statsData = {
          totalBooks,
          totalVideos,
          totalAudios,
          totalCategories,
          lastUpdated: new Date(),
        };

        if (existingStats) {
          // تحديث الخصائص بدون تغيير المفتاح الأساسي
          existingStats.totalBooks = statsData.totalBooks;
          existingStats.totalVideos = statsData.totalVideos;
          existingStats.totalAudios = statsData.totalAudios;
          existingStats.totalCategories = statsData.totalCategories;
          existingStats.lastUpdated = statsData.lastUpdated;
        } else {
          realm.create('AppStats', {
            id: 'main',
            ...statsData
          });
        }
      });

      console.log('📊 Stats calculated:', stats);
      return stats;
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، أرجع إحصائيات فارغة
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('Realm was closed - returning empty stats');
        return {
          totalBooks: 0,
          totalVideos: 0,
          totalAudios: 0,
          totalCategories: 0,
          totalContent: 0,
        };
      }
      console.error('Error calculating stats from Realm:', error);
      return {
        totalBooks: 0,
        totalVideos: 0,
        totalAudios: 0,
        totalCategories: 0,
        totalContent: 0,
      };
    }
  }

  // =============== المزامنة مع Firebase ===============

  // اختبار الاتصال بـ Firebase
  async testFirebaseConnection() {
    try {
      console.log('🔄 Testing Firebase connection...');
      
      // اختبار الاتصال مع جلب عينة من البيانات
      const [categoriesTest, booksTest] = await Promise.all([
        getDocs(query(collection(db, 'categories'), limit(1))),
        getDocs(query(collection(db, 'books'), limit(1)))
      ]);
      
      console.log(`✅ Firebase connection successful - Categories: ${categoriesTest.size}, Books: ${booksTest.size}`);
      
      if (categoriesTest.size === 0 && booksTest.size === 0) {
        console.log('⚠️ Firebase collections are empty - no data to sync');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Firebase connection failed:', error);
      return false;
    }
  }

  // التحقق من وجود بيانات كافية في Realm - محسن للعمل Offline-First
  async hasLocalData() {
    try {
      const realm = await this.ensureRealm();
      
      // فحص سريع للبيانات
      const bookCount = realm.objects('Book').filtered('isDeleted == false').length;
      const categoryCount = realm.objects('Category').filtered('isDeleted == false').length;
      
      console.log(`📊 Local data check: ${bookCount} books, ${categoryCount} categories`);
      
      // في وضع Offline-First، نعتبر أي بيانات كافية
      if (SYNC_CONFIG.OFFLINE_FIRST_PRIORITY) {
        const hasAnyData = bookCount > 0 || categoryCount > 0;
        console.log(`📊 Offline-First mode: hasAnyData = ${hasAnyData}`);
        return hasAnyData;
      }
      
      // المنطق القديم للمتطلبات الدنيا
      const hasEnoughData = bookCount >= SYNC_CONFIG.MIN_BOOKS_FOR_OFFLINE && 
                           categoryCount >= SYNC_CONFIG.MIN_CATEGORIES_FOR_OFFLINE;
      
      console.log(`📊 Standard mode: hasEnoughData = ${hasEnoughData}`);
      return hasEnoughData;
      
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، اعتبر أن البيانات غير كافية
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('🔄 Realm was closed during data check - assuming no data');
        return false;
      }
      console.error('❌ Error checking local data:', error);
      return false;
    }
  }

  // فحص تفصيلي للبيانات المحلية (جديد)
  async getLocalDataSummary() {
    try {
      const realm = await this.ensureRealm();
      
      const books = realm.objects('Book').filtered('isDeleted == false');
      const categories = realm.objects('Category').filtered('isDeleted == false');
      
      const booksByType = {
        total: books.length,
        books: books.filtered('contentType == "book"').length,
        videos: books.filtered('contentType == "video"').length,
        audios: books.filtered('contentType == "audio"').length,
      };
      
      const mainCategories = [...new Set(Array.from(categories).map(cat => cat.mainCategory))];
      
      const summary = {
        books: booksByType,
        totalCategories: categories.length,
        mainCategories: mainCategories.length,
        mainCategoriesList: mainCategories,
        isEmpty: books.length === 0 && categories.length === 0,
        hasMinimalData: books.length > 0 || categories.length > 0,
      };
      
      console.log('📊 Local data summary:', summary);
      return summary;
      
    } catch (error) {
      console.error('❌ Error getting local data summary:', error);
      return {
        books: { total: 0, books: 0, videos: 0, audios: 0 },
        totalCategories: 0,
        mainCategories: 0,
        mainCategoriesList: [],
        isEmpty: true,
        hasMinimalData: false,
      };
    }
  }

  // مزامنة الكتب من Firebase
  async syncBooksFromFirebase(forceSync = false) {
    const startTime = new Date();
    
    try {
      const realm = await this.ensureRealm();

      // إذا لم تكن مزامنة إجبارية، تحقق من آخر مزامنة
      if (!forceSync) {
      const syncStatus = realm.objectForPrimaryKey('SyncStatus', 'books');
        if (syncStatus && !syncStatus.isFirstSync) {
        const isDue = syncUtils.isSyncDue(syncStatus.lastSyncedAt, SYNC_CONFIG.BOOKS_SYNC_INTERVAL);
        if (!isDue) {
            console.log('📚 Books sync skipped - too recent');
          return false;
          }
        }
      }

      console.log('📚 Starting books sync from Firebase...');
      
      // جلب الكتب من Firebase
      const booksQuery = query(collection(db, 'books'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(booksQuery);
      
      console.log(`📚 Firebase returned ${snapshot.size} books`);
      
      if (snapshot.empty) {
        console.log('📚 No books found in Firebase');
        return false;
      }
      
      // حفظ البيانات في Realm
      realm.write(() => {
        snapshot.forEach((doc) => {
          const data = doc.data();
          const existingBook = realm.objectForPrimaryKey('Book', doc.id);
          
          const bookData = {
            bookName: data.bookName || '',
            bookUrl: data.bookUrl || '',
            mainCategory: data.mainCategory || '',
            subCategory: data.subCategory || '',
            subSubCategory: data.subSubCategory || '',
            contentType: data.contentType || 'book',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || null,
            lastSyncedAt: new Date(),
            isDeleted: false,
          };

          if (existingBook) {
            // تحديث الكتاب الموجود
            existingBook.bookName = bookData.bookName;
            existingBook.bookUrl = bookData.bookUrl;
            existingBook.mainCategory = bookData.mainCategory;
            existingBook.subCategory = bookData.subCategory;
            existingBook.subSubCategory = bookData.subSubCategory;
            existingBook.contentType = bookData.contentType;
            existingBook.createdAt = bookData.createdAt;
            existingBook.updatedAt = bookData.updatedAt;
            existingBook.lastSyncedAt = bookData.lastSyncedAt;
            existingBook.isDeleted = bookData.isDeleted;
          } else {
            // إضافة كتاب جديد
            realm.create('Book', {
              id: doc.id,
              ...bookData
            });
          }
        });

        // تحديث حالة المزامنة
        const syncStatus = realm.objectForPrimaryKey('SyncStatus', 'books');
        const syncData = {
          lastSyncedAt: new Date(),
          isFirstSync: false,
        };

        if (syncStatus) {
          syncStatus.lastSyncedAt = syncData.lastSyncedAt;
          syncStatus.isFirstSync = syncData.isFirstSync;
        } else {
          realm.create('SyncStatus', {
            collection: 'books',
            ...syncData
          });
        }
      });

      syncUtils.logSyncPerformance('Books Sync', startTime, snapshot.size);
      console.log(`✅ Books synced successfully: ${snapshot.size} books`);
      return true;
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، أرجع false بدلاً من تسجيل الخطأ
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('Realm was closed during books sync - will retry later');
        return false;
      }
      console.error('❌ Error syncing books from Firebase:', error);
      syncUtils.logSyncStatus('Books sync failed', { error: error.message });
      return false;
    }
  }

  // مزامنة الأقسام من Firebase
  async syncCategoriesFromFirebase(forceSync = false) {
    try {
      const realm = await this.ensureRealm();

      // إذا لم تكن مزامنة إجبارية، تحقق من آخر مزامنة
      if (!forceSync) {
        const syncStatus = realm.objectForPrimaryKey('SyncStatus', 'categories');
        if (syncStatus && !syncStatus.isFirstSync) {
          const isDue = syncUtils.isSyncDue(syncStatus.lastSyncedAt, SYNC_CONFIG.CATEGORIES_SYNC_INTERVAL);
          if (!isDue) {
            console.log('📂 Categories sync skipped - too recent');
            return false;
          }
        }
      }

      console.log('📂 Starting categories sync from Firebase...');
      
      // جلب الأقسام من Firebase
      const categoriesQuery = query(collection(db, 'categories'));
      const snapshot = await getDocs(categoriesQuery);
      
      console.log(`📂 Firebase returned ${snapshot.size} categories from categories collection`);
      
      // حفظ البيانات في Realm
      realm.write(() => {
        snapshot.forEach((doc) => {
          const data = doc.data();
          const existingCategory = realm.objectForPrimaryKey('Category', doc.id);
          
          const categoryData = {
            id: doc.id,
            name: data.name || data.mainCategory || '',
            mainCategory: data.mainCategory || '',
            subCategory: data.subCategory || '',
            subSubCategory: data.subSubCategory || '',
            description: data.description || '',
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
            icon: data.icon || 'folder',
            color: data.color || '#4A90E2',
            tags: data.tags || '',
            metadata: data.metadata || '{}',
            totalSubcategories: typeof data.totalSubcategories === 'number' ? data.totalSubcategories : 0,
            totalContent: typeof data.totalContent === 'number' ? data.totalContent : 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false,
            syncStatus: 'synced'
          };

          if (existingCategory) {
            // تحديث القسم الموجود
            existingCategory.name = categoryData.name;
            existingCategory.mainCategory = categoryData.mainCategory;
            existingCategory.subCategory = categoryData.subCategory;
            existingCategory.subSubCategory = categoryData.subSubCategory;
            existingCategory.description = categoryData.description;
            existingCategory.sortOrder = categoryData.sortOrder;
            existingCategory.isActive = categoryData.isActive;
            existingCategory.icon = categoryData.icon;
            existingCategory.color = categoryData.color;
            existingCategory.tags = categoryData.tags;
            existingCategory.metadata = categoryData.metadata;
            existingCategory.totalSubcategories = categoryData.totalSubcategories;
            existingCategory.totalContent = categoryData.totalContent;
            existingCategory.updatedAt = categoryData.updatedAt;
            existingCategory.isDeleted = categoryData.isDeleted;
            existingCategory.syncStatus = categoryData.syncStatus;
          } else {
            // إضافة قسم جديد
            realm.create('Category', categoryData);
          }
        });

        // تحديث حالة المزامنة
        const syncStatus = realm.objectForPrimaryKey('SyncStatus', 'categories');
        const syncData = {
          lastSyncedAt: new Date().toISOString(),
          isFirstSync: false,
        };

        if (syncStatus) {
          syncStatus.lastSyncedAt = syncData.lastSyncedAt;
          syncStatus.isFirstSync = syncData.isFirstSync;
        } else {
          realm.create('SyncStatus', {
            collection: 'categories',
            ...syncData
          });
        }
      });

      console.log(`✅ Categories synced successfully: ${snapshot.size} categories`);
      return true;
    } catch (error) {
      console.error('❌ Error syncing categories from Firebase:', error);
      return false;
    }
  }

  // =============== إدارة البيانات المحلية ===============

  // مزامنة شاملة محسنة للعمل Offline-First
  async syncAllData(forceSync = false) {
    try {
      console.log('🔄 Starting full data sync...', forceSync ? '(forced)' : '(conditional)');
      
      // في وضع Offline-First، نتحقق من البيانات المحلية أولاً
      if (SYNC_CONFIG.OFFLINE_FIRST_PRIORITY && !forceSync) {
        const localSummary = await this.getLocalDataSummary();
        
        // إذا كانت لدينا بيانات محلية، نتجاهل المزامنة إلا إذا كانت مطلوبة
        if (localSummary.hasMinimalData) {
          console.log('✅ Local data available in Offline-First mode - skipping sync');
          return {
            categories: false,
            books: false,
            success: false,
            reason: 'offline_first_has_data',
            localSummary
          };
        }
      } else if (!forceSync) {
        // المنطق القديم للفحص
        const hasData = await this.hasLocalData();
        if (hasData) {
          console.log('✅ Sufficient local data available - skipping sync');
          return {
            categories: false,
            books: false,
            success: false,
            reason: 'sufficient_local_data'
          };
        }
      }
      
      // إذا وصلنا هنا، نحتاج للمزامنة
      console.log('🚀 Starting sync - no local data or forced sync');
      
      // تشغيل المزامنة بشكل متوازي لتوفير الوقت
      console.log('🚀 Starting parallel sync for categories and books...');
      const results = await Promise.allSettled([
        this.syncCategoriesFromFirebase(forceSync),
        this.syncBooksFromFirebase(forceSync),
      ]);

      const categoriesResult = results[0].status === 'fulfilled' ? results[0].value : false;
      const booksResult = results[1].status === 'fulfilled' ? results[1].value : false;

      console.log(`✅ Sync completed - Categories: ${categoriesResult ? '✅' : '❌'}, Books: ${booksResult ? '✅' : '❌'}`);
      
      // إضافة ملخص البيانات المحلية بعد المزامنة
      const finalSummary = await this.getLocalDataSummary();
      
      return {
        categories: categoriesResult,
        books: booksResult,
        success: categoriesResult || booksResult,
        localSummary: finalSummary,
      };
    } catch (error) {
      console.error('❌ Error in full sync:', error);
      
      // حتى في حالة الخطأ، نحاول إرجاع ملخص البيانات المحلية
      const errorSummary = await this.getLocalDataSummary();
      
      return {
        categories: false,
        books: false,
        success: false,
        error: error.message,
        localSummary: errorSummary,
      };
    }
  }

  // حذف جميع البيانات المحلية
  async clearLocalData() {
    try {
      const realm = await this.ensureRealm();
      
      realm.write(() => {
        realm.deleteAll();
      });
      
      console.log('Local data cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing local data:', error);
      return false;
    }
  }

  // إحصائيات قاعدة البيانات المحلية
  async getLocalDatabaseStats() {
    try {
      const realm = await this.ensureRealm();
      
      const totalBooks = realm.objects('Book').filtered('isDeleted == false').length;
      const totalCategories = realm.objects('Category').filtered('isDeleted == false').length;
      const lastBooksSync = realm.objectForPrimaryKey('SyncStatus', 'books');
      const lastCategoriesSync = realm.objectForPrimaryKey('SyncStatus', 'categories');
      
      return {
        totalBooks,
        totalCategories,
        lastBooksSync: lastBooksSync?.lastSyncedAt || null,
        lastCategoriesSync: lastCategoriesSync?.lastSyncedAt || null,
        databasePath: realm.path,
      };
    } catch (error) {
      console.error('Error getting local database stats:', error);
      return null;
    }
  }

  // البحث في الكتب
  async searchBooks(searchTerm) {
    try {
      const realm = await this.ensureRealm();
      const searchText = searchTerm.toLowerCase();
      
      const books = realm.objects('Book').filtered('isDeleted == false');
      const filteredBooks = Array.from(books).filter(book => 
        book.bookName.toLowerCase().includes(searchText) ||
        book.mainCategory.toLowerCase().includes(searchText) ||
        book.subCategory.toLowerCase().includes(searchText) ||
        (book.subSubCategory && book.subSubCategory.toLowerCase().includes(searchText))
      );
      
      return filteredBooks.map(book => ({
        id: book.id,
        bookName: book.bookName,
        bookUrl: book.bookUrl,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory,
        contentType: book.contentType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      }));
    } catch (error) {
      console.error('Error searching books:', error);
      return [];
    }
  }

  // البحث الشامل في جميع أنواع المحتوى
  async globalSearch(searchTerm) {
    try {
      const realm = await this.ensureRealm();
      const searchText = searchTerm.toLowerCase().trim();
      
      if (!searchText) return [];

      const results = [];

      // البحث في الكتب
      const books = realm.objects('Book').filtered('isDeleted == false');
      Array.from(books).forEach(book => {
        const searchableText = `${book.bookName || ''} ${book.mainCategory || ''} ${book.subCategory || ''} ${book.subSubCategory || ''}`.toLowerCase();
        if (searchableText.includes(searchText)) {
          results.push({
            id: `book_${book.id}`,
            title: book.bookName,
            subtitle: `${book.mainCategory} / ${book.subCategory}${book.subSubCategory ? ` / ${book.subSubCategory}` : ''}`,
            type: book.contentType || 'book',
            data: {
              id: book.id,
              bookName: book.bookName,
              bookUrl: book.bookUrl,
              mainCategory: book.mainCategory,
              subCategory: book.subCategory,
              subSubCategory: book.subSubCategory,
              contentType: book.contentType,
            },
            searchableText,
            createdAt: book.createdAt,
            relevance: this.calculateRelevance(searchableText, book.bookName.toLowerCase(), searchText),
          });
        }
      });

      // البحث في الفئات - تصحيح الحقول
      const categories = realm.objects('Category').filtered('isDeleted == false');
      Array.from(categories).forEach(category => {
        // استخدام mainCategory بدلاً من name
        const categoryName = category.mainCategory || '';
        const searchableText = `${categoryName} ${category.subCategory || ''} ${category.subSubCategory || ''}`.toLowerCase();
        
        if (searchableText.includes(searchText)) {
          // إضافة الأقسام الرئيسية
          if (categoryName && !results.find(r => r.id === `category_${categoryName}`)) {
            results.push({
              id: `category_${categoryName}`,
              title: categoryName,
              subtitle: 'قسم رئيسي',
              type: 'category',
              data: {
                mainCategory: categoryName,
              },
              searchableText: categoryName.toLowerCase(),
              createdAt: category.createdAt || new Date(),
              relevance: this.calculateRelevance(categoryName.toLowerCase(), categoryName.toLowerCase(), searchText),
            });
          }
          
          // إضافة الأقسام الفرعية
          if (category.subCategory && !results.find(r => r.id === `subcategory_${categoryName}_${category.subCategory}`)) {
            results.push({
              id: `subcategory_${categoryName}_${category.subCategory}`,
              title: category.subCategory,
              subtitle: `${categoryName} / قسم فرعي`,
              type: 'subcategory',
              data: {
                mainCategory: categoryName,
                subCategory: category.subCategory,
              },
              searchableText: `${category.subCategory} ${categoryName}`.toLowerCase(),
              createdAt: category.createdAt || new Date(),
              relevance: this.calculateRelevance(`${category.subCategory} ${categoryName}`.toLowerCase(), category.subCategory.toLowerCase(), searchText),
            });
          }
          
          // إضافة الأقسام الثانوية
          if (category.subSubCategory && !results.find(r => r.id === `subsubcategory_${categoryName}_${category.subCategory}_${category.subSubCategory}`)) {
            results.push({
              id: `subsubcategory_${categoryName}_${category.subCategory}_${category.subSubCategory}`,
              title: category.subSubCategory,
              subtitle: `${categoryName} / ${category.subCategory} / قسم ثانوي`,
              type: 'subsubcategory',
              data: {
                mainCategory: categoryName,
                subCategory: category.subCategory,
                subSubCategory: category.subSubCategory,
              },
              searchableText: `${category.subSubCategory} ${category.subCategory} ${categoryName}`.toLowerCase(),
              createdAt: category.createdAt || new Date(),
              relevance: this.calculateRelevance(`${category.subSubCategory} ${category.subCategory} ${categoryName}`.toLowerCase(), category.subSubCategory.toLowerCase(), searchText),
            });
          }
        }
      });

      // ترتيب النتائج حسب الصلة
      return results.sort((a, b) => b.relevance - a.relevance);

    } catch (error) {
      console.error('Error in global search:', error);
      return [];
    }
  }

  // حساب درجة الصلة للبحث
  calculateRelevance(searchableText, title, searchTerm) {
    let score = 0;
    const searchTerms = searchTerm.split(/\s+/);

    searchTerms.forEach(term => {
      // التطابق التام في العنوان يحصل على أعلى درجة
      if (title === term) score += 100;
      else if (title.startsWith(term)) score += 80;
      else if (title.includes(term)) score += 60;
      
      // التطابق في النص القابل للبحث
      if (searchableText.includes(term)) score += 30;
      
      // تطابق جزئي للأحرف
      const termChars = term.split('');
      let partialMatch = 0;
      termChars.forEach(char => {
        if (searchableText.includes(char)) partialMatch += 1;
      });
      score += (partialMatch / termChars.length) * 10;
    });

    return score;
  }

  // حذف حالة المزامنة لإجبار المزامنة الأولى
  async resetSyncStatus() {
    try {
      const realm = await this.ensureRealm();
      
      realm.write(() => {
        const syncStatuses = realm.objects('SyncStatus');
        realm.delete(syncStatuses);
      });
      
      console.log('Sync status reset - will trigger fresh sync');
      return true;
    } catch (error) {
      // إذا كان الخطأ متعلق بـ Realm المغلق، أرجع false بدلاً من تسجيل الخطأ
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('Realm was closed - cannot reset sync status');
        return false;
      }
      console.error('Error resetting sync status:', error);
      return false;
    }
  }

  // =============== إدارة المحتوى Offline-First ===============

  // تحميل محتوى للتخزين المحلي (الدالة الرئيسية للـ Offline)
  async downloadContentForOffline(contentId, onProgress = null) {
    try {
      const realm = await this.ensureRealm();
      const content = realm.objectForPrimaryKey('Book', contentId);
      
      if (!content) {
        throw new Error('Content not found');
      }

      console.log(`🔄 Starting offline download for: ${content.bookName}`);
      
      const result = await this.offlineContentManager.downloadAndCacheContent(content, onProgress);
      
      if (result.success) {
        console.log(`✅ Content is now available offline: ${content.bookName}`);
        return {
          success: true,
          message: `تم تحميل "${content.bookName}" بنجاح للاستخدام بدون إنترنت`,
          localPath: result.localPath
        };
      } else {
        throw new Error('Download failed');
      }
      
    } catch (error) {
      console.error('Error downloading content for offline:', error);
      return {
        success: false,
        message: `فشل في تحميل المحتوى: ${error.message}`
      };
    }
  }

  // التحقق من توفر المحتوى محلياً - محسن
  async isContentAvailableOffline(contentId) {
    try {
      // استخدام OfflineContentService للتحقق من اكتمال التحميل
      if (this.offlineContentService && this.offlineContentService.isInitialized) {
        return await this.offlineContentService.isDownloadComplete(contentId);
      }
      
      // fallback للطريقة القديمة
      return await this.offlineContentManager.isContentAvailableOffline(contentId);
    } catch (error) {
      console.error('Error checking offline availability:', error);
      return false;
    }
  }

  // الحصول على مسار المحتوى المحلي
  getLocalContentPath(contentId) {
    try {
      return this.offlineContentManager.getLocalContentPath(contentId);
    } catch (error) {
      console.error('Error getting local content path:', error);
      return null;
    }
  }

  // الحصول على جميع المحتوى المتاح محلياً (للعرض في وضع Offline)
  getOfflineContent() {
    try {
      return this.offlineContentManager.getOfflineContent();
    } catch (error) {
      console.error('Error getting offline content:', error);
      return [];
    }
  }

  // حذف محتوى محلي
  async deleteLocalContent(contentId) {
    try {
      const result = await this.offlineContentManager.deleteLocalContent(contentId);
      
      if (result) {
        console.log(`✅ Local content deleted successfully`);
        return {
          success: true,
          message: 'تم حذف المحتوى المحلي بنجاح'
        };
      } else {
        return {
          success: false,
          message: 'فشل في حذف المحتوى المحلي'
        };
      }
      
    } catch (error) {
      console.error('Error deleting local content:', error);
      return {
        success: false,
        message: `خطأ في حذف المحتوى: ${error.message}`
      };
    }
  }

  // الحصول على إحصائيات التخزين المحلي
  async getOfflineStorageStats() {
    try {
      return await this.offlineContentManager.getStorageStats();
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalFiles: 0, totalSize: 0, totalSizeMB: '0.00' };
    }
  }

  // تسجيل الوصول للمحتوى (لإحصائيات الاستخدام)
  recordContentAccess(contentId) {
    try {
      this.offlineContentManager.recordContentAccess(contentId);
    } catch (error) {
      console.error('Error recording content access:', error);
    }
  }

  // دالة مساعدة للحصول على المحتوى مع أولوية للمحتوى المحلي
  async getContentForDisplay(contentId) {
    try {
      const realm = await this.ensureRealm();
      const content = realm.objectForPrimaryKey('Book', contentId);
      
      if (!content) return null;

      // التحقق من توفر المحتوى محلياً
      const isOfflineAvailable = await this.isContentAvailableOffline(contentId);
      const localPath = isOfflineAvailable ? this.getLocalContentPath(contentId) : null;

      return {
        ...content,
        isOfflineAvailable,
        localPath,
        // إضافة flag لمعرفة أن هذا المحتوى جاهز للعمل بدون إنترنت
        canWorkOffline: isOfflineAvailable
      };
      
    } catch (error) {
      console.error('Error getting content for display:', error);
      return null;
    }
  }

  // الحصول على الكتب مع معلومات الحالة الـ Offline
  async getBooksWithOfflineStatus(mainCategory, subCategory = null, subSubCategory = null) {
    try {
      const realm = await this.ensureRealm();
      
      let filter = `mainCategory == "${mainCategory}" AND isDeleted == false`;
      if (subCategory) {
        filter += ` AND subCategory == "${subCategory}"`;
      }
      if (subSubCategory) {
        filter += ` AND subSubCategory == "${subSubCategory}"`;
      }
      
      const books = realm.objects('Book').filtered(filter);
      
      return Array.from(books).map(book => ({
        id: book.id,
        bookName: book.bookName,
        bookUrl: book.bookUrl,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory,
        contentType: book.contentType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        // معلومات الحالة الـ Offline
        isOfflineAvailable: book.isContentAvailable || false,
        isFullyOffline: book.isFullyOffline || false,
        downloadStatus: book.downloadStatus || 'not_downloaded',
        downloadProgress: book.downloadProgress || 0,
        localPath: book.localFilePath || null,
        localFileSize: book.localFileSize || 0,
        lastAccessedAt: book.lastAccessedAt,
        // flag مفيد للـ UI
        canWorkOffline: book.isContentAvailable && book.isFullyOffline
      }));
    } catch (error) {
      console.error('Error getting books with offline status:', error);
      return [];
    }
  }

  // استخراج الأقسام من جدول books وتحديث جدول Category
  async extractCategoriesFromBooks() {
    try {
      const realm = await this.ensureRealm();
      
      console.log('📂 Extracting categories from books table...');
      
      // جلب جميع الكتب
      const books = realm.objects('Book').filtered('isDeleted == false');
      
      if (books.length === 0) {
        console.log('📂 No books found to extract categories from');
        return false;
      }
      
      console.log(`📂 Found ${books.length} books, extracting categories...`);
      
      // استخراج الأقسام الرئيسية
      const mainCategories = [...new Set(Array.from(books).map(book => book.mainCategory).filter(Boolean))];
      
      // استخراج الأقسام الفرعية
      const subCategories = [...new Set(Array.from(books).map(book => ({
        mainCategory: book.mainCategory,
        subCategory: book.subCategory
      })).filter(item => item.mainCategory && item.subCategory))];
      
      // استخراج الأقسام الفرعية الثانوية
      const subSubCategories = [...new Set(Array.from(books).map(book => ({
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subSubCategory: book.subSubCategory
      })).filter(item => item.mainCategory && item.subCategory && item.subSubCategory))];
      
      console.log(`📂 Extracted: ${mainCategories.length} main categories, ${subCategories.length} sub categories, ${subSubCategories.length} sub-sub categories`);
      
      // حفظ الأقسام في جدول Category
      realm.write(() => {
        // إضافة الأقسام الرئيسية
        mainCategories.forEach(mainCategory => {
          const existingCategory = realm.objects('Category').filtered(`mainCategory == "${mainCategory}" AND subCategory == null AND subSubCategory == null`)[0];
          
          if (!existingCategory) {
            realm.create('Category', {
              id: `main_${mainCategory}_${Date.now()}`,
              name: mainCategory,
              mainCategory: mainCategory,
              subCategory: null,
              subSubCategory: null,
              description: '',
              sortOrder: 0,
              isActive: true,
              icon: 'folder',
              color: '#4A90E2',
              tags: '',
              metadata: '{}',
              totalSubcategories: 0,
              totalContent: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isDeleted: false,
              syncStatus: 'extracted'
            });
          }
        });
        
        // إضافة الأقسام الفرعية
        subCategories.forEach(({ mainCategory, subCategory }) => {
          const existingCategory = realm.objects('Category').filtered(`mainCategory == "${mainCategory}" AND subCategory == "${subCategory}" AND subSubCategory == null`)[0];
          
          if (!existingCategory) {
            realm.create('Category', {
              id: `sub_${mainCategory}_${subCategory}_${Date.now()}`,
              name: subCategory,
              mainCategory: mainCategory,
              subCategory: subCategory,
              subSubCategory: null,
              description: '',
              sortOrder: 0,
              isActive: true,
              icon: 'folder',
              color: '#4A90E2',
              tags: '',
              metadata: '{}',
              totalSubcategories: 0,
              totalContent: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isDeleted: false,
              syncStatus: 'extracted'
            });
          }
        });
        
        // إضافة الأقسام الفرعية الثانوية
        subSubCategories.forEach(({ mainCategory, subCategory, subSubCategory }) => {
          const existingCategory = realm.objects('Category').filtered(`mainCategory == "${mainCategory}" AND subCategory == "${subCategory}" AND subSubCategory == "${subSubCategory}"`)[0];
          
          if (!existingCategory) {
            realm.create('Category', {
              id: `subsub_${mainCategory}_${subCategory}_${subSubCategory}_${Date.now()}`,
              name: subSubCategory,
              mainCategory: mainCategory,
              subCategory: subCategory,
              subSubCategory: subSubCategory,
              description: '',
              sortOrder: 0,
              isActive: true,
              icon: 'folder',
              color: '#4A90E2',
              tags: '',
              metadata: '{}',
              totalSubcategories: 0,
              totalContent: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isDeleted: false,
              syncStatus: 'extracted'
            });
          }
        });
      });
      
      console.log('✅ Categories extracted and saved to Category table');
      return true;
    } catch (error) {
      console.error('❌ Error extracting categories from books:', error);
      return false;
    }
  }

  // تنظيف الأقسام المكررة وتحسين الأداء
  async cleanupDuplicateCategories() {
    try {
      const realm = await this.ensureRealm();
      
      console.log('🧹 Starting category cleanup...');
      
      realm.write(() => {
        // حذف الأقسام المكررة من جدول Category
        const categories = realm.objects('Category');
        const seen = new Set();
        const duplicates = [];
        
        categories.forEach(category => {
          const key = `${category.mainCategory}_${category.subCategory || ''}_${category.subSubCategory || ''}`;
          if (seen.has(key)) {
            duplicates.push(category);
          } else {
            seen.add(key);
          }
        });
        
        if (duplicates.length > 0) {
          console.log(`🧹 Found ${duplicates.length} duplicate categories, removing...`);
          realm.delete(duplicates);
        }
        
        // حذف الأقسام الفارغة أو غير الصحيحة
        const invalidCategories = categories.filtered('mainCategory == null OR mainCategory == "" OR mainCategory CONTAINS "undefined" OR mainCategory CONTAINS "null"');
        if (invalidCategories.length > 0) {
          console.log(`🧹 Found ${invalidCategories.length} invalid categories, removing...`);
          realm.delete(invalidCategories);
        }
      });
      
      console.log('✅ Category cleanup completed');
      return true;
    } catch (error) {
      console.error('❌ Error during category cleanup:', error);
      return false;
    }
  }

  // دالة محسنة لاستخراج الأقسام من الكتب مع تنظيف
  async extractAndCleanupCategories() {
    try {
      console.log('🔄 Starting enhanced category extraction and cleanup...');
      
      // استخراج الأقسام من الكتب
      const extractionResult = await this.extractCategoriesFromBooks();
      
      if (extractionResult) {
        // تنظيف الأقسام المكررة
        await this.cleanupDuplicateCategories();
        console.log('✅ Enhanced category extraction and cleanup completed');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error in enhanced category extraction:', error);
      return false;
    }
  }

     // دالة لإنشاء أقسام فرعية ثانوية فارغة
   async createEmptySubSubCategories(mainCategory, subCategory) {
     try {
       const realm = await this.ensureRealm();
       const defaultSubSubCategories = ['عام', 'متنوع', 'أساسي', 'متقدم'];
       
       realm.write(() => {
         defaultSubSubCategories.forEach(subSubCategory => {
           const existingSubSubCategory = realm.objects('Category')
             .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory.trim()}" AND subSubCategory == "${subSubCategory}" AND isDeleted == false`);
           
           if (existingSubSubCategory.length === 0) {
             realm.create('Category', {
               id: `empty_subsub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: subSubCategory,
               mainCategory: mainCategory.trim(),
               subCategory: subCategory.trim(),
               subSubCategory: subSubCategory,
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
             console.log(`📂 Created empty sub-sub category: ${mainCategory.trim()} > ${subCategory.trim()} > ${subSubCategory}`);
           } else {
             console.log(`📂 Sub-sub category already exists: ${mainCategory.trim()} > ${subCategory.trim()} > ${subSubCategory}`);
           }
         });
       });
       
       console.log(`📂 Empty sub-sub categories created for: ${mainCategory} > ${subCategory}`);
     } catch (error) {
       console.error('❌ Error creating empty sub-sub categories:', error);
     }
   }

   // دالة لتنظيف الأقسام المكررة
   async cleanupDuplicateCategories() {
     try {
       const realm = await this.ensureRealm();
       
       console.log('🧹 Starting duplicate category cleanup...');
       
       realm.write(() => {
         // حذف الأقسام المكررة من جدول Category
         const categories = realm.objects('Category');
         const seen = new Set();
         const duplicates = [];
         
         categories.forEach(category => {
           const key = `${category.mainCategory}_${category.subCategory || ''}_${category.subSubCategory || ''}`;
           if (seen.has(key)) {
             duplicates.push(category);
           } else {
             seen.add(key);
           }
         });
         
         if (duplicates.length > 0) {
           console.log(`🧹 Found ${duplicates.length} duplicate categories, removing...`);
           realm.delete(duplicates);
         }
         
         // حذف الأقسام الفارغة أو غير الصحيحة
         const invalidCategories = categories.filtered('mainCategory == null OR mainCategory == "" OR mainCategory CONTAINS "undefined" OR mainCategory CONTAINS "null"');
         if (invalidCategories.length > 0) {
           console.log(`🧹 Found ${invalidCategories.length} invalid categories, removing...`);
           realm.delete(invalidCategories);
         }
       });
       
       console.log('✅ Duplicate category cleanup completed');
       return true;
     } catch (error) {
       console.error('❌ Error during duplicate category cleanup:', error);
       return false;
     }
   }

   // دالة لضمان ظهور جميع الأقسام في الواجهة (حتى الفارغة)
   async ensureAllCategoriesVisible() {
    try {
      const realm = await this.ensureRealm();
      
      console.log('📊 Ensuring all categories are visible in UI...');
      
      // جلب جميع الأقسام من جدول Category
      const categories = realm.objects('Category').filtered('isDeleted == false');
      
      if (categories.length > 0) {
        console.log(`📊 Found ${categories.length} categories in Category table - these will be visible in UI`);
        
        // تحديث إحصائيات الأقسام
        realm.write(() => {
          categories.forEach(category => {
            // حساب عدد المحتوى في كل قسم
            const contentCount = realm.objects('Book').filtered(
              `mainCategory == "${category.mainCategory}" AND isDeleted == false` +
              (category.subCategory ? ` AND subCategory == "${category.subCategory}"` : ' AND subCategory == null') +
              (category.subSubCategory ? ` AND subSubCategory == "${category.subSubCategory}"` : ' AND subSubCategory == null')
            ).length;
            
            category.totalContent = contentCount;
            category.updatedAt = new Date().toISOString();
          });
        });
        
        console.log('✅ Category visibility ensured');
        return true;
      }
      
      console.log('📊 No categories in Category table - will extract from books');
      return await this.extractCategoriesFromBooks();
    } catch (error) {
      console.error('❌ Error ensuring category visibility:', error);
      return false;
    }
  }

  // حذف الأقسام الافتراضية الموجودة مسبقاً
  async removeDefaultCategories() {
    try {
      const realm = await this.ensureRealm();
      
      const defaultCategories = ['عام', 'متنوع', 'أساسي', 'متقدم'];
      
      realm.write(() => {
        // حذف الأقسام الفرعية الافتراضية
        defaultCategories.forEach(categoryName => {
          const subCategories = realm.objects('Category')
            .filtered(`subCategory == "${categoryName}" AND isDeleted == false`);
          
          subCategories.forEach(cat => {
            cat.isDeleted = true;
            console.log(`🗑️ Marked default sub-category as deleted: ${cat.mainCategory} > ${categoryName}`);
          });
          
          // حذف الأقسام الفرعية الثانوية الافتراضية
          const subSubCategories = realm.objects('Category')
            .filtered(`subSubCategory == "${categoryName}" AND isDeleted == false`);
          
          subSubCategories.forEach(cat => {
            cat.isDeleted = true;
            console.log(`🗑️ Marked default sub-sub-category as deleted: ${cat.mainCategory} > ${cat.subCategory} > ${categoryName}`);
          });
        });
      });
      
      console.log('✅ Default categories removed successfully');
    } catch (error) {
      console.error('❌ Error removing default categories:', error);
    }
  }

  // إنشاء الأقسام الفرعية الفارغة إذا لم تكن موجودة
  async createEmptySubCategories(mainCategory) {
    try {
      const realm = await this.ensureRealm();
      
      // إنشاء بعض الأقسام الفرعية الافتراضية لكل قسم رئيسي
      const defaultSubCategories = [
        'عام',
        'متنوع',
        'أساسي',
        'متقدم'
      ];
      
             realm.write(() => {
         defaultSubCategories.forEach(subCategory => {
           const existingSubCategory = realm.objects('Category')
             .filtered(`mainCategory == "${mainCategory.trim()}" AND subCategory == "${subCategory}" AND isDeleted == false`);
           
           if (existingSubCategory.length === 0) {
             realm.create('Category', {
               id: `empty_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
               name: subCategory,
               mainCategory: mainCategory.trim(),
               subCategory: subCategory,
               createdAt: new Date(),
               updatedAt: new Date(),
               isDeleted: false
             });
             console.log(`📂 Created empty sub category: ${mainCategory.trim()} > ${subCategory}`);
           } else {
             console.log(`📂 Sub category already exists: ${mainCategory.trim()} > ${subCategory}`);
           }
         });
       });
      
      console.log(`📂 Empty sub categories created for: ${mainCategory}`);
    } catch (error) {
      console.error('❌ Error creating empty sub categories:', error);
    }
  }
}

// إنشاء مثيل واحد من الخدمة
const dataService = new DataService();
export default dataService; 