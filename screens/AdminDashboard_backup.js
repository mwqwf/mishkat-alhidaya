import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';

export default function HomeScreen({ navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { categories, isOnline, error, loading, resetAndSync } = useData();
  const [mainCategories, setMainCategories] = useState([]);

  // إضافة متغيرات للتحكم في الضغط على العنوان للوصول للوحة التحكم
  const [tapCount, setTapCount] = useState(0);
  const tapTimeout = useRef(null);

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
        setMainCategories(filteredCategories);
      }
    } else {
      console.log('📊 No categories available');
      setMainCategories([]);
    }
  }, [categories, loading]);

  const handleCategoryPress = (mainCategory) => {
    console.log('📊 Navigating to SubCategories with:', mainCategory);
    navigation.navigate('SubCategories', { mainCategory });
  };

  // إضافة تحديث يدوي للبيانات
  const handleRefresh = async () => {
    console.log('🔄 Manual refresh requested');
    try {
      await resetAndSync();
      console.log('✅ Manual refresh completed');
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
    }
  };

  // دالة للتعامل مع الضغط على العنوان للوصول للوحة التحكم
  const handleTitlePress = () => {
    // إلغاء المؤقت السابق إذا كان موجوداً
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
    }

    const newTapCount = tapCount + 1;
    setTapCount(newTapCount);

    console.log(`🔑 Tap count: ${newTapCount}/6`);

    // إذا وصل العداد إلى 6، انتقل إلى لوحة التحكم
    if (newTapCount === 6) {
      console.log('🔑 Admin access granted - 6 taps detected');
      setTapCount(0); // إعادة تعيين العداد
      navigation.navigate('AdminDashboard');
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
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={handleTitlePress} activeOpacity={0.7}>
            <Text style={[styles.headerTitle, { fontSize: fontSize + 8 }]}>مشكاة الهداية</Text>
          </TouchableOpacity>
          <Text style={[styles.headerSubtitle, { fontSize: fontSize }]}>مكتبة إسلامية شاملة</Text>
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
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278' }]}>
              جاري تحميل التصنيفات...
            </Text>
            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
              <Text style={styles.refreshButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
      ) : mainCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="category" size={64} color={darkMode ? '#555' : '#ccc'} />
            <Text style={[styles.emptyText, { color: darkMode ? '#555' : '#999' }]}>
              لا توجد تصنيفات متاحة
        </Text>
            {!isOnline && (
              <Text style={[styles.emptySubText, { color: darkMode ? '#777' : '#666' }]}>
                تحقق من الاتصال بالإنترنت وأعد المحاولة
              </Text>
            )}
            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
              <Text style={styles.refreshButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.categoriesGrid}>
            {mainCategories.map((category, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.categoryCard, { backgroundColor: darkMode ? '#333' : '#fffde7' }]}
                onPress={() => handleCategoryPress(category)}
              >
                <View style={styles.categoryIcon}>
                  <MaterialIcons 
                    name="folder" 
                    size={40} 
                    color={darkMode ? '#90caf9' : '#197278'} 
                  />
                </View>
                <Text style={[styles.categoryText, { 
                  color: darkMode ? '#fff' : '#14532d', 
                  fontSize: fontSize 
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
    backgroundColor: '#e8f5e9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 30,
    paddingTop: 50,
    backgroundColor: '#197278',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'right',
    marginTop: 4,
  },
  headerIcon: {
    marginLeft: 20,
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
  refreshButton: {
    backgroundColor: '#197278',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
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
  },
  categoryCard: {
    backgroundColor: '#fffde7',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f2f1',
  },
  categoryIcon: {
    marginRight: 16,
  },
  categoryText: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#14532d',
    textAlign: 'right',
  },
  categoryArrow: {
    marginLeft: 8,
  },
});