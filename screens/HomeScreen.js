import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';
import GlobalSearch from '../components/GlobalSearch';
import AdminActionHandler from '../components/AdminActionHandler';
import eventEmitter from '../utils/EventEmitter';

export default function HomeScreen({ navigation }) {
  const { darkMode, fontSize, isAdmin } = useContext(AppSettingsContext);
  const { 
    categories, 
    isOnline, 
    error, 
    loading, 
    syncing,
    syncData, 
    performFirstInstallSync,
    lastSyncTime,
    shouldSyncBasedOnTime,
    backgroundSyncQuietly,
    forceSyncNewData,
    refreshCategories
  } = useData();
  const [mainCategories, setMainCategories] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  // إضافة متغيرات للتحكم في الضغط على العنوان للوصول للوحة التحكم (للمشرفين فقط)
  const [tapCount, setTapCount] = useState(0);
  const tapTimeout = useRef(null);

  // مرجع لإدارة setTimeout الخاص بالمزامنة الخلفية في الشاشة الرئيسية فقط
  const syncTimeoutRef = useRef(null);

  // استخراج الأقسام الرئيسية من الفئات
  useEffect(() => {
    console.log('📊 HomeScreen - Categories data received:', categories ? categories.length : 'null', 'Loading:', loading);
    
    if (categories && categories.length > 0) {
      // التحقق من نوع البيانات
      console.log('📊 First category structure:', categories[0]);
      
      // إذا كانت الفئات عبارة عن نصوص (أقسام رئيسية)
      if (typeof categories[0] === 'string') {
        console.log('📊 Categories are strings - using directly');
        // تنظيف البيانات من الأقسام الفارغة أو غير الصحيحة
        const cleanedCategories = categories.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1 &&
          /[\u0600-\u06FF]/.test(cat) // التأكد من وجود أحرف عربية
        );
        console.log('📊 Cleaned categories:', cleanedCategories);
        // ترتيب حسب الأحدث (الأعلى في القائمة)
        cleanedCategories.sort((a, b) => b.localeCompare(a, 'ar'));
        setMainCategories(cleanedCategories);
      } else {
        // إذا كانت الفئات عبارة عن كائنات
        console.log('📊 Categories are objects - extracting mainCategory');
        const uniqueMainCategories = [...new Set(categories.map(cat => cat.mainCategory))];
        const filteredCategories = uniqueMainCategories.filter(cat => 
          cat && 
          cat.trim() && 
          cat.trim() !== '' &&
          !cat.includes('undefined') &&
          !cat.includes('null') &&
          cat.length > 1 &&
          /[\u0600-\u06FF]/.test(cat) // التأكد من وجود أحرف عربية
        );
        console.log('📊 Extracted and cleaned main categories:', filteredCategories);
        // ترتيب حسب الأحدث (الأعلى في القائمة)
        filteredCategories.sort((a, b) => b.localeCompare(a, 'ar'));
        setMainCategories(filteredCategories);
      }
    } else {
      console.log('📊 No categories available');
      setMainCategories([]);
    }
  }, [categories, loading]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // إزالة المزامنة التلقائية - المزامنة تحدث فقط عند الحاجة الفعلية
      // مثل التحديث اليدوي أو عند أول تثبيت
      console.log('🏠 Home screen focused - no automatic sync needed');
      
      // تحديث الأقسام فوراً عند التركيز على الشاشة
      if (categories && categories.length > 0) {
        console.log('🔄 Refreshing categories on screen focus...');
        refreshCategories?.();
      }
    });
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [navigation, categories, refreshCategories]);

  useEffect(() => {
    const handleForceRefresh = () => handleRefresh();
    const handleClearContent = () => handleRefresh();
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('clearContent', handleClearContent);
    return () => {
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('clearContent', handleClearContent);
    };
  }, [handleRefresh]);

  const handleCategoryPress = (mainCategory) => {
    console.log('📊 Navigating to SubCategories with:', mainCategory);
    navigation.navigate('SubCategories', { mainCategory });
  };

  // إضافة تحديث يدوي للبيانات - محسن
  const handleRefresh = async () => {
    if (syncing) return; // تجنب التحديث المتعدد
    
    console.log('🔄 Manual refresh requested by user');
    try {
      // إذا لم تكن هناك بيانات - استخدم مزامنة التثبيت الأول
      if (categories.length === 0) {
        console.log('🚀 No data found - performing first install sync');
        await performFirstInstallSync?.();
      } else {
        // إذا كانت هناك بيانات - مزامنة عادية
        console.log('🔄 Refreshing existing data');
        await syncData?.(true); // forced sync
      }
      console.log('✅ Manual refresh completed successfully');
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
    }
  };

  // التعامل مع النقر على العنوان (للمشرفين: لوحة التحكم مباشرة، لغير المشرفين: تسجيل الدخول)
  const handleTitlePress = () => {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
    }

    const newTapCount = tapCount + 1;
    setTapCount(newTapCount);

    console.log(`🔑 Tap count: ${newTapCount}/6`);

    // إذا وصل العداد إلى 6، تحقق من حالة المشرف
    if (newTapCount === 6) {
      console.log('🔑 6 taps detected - checking admin status');
      setTapCount(0); // إعادة تعيين العداد
      
      if (isAdmin) {
        console.log('🔑 Admin user - navigating to AdminDashboard');
        navigation.navigate('AdminDashboard');
      } else {
        console.log('🔑 Non-admin user - navigating to LoginScreen');
        navigation.navigate('LoginScreen');
      }
      return;
    }

    // إعادة تعيين العداد بعد 2 ثانية من عدم النقر
    tapTimeout.current = setTimeout(() => {
      setTapCount(0);
    }, 2000);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? '#222' : '#e8f5e9' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
        {/* العنوان والعنوان الفرعي أعلى الأزرار */}
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={handleTitlePress} 
            activeOpacity={0.7}
          >
            <Text style={[styles.headerTitle, { fontSize: fontSize + 8 }]}>مشكاة الهداية</Text>
          </TouchableOpacity>
          <Text style={[styles.headerSubtitle, { fontSize: fontSize }]}>وقل رب زدني علما</Text>
        </View>
        
        {/* مجموعة الأزرار */}
        <View style={styles.headerButtons}>
          {/* زر البحث */}
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={() => setShowSearch(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="search" size={28} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          {/* زر المزامنة الفورية للمشرفين */}
          {isAdmin && (
            <TouchableOpacity 
              style={styles.syncButton}
              onPress={async () => {
                try {
                  console.log('🔄 Admin triggered force sync');
                  await forceSyncNewData();
                  Alert.alert('نجح', 'تمت المزامنة الفورية بنجاح!');
                } catch (error) {
                  console.error('❌ Force sync failed:', error);
                  Alert.alert('خطأ', 'فشلت المزامنة الفورية');
                }
              }}
              activeOpacity={0.7}
              disabled={syncing}
            >
              <MaterialIcons 
                name="sync" 
                size={28} 
                color={syncing ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.9)"} 
              />
            </TouchableOpacity>
          )}

          {/* زر الإعدادات */}
          <TouchableOpacity 
            style={styles.settingsButton}
            onPress={() => navigation.openDrawer()}
            activeOpacity={0.7}
          >
            <MaterialIcons name="menu" size={28} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.headerIcon}>
          <MaterialIcons name="menu-book" size={60} color="rgba(255,255,255,0.3)" />
        </View>
      </View>

      {/* Status indicators */}
      {!isOnline && (
        <View style={styles.statusBar}>
          <MaterialIcons name="wifi-off" size={16} color="#fff" />
          <Text style={styles.statusText}>وضع عدم الاتصال</Text>
        </View>
      )}

      {error && (
        <View style={[styles.statusBar, { backgroundColor: '#f44336' }]}>
          <MaterialIcons name="error" size={16} color="#fff" />
          <Text style={styles.statusText}>خطأ في تحميل البيانات</Text>
        </View>
      )}

      {/* Main Categories */}
      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize + 4 }]}>
          التصنيفات الرئيسية
          {syncing && !loading && categories.length > 0 && (
            <ActivityIndicator 
              size="small" 
              color={darkMode ? '#90caf9' : '#197278'} 
              style={{ marginLeft: 10 }} 
            />
          )}
        </Text>

        {loading && syncing ? (
          // حالة التثبيت الأول فقط - تحميل البيانات
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { 
              color: darkMode ? '#90caf9' : '#197278', 
              fontSize: fontSize + 2,
              fontWeight: 'bold'
            }]}>
              تحميل البيانات لأول مرة...
            </Text>
            <Text style={[styles.loadingSubText, { 
              color: darkMode ? '#666' : '#999',
              fontSize: fontSize - 2
            }]}>
              يتم تحميل الأقسام والمحتوى من الخادم، قد يستغرق الأمر دقيقة مع الاتصال البطيء
            </Text>
            <View style={styles.progressIndicator}>
              <MaterialIcons 
                name="cloud-download" 
                size={24} 
                color={darkMode ? '#90caf9' : '#197278'} 
              />
              <Text style={[styles.progressText, { 
                color: darkMode ? '#90caf9' : '#197278',
                fontSize: fontSize - 3
              }]}>
                {isOnline ? 'متصل بالخادم' : 'بدون اتصال'}
              </Text>
            </View>
          </View>
        ) : loading && categories.length === 0 ? (
          // حالة تحميل عادية فقط عند عدم وجود بيانات نهائياً
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278' }]}>
              جاري تحميل التصنيفات...
            </Text>
          </View>
      ) : mainCategories.length === 0 ? (
          // حالة عدم وجود بيانات
          <View style={styles.emptyContainer}>
            <MaterialIcons 
              name={isOnline ? "cloud-off" : "wifi-off"} 
              size={64} 
              color={darkMode ? '#555' : '#ccc'} 
            />
            <Text style={[styles.emptyText, { 
              color: darkMode ? '#555' : '#999',
              fontSize: fontSize + 2,
              fontWeight: 'bold'
            }]}>
              {isOnline ? 'لا توجد أقسام متاحة' : 'لا يوجد اتصال بالإنترنت'}
            </Text>
            <Text style={[styles.emptySubText, { 
              color: darkMode ? '#777' : '#666',
              fontSize: fontSize
            }]}>
              {isOnline 
                ? 'تحقق من اتصال الخادم أو أعد المحاولة - قد يستغرق الأمر وقتاً مع الاتصال البطيء'
                : 'تحتاج لاتصال إنترنت لتحميل المحتوى لأول مرة'
              }
        </Text>
            <TouchableOpacity 
              style={[styles.refreshButton, { 
                backgroundColor: darkMode ? '#333' : '#197278',
                opacity: isOnline ? 1 : 0.6
              }]} 
              onPress={handleRefresh}
              disabled={!isOnline}
            >
              <MaterialIcons 
                name="refresh" 
                size={20} 
                color="#fff" 
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.refreshButtonText, { fontSize: fontSize }]}>
                {isOnline ? 'إعادة المحاولة' : 'في انتظار الاتصال'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.categoriesGrid}>
            {mainCategories.map((category, index) => (
              <AdminActionHandler
                key={index}
                item={{
                  label: category,
                  mainCategory: category,
                  bookName: category,
                  id: `mainCategory_${index}`,
                  source: 'realm',
                  data: {
                    id: `mainCategory_${index}`,
                    mainCategory: category
                  }
                }}
                itemType="mainCategory"
                onSuccess={() => {
                  console.log('🔄 Admin action completed - forcing immediate refresh');
                  // إجبار التحديث الفوري من Realm
                  setTimeout(() => {
                    // إعادة تحميل البيانات من Realm مباشرة
                    if (categories && categories.length > 0) {
                      const updatedCategories = categories.filter(cat => 
                        cat && 
                        cat.trim() && 
                        cat.trim() !== '' &&
                        !cat.includes('undefined') &&
                        !cat.includes('null') &&
                        cat.length > 1 &&
                        /[\u0600-\u06FF]/.test(cat)
                      );
                      setMainCategories(updatedCategories);
                    }
                    // أيضاً تحديث من Firebase في الخلفية
                    handleRefresh();
                  }, 500);
                }}
              >
              <TouchableOpacity
                style={[styles.categoryCard, { backgroundColor: darkMode ? '#333' : '#fffde7' }]}
                onPress={() => handleCategoryPress(category)}
              >
                <View style={styles.categoryIcon}>
                  <MaterialIcons 
                    name="folder" 
                    size={32} 
                    color={darkMode ? '#90caf9' : '#197278'} 
                  />
                </View>
                <Text style={[styles.categoryText, { 
                  color: darkMode ? '#fff' : '#14532d', 
                  fontSize: fontSize - 2
                }]}>
                  {category}
                </Text>
                <View style={styles.categoryArrow}>
                  <MaterialIcons 
                    name="chevron-right" 
                    size={24} 
                    color={darkMode ? '#90caf9' : '#197278'} 
                  />
                </View>
            </TouchableOpacity>
              </AdminActionHandler>
          ))}
        </View>
      )}
    </View>

      {/* مكون البحث الشامل */}
      <GlobalSearch 
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        navigation={navigation}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8f5e9',
  },
  header: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 30,
    paddingTop: 50,
    backgroundColor: '#197278',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },
  headerIcon: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  searchButton: {
    padding: 8,
    marginLeft: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  settingsButton: {
    padding: 8,
    marginLeft: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  syncButton: {
    padding: 8,
    marginLeft: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#197278',
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingSubText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  progressIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  progressText: {
    marginLeft: 8,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: '#197278',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  categoriesGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 4, // إضافة padding للتحكم في المسافات
  },
  categoryCard: {
    backgroundColor: '#fffde7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f2f1',
    width: '48%', // عرض 48% لضمان قسمين في صف
    aspectRatio: 1.2, // نفس نسبة العرض والارتفاع مثل الأقسام الفرعية
  },
  categoryIcon: {
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#14532d',
    textAlign: 'center',
    marginBottom: 8,
  },
  categoryArrow: {
    // إزالة margin
  },
});