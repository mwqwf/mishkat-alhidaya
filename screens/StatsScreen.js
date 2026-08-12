import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';
import dataService from '../services/dataService';

export default function StatsScreen({ navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { getAllBooks, getMainCategories, refreshStats, stats: contextStats } = useData();
  const [stats, setStats] = useState({
    books: 0,
    videos: 0,
    audios: 0,
    main: 0,
    sub: 0,
    subsub: 0,
    devicesCount: 0,
    updatesWithImages: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // حساب إحصائيات المحتوى من Realm
  const calculateContentStats = (books) => {
    const stats = { books: 0, videos: 0, audios: 0 };
    
    books.forEach(book => {
      if (book.contentType === 'video') {
        stats.videos++;
      } else if (book.contentType === 'audio') {
        stats.audios++;
      } else {
        stats.books++;
      }
    });
    
    return stats;
  };

  // حساب إحصائيات الأقسام من الكتب (نفس منطق DataContext) - تحديث 2025
  const calculateCategoryStats = (books) => {
    try {
      console.log('📊 Calculating category stats from books...');
      console.log(`📊 Found ${books.length} books for category extraction`);
      
      const mainCategories = new Set();
      const subCategories = new Set();
      const subSubCategories = new Set();

      books.forEach(book => {
        if (book.mainCategory && book.mainCategory.trim()) {
          mainCategories.add(book.mainCategory.trim());
          
          if (book.subCategory && book.subCategory.trim()) {
            subCategories.add(`${book.mainCategory}-${book.subCategory}`);
            
            if (book.subSubCategory && book.subSubCategory.trim()) {
              subSubCategories.add(`${book.mainCategory}-${book.subCategory}-${book.subSubCategory}`);
            }
          }
        }
      });

      const categoryStats = {
        main: mainCategories.size,
        sub: subCategories.size,
        subsub: subSubCategories.size
      };

      console.log('📊 Category stats calculated:', categoryStats);
      console.log('📊 Main categories:', Array.from(mainCategories));
      console.log('📊 Sub categories:', Array.from(subCategories));
      console.log('📊 SubSub categories:', Array.from(subSubCategories));

      return categoryStats;
    } catch (error) {
      console.error('❌ Error calculating category stats:', error);
      return { main: 0, sub: 0, subsub: 0 };
    }
  };

  // حساب عدد الأجهزة من Firebase (الوحيد المتبقي)
  const getDevicesCount = async () => {
    try {
      const devicesSnapshot = await getDocs(collection(db, 'devices'));
      return devicesSnapshot.size;
    } catch (error) {
      console.log('Devices collection not found:', error);
      return 0;
    }
  };

  // حساب عدد المستجدات مع الصور من Firebase
  const getUpdatesWithImages = async () => {
    try {
      const updatesSnapshot = await getDocs(collection(db, 'appUpdates'));
      let count = 0;
      updatesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.imageUrl && data.imageUrl.trim()) {
          count++;
        }
      });
      console.log(`📊 Found ${count} updates with images from Firebase`);
      return count;
    } catch (error) {
      console.log('Updates collection not found:', error);
      return 0;
    }
  };

  // جلب الإحصائيات من Realm والمصادر الأخرى
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // جلب البيانات من Realm
      console.log('📊 Fetching data from Realm...');
      const books = await getAllBooks();
      
      console.log(`📊 Found ${books.length} books in Realm`);

      // حساب إحصائيات المحتوى والأقسام
      const contentStats = calculateContentStats(books);
      const categoryStats = calculateCategoryStats(books); // استخدام async

      // جلب الإحصائيات التي لا تزال تعتمد على Firebase
      const [devicesCount, updatesWithImages] = await Promise.all([
        getDevicesCount(),
        getUpdatesWithImages()
      ]);

      const newStats = {
        ...contentStats,
        ...categoryStats,
        devicesCount,
        updatesWithImages
      };

      setStats(newStats);

      console.log('📊 Stats calculated successfully:', newStats);

      // تحديث الإحصائيات في DataContext أيضاً
      await refreshStats();

    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      setError('حدث خطأ في تحميل الإحصائيات');
    } finally {
      setLoading(false);
    }
  };

  // استماع لتغييرات الإحصائيات من DataContext
  useEffect(() => {
    if (contextStats) {
      console.log('📊 Received updated stats from DataContext:', contextStats);
      // تحديث جزئي بالبيانات من DataContext (بدون إعادة تعيين إحصائيات الأقسام)
      setStats(prevStats => ({
        ...prevStats,
        books: contextStats.totalBooks || 0,
        videos: contextStats.totalVideos || 0,
        audios: contextStats.totalAudios || 0,
        // لا نعيد تعيين main, sub, subsub - نتركها كما هي من الحسابات المحلية
      }));
    }
  }, [contextStats]);

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? '#222' : '#f5f5f5' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: fontSize + 6 }]}>📊 الإحصائيات</Text>
        <TouchableOpacity 
          style={styles.exitButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.exitButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* المحتوى */}
      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278', fontSize }]}>
              جاري تحميل الإحصائيات...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { fontSize }]}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchStats}>
              <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* إحصائيات المحتوى الرئيسية */}
            <View style={styles.statsSection}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize + 2 }]}>📊 إحصائيات المحتوى</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.primaryCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📚</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.books || 0}</Text>
                  <Text style={styles.statLabel}>الكتب</Text>
                </View>
                
                <View style={[styles.statCard, styles.successCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>🎥</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.videos || 0}</Text>
                  <Text style={styles.statLabel}>الفيديوهات</Text>
                </View>
                
                <View style={[styles.statCard, styles.warningCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>🎵</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.audios || 0}</Text>
                  <Text style={styles.statLabel}>الصوتيات</Text>
                </View>
              </View>
            </View>

            {/* إحصائيات الأقسام */}
            <View style={styles.statsSection}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize + 2 }]}>🗂️ إحصائيات التصنيفات</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.infoCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📁</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.main}</Text>
                  <Text style={styles.statLabel}>الأقسام الرئيسية</Text>
                </View>
                
                <View style={[styles.statCard, styles.secondaryCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📂</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.sub}</Text>
                  <Text style={styles.statLabel}>الأقسام الفرعية</Text>
                </View>
                
                <View style={[styles.statCard, styles.deviceCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>🗃️</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.subsub}</Text>
                  <Text style={styles.statLabel}>الأقسام الفرعية الثانوية</Text>
                </View>
              </View>
            </View>

            {/* إحصائيات النظام */}
            <View style={styles.statsSection}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize + 2 }]}>⚙️ إحصائيات النظام</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.totalCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📱</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.devicesCount}</Text>
                  <Text style={styles.statLabel}>الأجهزة المثبتة</Text>
                </View>
                
                <View style={[styles.statCard, styles.primaryCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📊</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.main + stats.sub + stats.subsub}</Text>
                  <Text style={styles.statLabel}>إجمالي الأقسام</Text>
                </View>

                <View style={[styles.statCard, styles.imageCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>🖼️</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.updatesWithImages || 0}</Text>
                  <Text style={styles.statLabel}>صور المستجدات</Text>
                </View>
              </View>
            </View>

            {/* إحصائيات إضافية */}
            <View style={styles.statsSection}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize + 2 }]}>📈 إحصائيات إضافية</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.successCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📋</Text>
                  </View>
                  <Text style={styles.statValue}>{stats.books + stats.videos + stats.audios}</Text>
                  <Text style={styles.statLabel}>إجمالي المحتوى</Text>
                </View>
                
                <View style={[styles.statCard, styles.warningCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>📱</Text>
                  </View>
                  <Text style={styles.statValue}>Realm</Text>
                  <Text style={styles.statLabel}>قاعدة البيانات</Text>
                </View>
                
                <View style={[styles.statCard, styles.infoCard]}>
                  <View style={styles.statIcon}>
                    <Text style={styles.iconText}>🔄</Text>
                  </View>
                  <Text style={styles.statValue}>محدث</Text>
                  <Text style={styles.statLabel}>حالة البيانات</Text>
                </View>
              </View>
            </View>

            {/* زر التحديث */}
            <View style={styles.refreshContainer}>
              <TouchableOpacity style={styles.refreshButton} onPress={fetchStats}>
                <Text style={styles.refreshButtonText}>🔄 تحديث الإحصائيات</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 50,
    backgroundColor: '#197278',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // نفس styles الإحصائيات من AdminDashboard
  statsSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#197278',
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 4,
  },
  statCard: {
    backgroundColor: '#e0f2f1',
    borderRadius: 12,
    padding: 10,
    margin: 3,
    minWidth: 80,
    alignItems: 'center',
    elevation: 2,
    flex: 1,
    maxWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  statIcon: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    elevation: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#197278',
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
  statValue: {
    fontSize: 20,
    color: '#197278',
    fontWeight: 'bold',
    marginVertical: 2,
  },
  iconText: {
    fontSize: 20,
  },
  // نفس ألوان الكروت من AdminDashboard
  primaryCard: {
    backgroundColor: '#e3f2fd', // Light blue
    borderColor: '#90caf9',
    borderWidth: 2,
  },
  successCard: {
    backgroundColor: '#e8f5e9', // Light green
    borderColor: '#a5d6a7',
    borderWidth: 2,
  },
  infoCard: {
    backgroundColor: '#e0f2f7', // Light cyan
    borderColor: '#90caf9',
    borderWidth: 2,
  },
  warningCard: {
    backgroundColor: '#fff3e0', // Light orange
    borderColor: '#ffcc80',
    borderWidth: 2,
  },
  secondaryCard: {
    backgroundColor: '#f3e5f5', // Light purple
    borderColor: '#ce93d8',
    borderWidth: 2,
  },
  deviceCard: {
    backgroundColor: '#e1bee7', // Light pink
    borderColor: '#ce93d8',
    borderWidth: 2,
  },
  totalCard: {
    backgroundColor: '#e0f2f7', // Light cyan
    borderColor: '#90caf9',
    borderWidth: 2,
  },
  imageCard: {
    backgroundColor: '#e0f2f7', // Light cyan
    borderColor: '#90caf9',
    borderWidth: 2,
  },
  refreshContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  refreshButton: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    elevation: 2,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  exitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
}); 