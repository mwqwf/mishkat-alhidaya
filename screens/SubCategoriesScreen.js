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

export default function SubCategoriesScreen({ route, navigation }) {
  const { mainCategory } = route.params;
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { getSubCategories, isOnline, refreshCategories } = useData();

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log(`📂 Loading subcategories for: ${mainCategory} (Offline-First)`);
      
      // تحميل الأقسام الفرعية من Realm مباشرة
      const subs = await getSubCategories(mainCategory);
      console.log(`📂 Found ${subs.length} subcategories in local database`);
      
      // ترتيب الأقسام الفرعية حسب الأحدث (الأعلى في القائمة)
      if (subs && subs.length > 0) {
        subs.sort((a, b) => b.localeCompare(a, 'ar'));
      }
      
      setSubCategories(subs);
      
      // عرض البيانات المحلية فوراً حتى لو كانت فارغة
      setLoading(false);
      
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      setSubCategories([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchDataSafe = async () => {
      setLoading(true);
      try {
        const subs = await getSubCategories(mainCategory);
        if (!isMounted) return;
        if (subs && subs.length > 0) {
          subs.sort((a, b) => b.localeCompare(a, 'ar'));
        }
        setSubCategories(subs);
        setLoading(false);
      } catch (error) {
        if (error.message && error.message.includes('realm that has been closed')) {
          console.warn('fetchData aborted: Realm closed');
          return;
        }
        setSubCategories([]);
        setLoading(false);
      }
    };
    fetchDataSafe();
    return () => { isMounted = false; };
  }, [navigation, mainCategory, getSubCategories]);

  // تحديث الأقسام عند التركيز على الشاشة
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('📂 SubCategories screen focused - refreshing categories...');
      fetchData();
      // تحديث الأقسام الرئيسية أيضاً
      refreshCategories?.();
    });
    return unsubscribe;
  }, [navigation, mainCategory, refreshCategories]);

  useEffect(() => {
    const handleForceRefresh = () => fetchData();
    const handleClearContent = () => fetchData();
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('clearContent', handleClearContent);
    return () => {
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('clearContent', handleClearContent);
    };
  }, [mainCategory, getSubCategories]);

  const handlePress = (subCategory) => {
    console.log(`📂 Navigating to: ${mainCategory} -> ${subCategory}`);
    navigation.navigate('SubSubCategories', { mainCategory, subCategory });
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? '#222' : ISLAMIC_BG }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <MaterialIcons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { fontSize: fontSize + 4 }]}>الأقسام الفرعية</Text>
          <Text style={[styles.headerSubtitle, { fontSize: fontSize - 2 }]}>{mainCategory}</Text>
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
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { fontSize, color: darkMode ? '#90caf9' : '#197278' }]}>
              جاري تحميل الأقسام الفرعية...
            </Text>
          </View>
        ) : (
          <>
            {subCategories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="folder-open" size={64} color={darkMode ? '#555' : '#ccc'} />
                <Text style={[styles.emptyText, { fontSize, color: darkMode ? '#555' : '#999' }]}>
                  لا توجد أقسام فرعية في "{mainCategory}"
                </Text>
                <Text style={[styles.emptySubText, { fontSize: fontSize - 2, color: darkMode ? '#777' : '#666' }]}>
                  قد تحتاج للاتصال بالإنترنت لتحديث البيانات
                </Text>
              </View>
            ) : (
              <View style={styles.categoriesGrid}>
                {subCategories.map((subCategory, index) => (
                  <AdminActionHandler
                    key={index}
                    item={{
                      label: subCategory,
                      subCategory: subCategory,
                      mainCategory: mainCategory,
                      bookName: subCategory,
                      id: `subCategory_${index}`,
                      source: 'realm',
                      data: {
                        id: `subCategory_${index}`,
                        subCategory: subCategory,
                        mainCategory: mainCategory
                      }
                    }}
                    itemType="subCategory"
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
                      onPress={() => handlePress(subCategory)}
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
                        {subCategory}
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
          </>
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
    backgroundColor: '#d32f2f', // Red for offline status
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
    width: '48%', // Two columns
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
    backgroundColor: '#e0f2f7', // Light blue background
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