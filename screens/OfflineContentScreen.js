import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';

export default function OfflineContentScreen({ navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { getDataService } = useData();
  const [offlineContent, setOfflineContent] = useState([]);
  const [storageStats, setStorageStats] = useState({ totalFiles: 0, totalSize: 0, totalSizeMB: '0.00' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOfflineContent();
  }, []);

  const loadOfflineContent = async () => {
    try {
      setLoading(true);
      const dataService = getDataService();
      
      // تحميل المحتوى المتاح محلياً
      const content = dataService.getOfflineContent();
      setOfflineContent(content);
      
      // تحميل إحصائيات التخزين
      const stats = await dataService.getOfflineStorageStats();
      setStorageStats(stats);
      
      console.log(`📊 Loaded ${content.length} offline items, ${stats.totalSizeMB}MB total`);
      
    } catch (error) {
      console.error('Error loading offline content:', error);
      Alert.alert('خطأ', 'حدث خطأ في تحميل المحتوى المحلي');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOfflineContent();
    setRefreshing(false);
  };

  const openOfflineContent = async (item) => {
    try {
      const dataService = getDataService();
      
      // تسجيل الوصول
      dataService.recordContentAccess(item.id);
      
      // فتح المحتوى حسب النوع
      if (item.contentType === 'video') {
        const serializableContent = {
          ...item,
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
          updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
          contentUrl: item.localFilePath,
          isOfflineContent: true
        };
        navigation.navigate('VideoPlayer', { content: serializableContent });
        
      } else if (item.contentType === 'audio') {
        navigation.navigate('AudioPlayer', {
          content: {
            ...item,
            contentUrl: item.localFilePath,
            isOfflineContent: true
          }
        });
        
      } else {
        // كتاب
        const serializableBook = {
          ...item,
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
          updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
          localUri: item.localFilePath,
          isOfflineContent: true
        };
        navigation.navigate('BookPdfViewer', { book: serializableBook });
      }
      
    } catch (error) {
      console.error('Error opening offline content:', error);
      Alert.alert('خطأ', 'حدث خطأ في فتح المحتوى');
    }
  };

  const deleteOfflineContent = async (item) => {
    Alert.alert(
      'حذف المحتوى المحلي',
      `هل أنت متأكد من حذف "${item.bookName}" من التخزين المحلي؟\n\nسيمكنك إعادة تحميله لاحقاً.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              const dataService = getDataService();
              const result = await dataService.deleteLocalContent(item.id);
              
              if (result.success) {
                Alert.alert('تم الحذف', result.message);
                // إعادة تحميل القائمة
                await loadOfflineContent();
              } else {
                Alert.alert('فشل الحذف', result.message);
              }
              
            } catch (error) {
              console.error('Error deleting offline content:', error);
              Alert.alert('خطأ', 'حدث خطأ في حذف المحتوى');
            }
          }
        }
      ]
    );
  };

  const getContentTypeIcon = (contentType) => {
    switch (contentType) {
      case 'video': return 'video-library';
      case 'audio': return 'audiotrack';
      default: return 'menu-book';
    }
  };

  const getContentTypeLabel = (contentType) => {
    switch (contentType) {
      case 'video': return 'فيديو';
      case 'audio': return 'صوت';
      default: return 'كتاب';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderOfflineItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.contentCard, darkMode && { backgroundColor: '#333', borderColor: '#444' }]}
      onPress={() => openOfflineContent(item)}
    >
      <View style={styles.contentHeader}>
        <View style={styles.contentInfo}>
          <View style={styles.titleRow}>
            <MaterialIcons 
              name={getContentTypeIcon(item.contentType)} 
              size={24} 
              color={darkMode ? '#90caf9' : '#197278'} 
            />
            <Text style={[styles.contentTitle, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize + 2 }]} numberOfLines={2}>
              {item.bookName}
            </Text>
          </View>
          
          <View style={styles.metaRow}>
            <Text style={[styles.contentType, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
              {getContentTypeLabel(item.contentType)}
            </Text>
            <Text style={[styles.fileSize, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
              {formatFileSize(item.localFileSize || 0)}
            </Text>
          </View>
          
          {item.mainCategory && (
            <Text style={[styles.category, { color: darkMode ? '#888' : '#777', fontSize: fontSize - 3 }]}>
              {item.mainCategory}
              {item.subCategory && ` • ${item.subCategory}`}
            </Text>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.deleteButton, { backgroundColor: darkMode ? '#444' : '#ffebee' }]}
          onPress={() => deleteOfflineContent(item)}
        >
          <MaterialIcons name="delete" size={20} color={darkMode ? '#f44336' : '#d32f2f'} />
        </TouchableOpacity>
      </View>
      
      <View style={[styles.offlineIndicator, { backgroundColor: darkMode ? '#1b5e20' : '#e8f5e9' }]}>
        <MaterialIcons name="offline-pin" size={16} color={darkMode ? '#4caf50' : '#2e7d32'} />
        <Text style={[styles.offlineText, { color: darkMode ? '#4caf50' : '#2e7d32', fontSize: fontSize - 3 }]}>
          متاح بدون إنترنت
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: darkMode ? '#222' : '#f5f5f5' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278', fontSize }]}>
            جاري تحميل المحتوى المحلي...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: darkMode ? '#222' : '#f5f5f5' }]}>
      {/* Header */}
      <View style={[styles.header, darkMode && { backgroundColor: '#333', borderBottomColor: '#444' }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkMode ? '#90caf9' : '#197278'} />
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize + 4 }]}>
          المحتوى المحلي
        </Text>
        
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <MaterialIcons name="refresh" size={24} color={darkMode ? '#90caf9' : '#197278'} />
        </TouchableOpacity>
      </View>

      {/* إحصائيات التخزين */}
      <View style={[styles.statsCard, darkMode && { backgroundColor: '#333', borderColor: '#444' }]}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="folder" size={24} color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.statNumber, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize + 2 }]}>
              {storageStats.totalFiles}
            </Text>
            <Text style={[styles.statLabel, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
              ملف
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <MaterialIcons name="storage" size={24} color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.statNumber, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize + 2 }]}>
              {storageStats.totalSizeMB}
            </Text>
            <Text style={[styles.statLabel, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
              ميجابايت
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <MaterialIcons name="offline-pin" size={24} color={darkMode ? '#4caf50' : '#2e7d32'} />
            <Text style={[styles.statNumber, { color: darkMode ? '#4caf50' : '#2e7d32', fontSize: fontSize + 2 }]}>
              100%
            </Text>
            <Text style={[styles.statLabel, { color: darkMode ? '#4caf50' : '#2e7d32', fontSize: fontSize - 2 }]}>
              بدون إنترنت
            </Text>
          </View>
        </View>
      </View>

      {/* قائمة المحتوى */}
      {offlineContent.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="cloud-off" size={64} color={darkMode ? '#666' : '#bbb'} />
          <Text style={[styles.emptyTitle, { color: darkMode ? '#666' : '#888', fontSize: fontSize + 2 }]}>
            لا يوجد محتوى محلي
          </Text>
          <Text style={[styles.emptySubtitle, { color: darkMode ? '#555' : '#aaa', fontSize: fontSize }]}>
            ابدأ بتحميل بعض المحتوى للوصول إليه بدون إنترنت
          </Text>
        </View>
      ) : (
        <FlatList
          data={offlineContent}
          keyExtractor={(item) => item.id}
          renderItem={renderOfflineItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[darkMode ? '#90caf9' : '#197278']}
              tintColor={darkMode ? '#90caf9' : '#197278'}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: 8,
  },
  statsCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 2,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  contentInfo: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  contentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contentType: {
    fontSize: 14,
  },
  fileSize: {
    fontSize: 14,
  },
  category: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 20,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  offlineText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
}); 