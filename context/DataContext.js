import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRealm } from '@realm/react';
import dataService from '../services/dataService';
import smartCacheService from '../services/SmartCacheService';
import usageTrackingService from '../services/usageTrackingService';
import NetInfo from '@react-native-community/netinfo';
import { SYNC_CONFIG } from '../config/syncConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children }) => {
  const realm = useRealm(); // الحصول على Realm instance من RealmProvider
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalVideos: 0,
    totalAudios: 0,
    totalCategories: 0,
    totalContent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [error, setError] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [initialized, setInitialized] = useState(false); // مفتاح واحد للتحكم في التهيئة

  // مرجع لإدارة setTimeout الخاص بالمزامنة الخلفية
  const syncTimeoutRef = useRef(null);

  // تهيئة الخدمات مع Realm instance
  useEffect(() => {
    if (realm && !initialized) {
      try {
        // تهيئة DataService التقليدي
        if (!dataService.isInitialized) {
          dataService.initWithRealm(realm);
          console.log('✅ DataService initialized');
        }
        
        // تهيئة SmartCacheService الجديد
        if (!smartCacheService.isInitialized) {
          smartCacheService.initialize(realm);
          console.log('✅ SmartCacheService initialized');
        }
        
        // تهيئة خدمة تتبع الاستخدام
        if (!usageTrackingService.realm) {
          usageTrackingService.initWithRealm(realm);
          console.log('✅ UsageTrackingService initialized');
        }
        
        setInitialized(true);
        
      } catch (error) {
        console.error('❌ Error initializing services:', error);
        setError('فشل في تهيئة الخدمات');
      }
    }
  }, [realm, initialized]);

  // مراقبة حالة الاتصال - محسنة
  useEffect(() => {
    let debounceTimer;
    
    const unsubscribe = NetInfo.addEventListener(state => {
      clearTimeout(debounceTimer);
      
      // debounce لتجنب الاستدعاءات المتكررة
      debounceTimer = setTimeout(() => {
        const wasOffline = !isOnline;
        const isConnected = state.isConnected;
        
        if (isConnected !== isOnline) {
          setIsOnline(isConnected);
          console.log('🌐 Network state changed:', isConnected ? 'Online' : 'Offline');
          
          // فقط في حالة عودة الاتصال مع بيانات قليلة وعدم وجود مزامنة جارية
          if (isConnected && wasOffline && !syncing && categories.length > 0 && shouldSyncBasedOnTime()) {
            console.log('🔄 Connection restored - scheduling light sync after delay');
            setTimeout(() => {
              if (!syncing && shouldSyncBasedOnTime()) {
                backgroundSyncQuietly();
              }
            }, 15000); // 15 ثانية بعد عودة الاتصال
          }
        }
      }, 3000); // انتظار 3 ثواني قبل المعالجة
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [isOnline, syncing, categories.length, shouldSyncBasedOnTime, backgroundSyncQuietly]);

  // تهيئة البيانات الأولية
  useEffect(() => {
    const initializeData = async () => {
      try {
        console.log('🚀 Starting optimized data loading...');
        
        // حذف الأقسام الافتراضية الموجودة مسبقاً
        await dataService.removeDefaultCategories();
        
        // جلب الأقسام الرئيسية
        const mainCategoriesData = await dataService.getMainCategories();
        setCategories(mainCategoriesData);
        
        // حساب الإحصائيات
        const statsData = await dataService.calculateStats();
        setStats(statsData);
        
        setLoading(false);
        console.log('✅ Data initialization completed');
      } catch (error) {
        console.error('❌ Error in initial load:', error);
        setLoading(false);
      }
    };

    if (!initialized) {
      initializeData();
    }
  }, [initialized]);

  // تحميل البيانات الأولية - منطق محسن للتثبيت الأول
  useEffect(() => {
    if (!realm || !dataService.isInitialized) return;
    
    let isMounted = true;
    
    // إلغاء أي مزامنة معلقة عند الخروج
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    const loadDataOptimized = async () => {
      try {
        console.log('🚀 Starting optimized data loading...');
        setLoading(true);
        
        // 1. تحميل البيانات المحلية فوراً
        const [realmBooks, realmCategories, realmStats] = await Promise.all([
          dataService.getAllBooks(),
          dataService.getMainCategories(),
          dataService.calculateStats()
        ]);
        
        if (!isMounted) return;
        
        const hasLocalData = realmBooks.length > 0 && realmCategories.length > 0;
        
        console.log(`📊 Local data check: ${realmBooks.length} books, ${realmCategories.length} categories`);
        
        // ضمان ظهور جميع الأقسام في الواجهة (حتى الفارغة)
        await dataService.ensureAllCategoriesVisible();
        
        // تحديث البيانات في الحالة فوراً (حتى لو كانت فارغة)
        setBooks(realmBooks);
        setCategories(realmCategories);
        setStats(realmStats);
        setInitialized(true);
        
        if (hasLocalData) {
          // إذا كانت هناك بيانات محلية - إنهاء التحميل فوراً
          console.log('✅ Local data available - ending loading state immediately');
          setLoading(false);
          setError(null);
          
          // تحميل آخر وقت مزامنة
          const savedSyncTime = await AsyncStorage.getItem('lastSyncTime');
          if (savedSyncTime) {
            setLastSyncTime(parseInt(savedSyncTime));
          }
          
          // تمت إزالة setTimeout الخاص بالمزامنة الخلفية من هنا
        } else {
          // إذا لم تكن هناك بيانات محلية - حالة التثبيت الأول فقط
          console.log('📦 First install detected - starting immediate sync');
          
          if (isOnline) {
            // مزامنة فورية للتثبيت الأول
            await performFirstInstallSync();
          } else {
            // لا يوجد إنترنت في التثبيت الأول
            setLoading(false);
            setError('يرجى الاتصال بالإنترنت لتحميل المحتوى لأول مرة');
          }
        }
        
      } catch (error) {
        console.error('❌ Error in optimized loading:', error);
        if (isMounted) {
          setLoading(false);
          setInitialized(true);
          
          if (!error.message.includes('realm that has been closed')) {
            setError('خطأ في تحميل البيانات - يرجى إعادة المحاولة');
          }
        }
      }
    };

    loadDataOptimized();
    
    return () => {
      isMounted = false;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [realm, dataService.isInitialized]);

  // التحقق من ضرورة المزامنة بناءً على الوقت - محسنة
  const shouldSyncBasedOnTime = useCallback(() => {
    if (!lastSyncTime) {
      console.log('🕐 No previous sync time found');
      return true;
    }
    const timeSinceLastSync = Date.now() - lastSyncTime;
    const syncThreshold = 6 * 60 * 60 * 1000; // 6 ساعات بدلاً من 24
    const shouldSync = timeSinceLastSync > syncThreshold;
    console.log(`🕐 Time since last sync: ${Math.round(timeSinceLastSync / (60 * 60 * 1000))} hours, should sync: ${shouldSync}`);
    return shouldSync;
  }, [lastSyncTime]);

  // مزامنة صامتة في الخلفية بدون تأثير على واجهة المستخدم - محسنة
  const backgroundSyncQuietly = useCallback(async () => {
    if (syncing) {
      console.log('🔄 Sync already in progress, skipping background sync');
      return;
    }
    
    try {
      console.log('🔄 Starting silent background sync...');
      setSyncing(true);
      
      const firebaseConnected = await dataService.testFirebaseConnection();
      if (!firebaseConnected) {
        console.log('❌ Firebase not reachable - keeping local data');
        return;
      }

      // مزامنة الأقسام والكتب في الخلفية
      const [categoriesResult, booksResult] = await Promise.all([
        dataService.syncCategoriesFromFirebase(false),
        dataService.syncBooksFromFirebase(50) // حد أقصى للكتب لتجنب البطء
      ]);
      
      if (categoriesResult || booksResult) {
        console.log('✅ Silent background sync completed successfully');
        
        // تحديث البيانات المحلية بصمت
        const [updatedBooks, updatedCategories, updatedStats] = await Promise.all([
          dataService.getAllBooks(),
          dataService.getMainCategories(),
          dataService.calculateStats()
        ]);
        
        setBooks(updatedBooks);
        setCategories(updatedCategories);
        setStats(updatedStats);
        
        // حفظ وقت المزامنة
        const newSyncTime = Date.now();
        setLastSyncTime(newSyncTime);
        await AsyncStorage.setItem('lastSyncTime', newSyncTime.toString());
        console.log('💾 Sync time saved:', new Date(newSyncTime).toLocaleString());
      }
      
    } catch (error) {
      console.log('⚠️ Silent background sync failed:', error.message);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // دالة مزامنة محسنة للخلفية
  const backgroundSyncSilently = useCallback(async () => {
    return backgroundSyncQuietly();
  }, [backgroundSyncQuietly]);

  // إعادة تحميل البيانات المحلية بعد المزامنة الصامتة
  const refreshLocalDataAfterSync = useCallback(async () => {
    try {
      const [updatedBooks, updatedCategories, updatedStats] = await Promise.all([
        dataService.getAllBooks(),
        dataService.getMainCategories(),
        dataService.calculateStats()
      ]);
      
      setBooks(updatedBooks);
      setCategories(updatedCategories);
      setStats(updatedStats);
      
      console.log(`📊 Data refreshed after sync: ${updatedBooks.length} books, ${updatedCategories.length} categories`);
    } catch (error) {
      console.error('❌ Error refreshing data after sync:', error);
    }
  }, []);

  // مزامنة أولية محدودة بوقت (جديد)
  const syncInitialDataWithTimeout = useCallback(async () => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sync timeout')), SYNC_CONFIG.INITIAL_SYNC_TIMEOUT);
    });
    
    const syncPromise = backgroundSync();
    
    try {
      await Promise.race([syncPromise, timeoutPromise]);
    } catch (error) {
      console.log('⚠️ Initial sync timeout or failed - continuing offline');
      throw error;
    }
  }, []);

  // مزامنة الأقسام الرئيسية فقط في البداية - محسن للعمل Offline-First
  const syncMainCategoriesOnly = useCallback(async () => {
    if (syncing || !isOnline) return;

    try {
      setSyncing(true);
      console.log('🔄 Starting main categories sync only (Offline-First)...');
      
      // تحقق من البيانات المحلية أولاً
      const localCategories = await dataService.getMainCategories();
      if (localCategories.length > 0) {
        console.log('✅ Local categories available - skipping sync');
        return;
      }
      
      const firebaseConnected = await dataService.testFirebaseConnection();
      if (!firebaseConnected) {
        console.log('❌ Firebase not reachable - using local data only');
        return;
      }

      // مزامنة الأقسام فقط
      const categoriesResult = await dataService.syncCategoriesFromFirebase(true);
      
      if (categoriesResult) {
        // إعادة تحميل الأقسام الرئيسية فقط
        const updatedCategories = await dataService.getMainCategories();
        setCategories(updatedCategories);
        console.log(`🎉 Main categories sync completed: ${updatedCategories.length} categories`);
      }
      
    } catch (error) {
      console.error('❌ Main categories sync error:', error);
    } finally {
      setSyncing(false);
    }
  }, [syncing, isOnline]);

  // مزامنة خلفية ذكية محسنة للعمل Offline-First
  const backgroundSync = useCallback(async () => {
    if (syncing || !isOnline) return;

    try {
      setSyncing(true);
      console.log('🔄 Starting background sync (Offline-First)...');
      
      // التحقق من البيانات المحلية أولاً
      const localSummary = await dataService.getLocalDataSummary();
      console.log('📊 Local data summary before sync:', localSummary);
      
      // في وضع Offline-First، إذا كانت لدينا بيانات محلية، المزامنة اختيارية
      if (SYNC_CONFIG.OFFLINE_FIRST_PRIORITY && localSummary.hasMinimalData) {
        console.log('✅ Local data available - background sync is optional');
        
        // يمكن إجراء مزامنة خفيفة للتحديثات فقط
        if (!SYNC_CONFIG.BACKGROUND_SYNC_ENABLED) {
          console.log('🔄 Background sync disabled - skipping');
          return;
        }
      }
      
      const firebaseConnected = await dataService.testFirebaseConnection();
      if (!firebaseConnected) {
        console.log('❌ Firebase not reachable - continuing with local data');
        return;
      }

      // إذا كانت قاعدة البيانات فارغة، فرض المزامنة
      const shouldForceSync = localSummary.isEmpty;
      
      if (shouldForceSync) {
        console.log('🔄 Empty database detected - forcing full sync...');
        // إعادة تعيين حالة المزامنة لضمان المزامنة الإجبارية
        await dataService.resetSyncStatus();
      } else {
        console.log('🔄 Starting conditional sync...');
      }

      const syncResult = await dataService.syncAllData(shouldForceSync);
          
          if (syncResult.success) {
        // إعادة تحميل البيانات المحدثة
            const [updatedBooks, updatedCategories, updatedStats] = await Promise.all([
              dataService.getAllBooks(),
              dataService.getMainCategories(),
              dataService.calculateStats()
            ]);
            
            setBooks(updatedBooks);
            setCategories(updatedCategories);
            setStats(updatedStats);
        setLastSyncTime(new Date());
        
        console.log(`🎉 Background sync completed: ${updatedBooks.length} books, ${updatedCategories.length} categories`);
          } else {
        console.log('⏭️ Background sync skipped - reason:', syncResult.reason);
        
        // حتى لو فشلت المزامنة، نحدث البيانات من المحلي
        if (syncResult.localSummary) {
          const localBooks = await dataService.getAllBooks();
          const localCategories = await dataService.getMainCategories();
          const localStats = await dataService.calculateStats();
          
          setBooks(localBooks);
          setCategories(localCategories);
          setStats(localStats);
          
          console.log(`📊 Using local data: ${localBooks.length} books, ${localCategories.length} categories`);
        }
        }
        
      } catch (error) {
      console.error('❌ Background sync error:', error);
      
      // في حالة الخطأ، نحاول تحميل البيانات المحلية
      try {
        const localBooks = await dataService.getAllBooks();
        const localCategories = await dataService.getMainCategories();
        const localStats = await dataService.calculateStats();
        
        setBooks(localBooks);
        setCategories(localCategories);
        setStats(localStats);
        
        console.log(`📊 Fallback to local data: ${localBooks.length} books, ${localCategories.length} categories`);
      } catch (localError) {
        console.error('❌ Failed to load local data:', localError);
        setError('خطأ في تحميل البيانات - تحقق من الاتصال');
      }
      } finally {
      setSyncing(false);
      }
  }, [syncing, isOnline]);

  // مزامنة البيانات مع Firebase (للاستخدام اليدوي)
  const syncData = useCallback(async (forceSync = false) => {
    if (!isOnline && !forceSync) {
      console.log('📴 Offline - skipping sync');
      return false;
    }

    if (syncing) {
      console.log('🔄 Sync already in progress - skipping');
      return false;
    }

    try {
      setSyncing(true);
      setError(null);
      
      console.log('🚀 Starting manual sync...', forceSync ? '(forced)' : '(conditional)');
      
      const result = await dataService.syncAllData(forceSync);
      
      if (result.success) {
        // إعادة تحميل البيانات من Realm بعد المزامنة
        const [booksData, categoriesData, statsData] = await Promise.all([
          dataService.getAllBooks(),
          dataService.getMainCategories(),
          dataService.calculateStats(),
        ]);

        setBooks(booksData);
        setCategories(categoriesData);
        setStats(statsData);
        setLastSyncTime(new Date());
        
        console.log(`✅ Manual sync completed: ${booksData.length} books, ${categoriesData.length} categories`);
        return true;
      } else {
        console.log('⏭️ Sync skipped - using local data');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Sync error:', error);
      
      if (error.message.includes('realm that has been closed') || 
          error.message.includes('Realm has been closed')) {
        console.log('🔄 Realm was closed during sync - will retry later');
        return false;
      } else {
        setError('خطأ في المزامنة - الاعتماد على البيانات المحلية');
      return false;
      }
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing]);

  // جلب الكتب حسب الأقسام - محسن بـ SmartCacheService
  const getBooksByCategory = useCallback(async (mainCategory, subCategory = null, subSubCategory = null) => {
    try {
      if (!smartCacheService.isInitialized) {
        console.log('⚠️ SmartCacheService not initialized, falling back to dataService');
        return await dataService.getBooksByCategory(mainCategory, subCategory, subSubCategory);
      }
      console.log(`📚 Getting books for category: ${mainCategory}${subCategory ? ` > ${subCategory}` : ''}${subSubCategory ? ` > ${subSubCategory}` : ''}`);
      // استخدام SmartCacheService للتحميل الذكي
      let books = [];
      try {
        books = await smartCacheService.loadCategoryContent(mainCategory, subCategory, subSubCategory);
      } catch (err) {
        // fallback في حال وجود خطأ في isContentAvailable أو غيره
        console.error('Error getting cached content:', err);
        books = [];
      }
      // إذا لم توجد نتائج أو واجهت خطأ، جرب استخراج الكتب من Book مباشرة (fallback)
      if (!books || books.length === 0) {
        const realm = smartCacheService.realm;
        if (realm) {
          let filter = `mainCategory == \"${mainCategory}\" AND isDeleted == false`;
          if (subCategory) {
            filter += ` AND subCategory == \"${subCategory}\"`;
          }
          if (subSubCategory) {
            filter += ` AND subSubCategory == \"${subSubCategory}\"`;
          }
          const fallbackBooks = realm.objects('Book').filtered(filter);
          books = Array.from(fallbackBooks).map(book => ({
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
          console.log(`📚 Fallback: extracted ${books.length} books from Book table for ${mainCategory}${subCategory ? ` > ${subCategory}` : ''}${subSubCategory ? ` > ${subSubCategory}` : ''}`);
        }
      }
      console.log(`📚 Found ${books.length} books for category`);
      return books;
    } catch (error) {
      console.error('❌ Error getting books by category:', error);
      return []; // إرجاع مصفوفة فارغة في حالة الخطأ
    }
  }, []);

  // جلب الأقسام الفرعية - محسن بـ SmartCacheService
  const getSubCategories = useCallback(async (mainCategory) => {
    try {
      // استخدام dataService مباشرة لضمان إنشاء الأقسام الفارغة
      console.log(`📂 Getting subcategories for: ${mainCategory}`);
      const subCategories = await dataService.getSubCategories(mainCategory);
      console.log(`📂 Found ${subCategories.length} subcategories`);
      return subCategories;
    } catch (error) {
      console.error('❌ Error getting sub categories:', error);
      return []; // إرجاع مصفوفة فارغة في حالة الخطأ
    }
  }, []);

  // جلب الأقسام الفرعية الثانوية - محسن بـ SmartCacheService
  const getSubSubCategories = useCallback(async (mainCategory, subCategory) => {
    try {
      // استخدام dataService مباشرة لضمان إنشاء الأقسام الفارغة
      console.log(`📂 Getting sub-subcategories for: ${mainCategory} > ${subCategory}`);
      const subSubCategories = await dataService.getSubSubCategories(mainCategory, subCategory);
      console.log(`📂 Found ${subSubCategories.length} sub-subcategories`);
      return subSubCategories;
    } catch (error) {
      console.error('❌ Error getting sub-sub categories:', error);
      return []; // إرجاع مصفوفة فارغة في حالة الخطأ
    }
  }, []);

  // جلب الكتب المضافة مؤخراً - محسن للعمل Offline-First
  const getRecentBooks = useCallback(async (limit = 20) => {
    try {
      console.log(`📚 Getting recent books (limit: ${limit})`);
      
      // جلب من Realm أولاً دائماً
      const recentBooksData = await dataService.getRecentBooks(limit);
      
      console.log(`📚 Found ${recentBooksData.length} recent books in local database`);
      
      // إذا لم نجد بيانات محلية والإنترنت متاح، جرب المزامنة
      if (recentBooksData.length === 0 && isOnline) {
        console.log('📚 No local recent books found - attempting sync...');
        
        try {
          // محاولة مزامنة محدودة بوقت
          const syncPromise = dataService.syncBooksFromFirebase(false);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Sync timeout')), 5000);
          });
          
          await Promise.race([syncPromise, timeoutPromise]);
          
          // إعادة المحاولة بعد المزامنة
          const syncedRecentBooks = await dataService.getRecentBooks(limit);
          console.log(`📚 After sync: ${syncedRecentBooks.length} recent books found`);
          
          return syncedRecentBooks;
        } catch (syncError) {
          console.log('⚠️ Sync failed or timed out - returning local data:', syncError.message);
          return recentBooksData; // إرجاع البيانات المحلية حتى لو كانت فارغة
        }
      }
      
      return recentBooksData;
    } catch (error) {
      console.error('❌ Error getting recent books:', error);
      return []; // إرجاع مصفوفة فارغة في حالة الخطأ
    }
  }, [isOnline]);

  // تحديث الإحصائيات
  const refreshStats = useCallback(async () => {
    try {
      const statsData = await dataService.calculateStats();
      setStats(statsData);
      return statsData;
    } catch (error) {
      console.error('Error refreshing stats:', error);
      return stats;
    }
  }, [stats]);

  // البحث في الكتب
  const searchBooks = async (searchTerm) => {
    try {
      setIsSearching(true);
      const results = await dataService.searchBooks(searchTerm);
      setSearchResults(results);
      console.log(`Realm search completed: ${results.length} results for "${searchTerm}"`);
      return results;
    } catch (error) {
      console.error('Error searching books with Realm:', error);
      setSearchResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  // البحث الشامل في جميع المحتويات
  const globalSearch = async (searchTerm) => {
    try {
      setIsSearching(true);
      const results = await dataService.globalSearch(searchTerm);
      setSearchResults(results);
      console.log(`Global search completed: ${results.length} results for "${searchTerm}"`);
      return results;
    } catch (error) {
      console.error('Error in global search:', error);
      setSearchResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  // مسح البيانات المحلية
  const clearLocalData = useCallback(async () => {
    try {
      setLoading(true);
      await dataService.clearLocalData();
      setBooks([]);
      setCategories([]);
      setStats({
        totalBooks: 0,
        totalVideos: 0,
        totalAudios: 0,
        totalCategories: 0,
        totalContent: 0,
      });
      setLastSyncTime(null);
      console.log('Local data cleared');
      return true;
    } catch (error) {
      console.error('Error clearing local data:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // الحصول على إحصائيات قاعدة البيانات
  const getDatabaseStats = useCallback(async () => {
    try {
      return await dataService.getLocalDatabaseStats();
    } catch (error) {
      console.error('Error getting database stats:', error);
      return null;
    }
  }, []);

  // إعادة تعيين البيانات والمزامنة الإجبارية
  const resetAndSync = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Resetting sync status and forcing full sync...');
      
      // إعادة تعيين حالة المزامنة
      await dataService.resetSyncStatus();
      
      // مزامنة إجبارية
      const success = await syncData(true);
      
      if (!success) {
        setError('فشل في المزامنة - تحقق من الاتصال بالإنترنت');
      }
      
      return success;
    } catch (error) {
      console.error('❌ Error in reset and sync:', error);
      setError('خطأ في إعادة التعيين والمزامنة');
      return false;
    } finally {
      setLoading(false);
    }
  }, [syncData]);

  // اختبار Firebase مباشرة للتصحيح
  const testFirebaseDirectly = useCallback(async () => {
    try {
      console.log('🔍 Direct Firebase test starting...');
      const connected = await dataService.testFirebaseConnection();
      
      if (connected) {
        console.log('🔍 Firebase connected - attempting manual sync...');
        const syncResult = await dataService.syncAllData(true);
        console.log('🔍 Manual sync result:', syncResult);
        
        // إعادة تحميل البيانات
        const [booksData, categoriesData] = await Promise.all([
          dataService.getAllBooks(),
          dataService.getMainCategories(),
        ]);
        
        console.log(`🔍 After manual sync: ${booksData.length} books, ${categoriesData.length} categories`);
        
        if (booksData.length > 0 || categoriesData.length > 0) {
          setBooks(booksData);
          setCategories(categoriesData);
          const newStats = await dataService.calculateStats();
          setStats(newStats);
        }
        
        return { booksData, categoriesData, syncResult };
      } else {
        console.log('🔍 Firebase connection failed');
        return null;
      }
    } catch (error) {
      console.error('🔍 Direct Firebase test error:', error);
      return null;
    }
  }, []);

  // تحميل المحتوى المضاف مؤخراً تدريجياً
  const loadRecentBooks = useCallback(async (limit = 10, refresh = false, offset = 0) => {
    try {
      if (refresh) {
        console.log('🔄 Refreshing recent books...');
        let recentBooksData = await dataService.getRecentBooks(limit, 0);
        if (recentBooksData.length > 0) {
          for (const book of recentBooksData) {
            if (book.id && book.bookUrl && typeof dataService.isContentAvailableOffline === 'function') {
              const isAvailable = await dataService.isContentAvailableOffline(book.id);
              if (!isAvailable) {
                try {
                  console.log(`📥 Auto-downloading content for: ${book.bookName}`);
                  await dataService.downloadContentForOffline(book.id);
                  console.log(`✅ Auto-download completed for: ${book.bookName}`);
                } catch (err) {
                  console.error(`❌ Error downloading file for book ${book.bookName}:`, err);
                  // لا توقف العملية إذا فشل تحميل ملف واحد
                }
              }
            }
          }
          return { books: recentBooksData, hasMore: recentBooksData.length === limit };
        }
        if (isOnline && recentBooksData.length === 0) {
          console.log('📚 No local recent books - syncing from Firebase...');
          await dataService.syncBooksFromFirebase(true);
          recentBooksData = await dataService.getRecentBooks(limit, 0);
          for (const book of recentBooksData) {
            if (book.id && book.bookUrl && typeof dataService.isContentAvailableOffline === 'function') {
              const isAvailable = await dataService.isContentAvailableOffline(book.id);
              if (!isAvailable) {
                try {
                  console.log(`📥 Auto-downloading content for: ${book.bookName}`);
                  await dataService.downloadContentForOffline(book.id);
                  console.log(`✅ Auto-download completed for: ${book.bookName}`);
                } catch (err) {
                  console.error(`❌ Error downloading file for book ${book.bookName}:`, err);
                  // لا توقف العملية إذا فشل تحميل ملف واحد
                }
              }
            }
          }
          return { books: recentBooksData, hasMore: recentBooksData.length === limit };
        }
        return { books: recentBooksData, hasMore: false };
      } else {
        // تحميل المزيد - استخدام offset
        console.log(`📚 Loading more recent books (limit: ${limit}, offset: ${offset})...`);
        const moreBooks = await dataService.getRecentBooks(limit, offset);
        for (const book of moreBooks) {
          if (book.id && book.bookUrl && typeof dataService.isContentAvailableOffline === 'function') {
            const isAvailable = await dataService.isContentAvailableOffline(book.id);
            if (!isAvailable) {
              try {
                console.log(`📥 Auto-downloading content for: ${book.bookName}`);
                await dataService.downloadContentForOffline(book.id);
                console.log(`✅ Auto-download completed for: ${book.bookName}`);
              } catch (err) {
                console.error(`❌ Error downloading file for book ${book.bookName}:`, err);
                // لا توقف العملية إذا فشل تحميل ملف واحد
              }
            }
          }
        }
        if (moreBooks.length > 0) {
          return { books: moreBooks, hasMore: moreBooks.length === limit };
        } else {
          console.log('📚 No more recent books to load');
          return { books: [], hasMore: false };
        }
      }
    } catch (error) {
      console.error('❌ Error loading recent books:', error);
      return { books: [], hasMore: false };
    }
  }, [isOnline]);

  // تحميل كتب قسم معين تدريجياً
  const loadCategoryBooks = useCallback(async (mainCategory, subCategory = null, subSubCategory = null, refresh = false) => {
    try {
      if (refresh) {
        console.log(`🔄 Refreshing books for category: ${mainCategory}${subCategory ? ` > ${subCategory}` : ''}${subSubCategory ? ` > ${subSubCategory}` : ''}`);
      } else {
        console.log(`📚 Loading books for category: ${mainCategory}${subCategory ? ` > ${subCategory}` : ''}${subSubCategory ? ` > ${subSubCategory}` : ''}`);
      }
      
      // جلب من الـ local أولاً
      let categoryBooksData = await dataService.getBooksByCategory(mainCategory, subCategory, subSubCategory);
      
      if (categoryBooksData.length > 0) {
        console.log(`✅ Category books loaded: ${categoryBooksData.length} items`);
        return categoryBooksData;
      }
      
      // إذا لم توجد بيانات محلية، مزامنة الكتب
      if (isOnline && categoryBooksData.length === 0) {
        console.log('📚 No local category books - syncing from Firebase...');
        await dataService.syncBooksFromFirebase(true);
        categoryBooksData = await dataService.getBooksByCategory(mainCategory, subCategory, subSubCategory);
        console.log(`✅ Category books synced and loaded: ${categoryBooksData.length} items`);
      }
      
      return categoryBooksData;
    } catch (error) {
      console.error('❌ Error loading category books:', error);
      return [];
    }
  }, [isOnline]);

  // مزامنة خاصة للتثبيت الأول - سريعة وفعالة
  const performFirstInstallSync = useCallback(async () => {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    setSyncing(true);
    setLoading(true);
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`🚀 First install sync attempt ${attempts}...`);
        // اختبار الاتصال مع مهلة مناسبة للاتصال الضعيف
        const connectionTest = await Promise.race([
          dataService.testFirebaseConnection(),
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 90000)) // 90 ثانية
        ]);
        if (connectionTest === 'timeout') {
          throw new Error('timeout');
        }
        if (!connectionTest) {
          throw new Error('network');
        }
        // مزامنة الأقسام فقط (بدون الكتب)
        const categoriesResult = await dataService.syncCategoriesFromFirebase(true);
        if (categoriesResult) {
          // تحديث البيانات المحلية
          const [updatedCategories, updatedStats] = await Promise.all([
            dataService.getMainCategories(),
            dataService.calculateStats()
          ]);
          setCategories(updatedCategories);
          setStats(updatedStats);
          // حفظ وقت المزامنة للتثبيت الأول
          const newSyncTime = Date.now();
          setLastSyncTime(newSyncTime);
          await AsyncStorage.setItem('lastSyncTime', newSyncTime.toString());
          setError(null);
          console.log(`✅ First install sync (categories only) completed: ${updatedCategories.length} categories`);
          setSyncing(false);
          setLoading(false);
          return;
        } else {
          throw new Error('sync-failed');
        }
      } catch (error) {
        lastError = error;
        console.log(`⚠️ First install sync attempt ${attempts} failed:`, error.message);
        // إذا كانت المحاولة الأخيرة، أظهر الخطأ النهائي
        if (attempts >= maxAttempts) {
          if (error.message === 'timeout') {
            setError('الاتصال بطيء جداً - يرجى الانتظار والمحاولة مرة أخرى');
          } else if (error.message === 'network') {
            setError('فشل الاتصال بالخادم - تحقق من الإنترنت أو أعد المحاولة');
          } else {
            setError('فشل في تحميل البيانات من الخادم - تحقق من الاتصال وأعد المحاولة');
          }
        } else {
          // انتظر قليلاً قبل إعادة المحاولة
          await new Promise(res => setTimeout(res, 2000));
        }
      }
    }
    setSyncing(false);
    setLoading(false);
  }, []);

  // مزامنة فورية للبيانات الجديدة
  const forceSyncNewData = useCallback(async () => {
    if (syncing) {
      console.log('🔄 Sync already in progress, skipping force sync');
      return false;
    }
    
    try {
      console.log('🔄 Starting force sync for new data...');
      setSyncing(true);
      
      // مزامنة إجبارية للكتب والأقسام
      const [booksResult, categoriesResult] = await Promise.allSettled([
        dataService.syncBooksFromFirebase(true),
        dataService.syncCategoriesFromFirebase(true)
      ]);
      
      // استخراج الأقسام من الكتب المزامنة حديثاً مع تنظيف
      console.log('🔄 Extracting and cleaning categories from synced books...');
      await dataService.extractAndCleanupCategories();
      
      // إعادة تحميل البيانات من Realm بعد المزامنة
      const [booksData, categoriesData, statsData] = await Promise.all([
        dataService.getAllBooks(),
        dataService.getMainCategories(),
        dataService.calculateStats(),
      ]);

      setBooks(booksData);
      setCategories(categoriesData);
      setStats(statsData);
      setLastSyncTime(Date.now());
      
      console.log(`✅ Force sync completed: ${booksData.length} books, ${categoriesData.length} categories`);
      return true;
      
    } catch (error) {
      console.error('❌ Force sync error:', error);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // دالة تحديث الأقسام فقط
  const refreshCategories = useCallback(async () => {
    try {
      console.log('🔄 Refreshing categories...');
      const updatedCategories = await dataService.getMainCategories();
      setCategories(updatedCategories);
      console.log(`✅ Categories refreshed: ${updatedCategories.length} categories`);
      return updatedCategories;
    } catch (error) {
      console.error('❌ Error refreshing categories:', error);
      return [];
    }
  }, []);

  const value = useMemo(() => ({
    // البيانات
    books,
    categories,
    stats,
    
    // الحالة
    loading,
    syncing,
    isOnline,
    lastSyncTime,
    error,
    isSearching,
    searchResults,
    initialized,
    
    // دوال القراءة
    getAllBooks: () => dataService.getAllBooks(),
    getMainCategories: () => dataService.getMainCategories(),
    getBooksByCategory,
    getSubCategories,
    getSubSubCategories,
    getRecentBooks,
    loadRecentBooks,
    loadCategoryBooks,
    
    // دوال البحث
    searchBooks,
    globalSearch,
    clearSearchResults: () => setSearchResults([]),
    
    // دوال المزامنة
    syncData,
    performFirstInstallSync,
    backgroundSyncSilently,
    backgroundSync,
    syncMainCategoriesOnly,
    resetAndSync,
    testFirebaseDirectly,
    forceSyncNewData,
    
    // دوال الإحصائيات والأدوات
    refreshStats,
    clearLocalData,
    getDatabaseStats,
    
    // دالة إعادة تعيين حالة التطبيق
    resetAppState: async () => {
      try {
        setLoading(true);
        setInitialized(false);
        setError(null);
        setLastSyncTime(null);
        await AsyncStorage.removeItem('lastSyncTime');
        console.log('🔄 App state reset successfully');
      } catch (error) {
        console.error('❌ Error resetting app state:', error);
      }
    },
    
    // دالة فرض إعادة التحميل
    forceReload: async () => {
      try {
        console.log('🔄 Forcing app reload...');
        setLoading(true);
        setError(null);
        
        const [realmBooks, realmCategories, realmStats] = await Promise.all([
          dataService.getAllBooks(),
          dataService.getMainCategories(),
          dataService.calculateStats()
        ]);
        
        setBooks(realmBooks);
        setCategories(realmCategories);
        setStats(realmStats);
        setLoading(false);
        
        console.log('✅ App reload completed');
      } catch (error) {
        console.error('❌ Error during force reload:', error);
        setError('خطأ في إعادة التحميل');
        setLoading(false);
      }
    },
    
    // دالة تحديث الأقسام فقط
    refreshCategories
  }), [
    books, categories, stats, loading, syncing, isOnline, lastSyncTime, error, 
    isSearching, searchResults, initialized, getBooksByCategory, getSubCategories,
    getSubSubCategories, getRecentBooks, loadRecentBooks, loadCategoryBooks,
    searchBooks, globalSearch, syncData, performFirstInstallSync, backgroundSyncSilently,
    backgroundSync, syncMainCategoriesOnly, resetAndSync, testFirebaseDirectly,
    forceSyncNewData, refreshStats, clearLocalData, getDatabaseStats, refreshCategories
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export default DataContext; 