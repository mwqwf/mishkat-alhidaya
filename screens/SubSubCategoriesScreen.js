import React, { useEffect, useState, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';
import AdminActionHandler from '../components/AdminActionHandler';
import eventEmitter from '../utils/EventEmitter';

const ISLAMIC_BG = '#e8f5e9'; // أخضر زمردي فاتح
const ISLAMIC_CARD = '#fffde7'; // أصفر ذهبي فاتح
const ISLAMIC_TEXT = '#14532d'; // أخضر داكن

export default function SubSubCategoriesScreen({ route, navigation }) {
  const { mainCategory, subCategory } = route.params;
  const [subSubCategories, setSubSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { getSubSubCategories, isOnline, refreshCategories } = useData();

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log(`📂 Loading sub-sub categories for: ${mainCategory} -> ${subCategory}`);
      
      // فحص الأقسام الفرعية الثانوية
      const subsubs = await getSubSubCategories(mainCategory, subCategory);
      console.log(`📂 Found ${subsubs?.length || 0} sub-sub categories`);
      
      // ترتيب الأقسام الفرعية الثانوية حسب الأحدث
      if (subsubs && subsubs.length > 0) {
        subsubs.sort((a, b) => b.localeCompare(a, 'ar'));
      }
      
      setSubSubCategories(subsubs || []);
      
      // إزالة الانتقال التلقائي - السماح بعرض الأقسام الفارغة
      // if (!subsubs || subsubs.length === 0) {
      //   navigation.replace('Content', { mainCategory, subCategory });
      // }
      
    } catch (error) {
      console.error('Error fetching sub-sub categories:', error);
      setSubSubCategories([]);
      // إزالة الانتقال التلقائي في حالة الخطأ أيضاً
      // navigation.replace('Content', { mainCategory, subCategory });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchDataSafe = async () => {
      setLoading(true);
      try {
        const subsubs = await getSubSubCategories(mainCategory, subCategory);
        if (!isMounted) return;
        if (subsubs && subsubs.length > 0) {
          subsubs.sort((a, b) => b.localeCompare(a, 'ar'));
        }
        setSubSubCategories(subsubs || []);
        // إزالة الانتقال التلقائي - السماح بعرض الأقسام الفارغة
        // if (!subsubs || subsubs.length === 0) {
        //   navigation.replace('Content', { mainCategory, subCategory });
        // }
      } catch (error) {
        if (error.message && error.message.includes('realm that has been closed')) {
          console.warn('fetchData aborted: Realm closed');
          return;
        }
        setSubSubCategories([]);
        // إزالة الانتقال التلقائي في حالة الخطأ أيضاً
        // navigation.replace('Content', { mainCategory, subCategory });
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchDataSafe();
    return () => { isMounted = false; };
  }, [navigation, mainCategory, subCategory, getSubSubCategories]);

  // تحديث الأقسام عند التركيز على الشاشة
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('📂 SubSubCategories screen focused - refreshing categories...');
      fetchData();
      // تحديث الأقسام الرئيسية والفرعية أيضاً
      refreshCategories?.();
    });
    return unsubscribe;
  }, [navigation, mainCategory, subCategory, refreshCategories]);

  useEffect(() => {
    const handleForceRefresh = () => fetchData();
    const handleClearContent = () => fetchData();
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('clearContent', handleClearContent);
    return () => {
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('clearContent', handleClearContent);
    };
  }, [mainCategory, subCategory, getSubSubCategories]);

  const handlePress = (subSubCategory) => {
    console.log(`📂 Navigating to: ${mainCategory} -> ${subCategory} -> ${subSubCategory}`);
    navigation.navigate('Content', { mainCategory, subCategory, subSubCategory });
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: darkMode ? '#222' : ISLAMIC_BG }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <MaterialIcons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={[styles.headerTitle, { fontSize: fontSize + 4 }]}>الأقسام الفرعية الثانوية</Text>
            <Text style={[styles.headerSubtitle, { fontSize: fontSize - 2 }]}>{subCategory}</Text>
          </View>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.loadingText, { fontSize, color: darkMode ? '#90caf9' : '#197278' }]}>
            جاري التحميل...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? '#222' : ISLAMIC_BG }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <MaterialIcons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { fontSize: fontSize + 4 }]}>الأقسام الفرعية الثانوية</Text>
          <Text style={[styles.headerSubtitle, { fontSize: fontSize - 2 }]}>{subCategory}</Text>
        </View>
      </View>

      {/* Status indicator */}
      {!isOnline && (
        <View style={styles.statusBar}>
          <MaterialIcons name="wifi-off" size={16} color="#fff" />
          <Text style={styles.statusText}>البيانات المحلية المتاحة</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* الأقسام الفرعية الثانوية */}
        {subSubCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="folder-open" size={64} color={darkMode ? '#555' : '#ccc'} />
            <Text style={[styles.emptyText, { fontSize, color: darkMode ? '#555' : '#999' }]}>
              لا توجد أقسام فرعية ثانوية في "{subCategory}"
            </Text>
            <Text style={[styles.emptySubText, { fontSize: fontSize - 2, color: darkMode ? '#777' : '#666' }]}>
              قد تحتاج للاتصال بالإنترنت لتحديث البيانات
            </Text>
          </View>
        ) : (
          <View style={styles.categoriesGrid}>
            {subSubCategories.map((subSubCategory, index) => (
              <AdminActionHandler
                key={index}
                item={{
                  label: subSubCategory,
                  subSubCategory: subSubCategory,
                  subCategory: subCategory,
                  mainCategory: mainCategory,
                  bookName: subSubCategory,
                  id: `subSubCategory_${index}`,
                  source: 'realm',
                  data: {
                    id: `subSubCategory_${index}`,
                    subSubCategory: subSubCategory,
                    subCategory: subCategory,
                    mainCategory: mainCategory
                  }
                }}
                itemType="subSubCategory"
                onSuccess={() => {
                  console.log('🔄 Admin action completed - forcing immediate refresh');
                  // إجبار التحديث الفوري
                  setTimeout(() => {
                    fetchData();
                  }, 500);
                }}
              >
                <TouchableOpacity
                  style={[styles.categoryCard, { backgroundColor: darkMode ? '#333' : ISLAMIC_CARD }]}
                  onPress={() => handlePress(subSubCategory)}
                >
                  <View style={styles.categoryIcon}>
                    <MaterialIcons 
                      name="folder" 
                      size={32} 
                      color={darkMode ? '#90caf9' : '#197278'} 
                    />
                  </View>
                  <Text style={[styles.categoryText, { 
                    color: darkMode ? '#fff' : ISLAMIC_TEXT, 
                    fontSize: fontSize - 2 
                  }]}>
                    {subSubCategory}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 3,
  },
  backButton: {
    padding: 5,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    color: '#e0e0e0',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d32f2f',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 5,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    color: '#999',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '48%',
    aspectRatio: 1.2,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryText: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  categoryArrow: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
});