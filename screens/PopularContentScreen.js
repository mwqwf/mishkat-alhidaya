import React, { useEffect, useState, useContext, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  RefreshControl,
  Image,
  Dimensions,
  Modal,
  ScrollView
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import smartCacheService from '../services/SmartCacheService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import eventEmitter from '../utils/EventEmitter';

const { width, height } = Dimensions.get('window');

export default function AppUpdatesScreen({ navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [downloadingImages, setDownloadingImages] = useState(new Map());
  const [downloadedImages, setDownloadedImages] = useState(new Map());
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // تحميل مستجدات التطبيق مع التمرير اللانهائي
  const loadAppUpdates = useCallback(async (page = 0, isRefresh = false) => {
    try {
      if (!smartCacheService.isInitialized) {
        console.log('⚠️ SmartCacheService not initialized yet');
        return { items: [], hasMore: false };
      }
      
      console.log(`📱 Loading app updates (page ${page})...`);
      
      if (isRefresh) {
        setRefreshing(true);
      } else if (page > 0) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      // استخدام SmartCacheService للتحميل الذكي
      const result = await smartCacheService.loadAppUpdates(page);
      
      console.log(`📱 Loaded ${result.items.length} updates (page ${page}), fromCache: ${result.fromCache}`);
      
      setFromCache(result.fromCache);
      
      return {
        items: result.items,
        hasMore: result.hasMore
      };
      
    } catch (error) {
      console.error(`❌ Error loading app updates (page ${page}):`, error);
      return { items: [], hasMore: false };
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  // تحميل الصور المحملة من التخزين المحلي
  const loadDownloadedImages = useCallback(async () => {
    try {
      const downloadedImagesData = await AsyncStorage.getItem('downloadedImages');
      if (downloadedImagesData) {
        const parsedData = JSON.parse(downloadedImagesData);
        setDownloadedImages(new Map(Object.entries(parsedData)));
      }
    } catch (error) {
      console.error('Error loading downloaded images:', error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const loadInitialContent = async () => {
      try {
        const result = await loadAppUpdates(0);
        
        if (isMounted) {
          setUpdates(result.items);
          setHasMore(result.hasMore);
          setCurrentPage(0);
          
          console.log(`✅ Initial app updates loaded: ${result.items.length} items`);
        }
      } catch (error) {
        console.error('❌ Error loading initial app updates:', error);
        if (isMounted) {
          setUpdates([]);
          setHasMore(false);
        }
      }
    };

    loadInitialContent();
    loadDownloadedImages();
    
    return () => {
      isMounted = false;
    };
  }, [loadAppUpdates, loadDownloadedImages]);

  // دالة التحديث
  const handleRefresh = useCallback(async () => {
    try {
      const result = await loadAppUpdates(0, true);
      setUpdates(result.items);
      setHasMore(result.hasMore);
      setCurrentPage(0);
      
      // تحديث الصور المحملة
      await loadDownloadedImages();
      
    } catch (error) {
      console.error('❌ Error refreshing app updates:', error);
    }
  }, [loadAppUpdates, loadDownloadedImages]);

  // دالة تحميل المزيد
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    try {
      const nextPage = currentPage + 1;
      const result = await loadAppUpdates(nextPage);
      
      if (result.items.length > 0) {
        setUpdates(prevUpdates => [...prevUpdates, ...result.items]);
        setCurrentPage(nextPage);
        setHasMore(result.hasMore);
      } else {
        setHasMore(false);
      }
      
    } catch (error) {
      console.error('❌ Error loading more app updates:', error);
      setHasMore(false);
    }
  }, [currentPage, hasMore, loadingMore, loadAppUpdates]);

  // إضافة listener للتحديث عند العودة للصفحة
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // إزالة المزامنة التلقائية - تحديث البيانات فقط عند الحاجة
      console.log('📊 Popular content screen focused - no automatic sync needed');
    });

    return unsubscribe;
  }, [navigation]);

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

  const formatDate = (date) => {
    if (!date) return '';
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      const now = new Date();
      const diffTime = Math.abs(now - dateObj);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        return 'منذ يوم واحد';
      } else if (diffDays < 7) {
        return `منذ ${diffDays} أيام`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return weeks === 1 ? 'منذ أسبوع' : `منذ ${weeks} أسابيع`;
      } else {
        const months = Math.floor(diffDays / 30);
        return months === 1 ? 'منذ شهر' : `منذ ${months} أشهر`;
      }
    } catch (error) {
      return '';
    }
  };

  // رندر footer للتمرير اللانهائي
  const renderFooter = () => {
    if (!hasMore) {
      return (
        <View style={styles.footerContainer}>
          <Text style={[styles.footerText, { color: darkMode ? '#888' : '#666' }]}>
            لا توجد مستجدات أخرى
          </Text>
        </View>
      );
    }

    if (loadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.footerText, { color: darkMode ? '#90caf9' : '#197278' }]}>
            جاري تحميل المزيد...
          </Text>
        </View>
      );
    }

    return null;
  };

  // تبديل حالة النص المختصر/الكامل
  const toggleExpanded = (itemId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // تحديد ما إذا كان النص طويل
  const isTextLong = (text) => {
    return text && text.length > 150;
  };

  // اقتطاع النص للعرض المختصر
  const truncateText = (text, maxLength = 150) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // تحميل الصورة
  const downloadImage = async (imageUrl, uniqueId) => {
    try {
      setDownloadingImages(prev => new Map(prev.set(uniqueId, { progress: 0, downloading: true })));

      // استخراج الـ ID الحقيقي للـ item من الـ uniqueId
      const actualUpdateId = uniqueId.toString().includes('_') ? uniqueId.split('_')[0] : uniqueId;
      const fileName = `update_image_${actualUpdateId}_${Date.now()}.jpg`;
      const localPath = `${FileSystem.documentDirectory}${fileName}`;

      // تحميل الصورة مع تتبع التقدم
      const downloadResumable = FileSystem.createDownloadResumable(
        imageUrl,
        localPath,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadingImages(prev => new Map(prev.set(uniqueId, { 
            progress: Math.round(progress * 100), 
            downloading: true 
          })));
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result && result.uri) {
        // حفظ معلومات التحميل
        const downloadData = {
          imageUrl: imageUrl,
          localPath: result.uri,
          updateId: actualUpdateId,
          uniqueId: uniqueId,
          downloadDate: new Date().toISOString(),
          fileName: fileName
        };

        await AsyncStorage.setItem(`downloaded_update_image_${uniqueId}`, JSON.stringify(downloadData));
        
        // تحديث الحالة
        setDownloadedImages(prev => new Map(prev.set(imageUrl, result.uri)));
        setDownloadingImages(prev => {
          const newMap = new Map(prev);
          newMap.delete(uniqueId);
          return newMap;
        });

        console.log('✅ تم تحميل الصورة:', result.uri);
      }
    } catch (error) {
      console.error('❌ خطأ في تحميل الصورة:', error);
      setDownloadingImages(prev => {
        const newMap = new Map(prev);
        newMap.delete(uniqueId);
        return newMap;
      });
      Alert.alert('خطأ', 'فشل في تحميل الصورة');
    }
  };

  // مشاركة الصورة مع التعليق
  const shareImage = async (localPath, updateItem) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('خطأ', 'ميزة المشاركة غير متاحة على هذا الجهاز');
        return;
      }

      // إنشاء رسالة تتضمن التعليق إذا كان موجود
      let shareMessage = 'صورة من مستجدات التطبيق';
      if (updateItem.description) {
        shareMessage = updateItem.description;
      }

      await Sharing.shareAsync(localPath, {
        dialogTitle: shareMessage,
        mimeType: 'image/jpeg'
      });
    } catch (error) {
      console.error('❌ خطأ في المشاركة:', error);
      Alert.alert('خطأ', 'فشل في مشاركة الصورة');
    }
  };

  // فتح الصورة في تطبيق خارجي
  const openImageExternal = async (localPath) => {
    try {
      const canOpen = await Linking.canOpenURL(localPath);
      if (canOpen) {
        await Linking.openURL(localPath);
      } else {
        Alert.alert('خطأ', 'لا يمكن فتح الصورة في تطبيق خارجي');
      }
    } catch (error) {
      console.error('❌ خطأ في فتح التطبيق الخارجي:', error);
      Alert.alert('خطأ', 'فشل في فتح الصورة في تطبيق خارجي');
    }
  };

  // التعامل مع ضغطة الصورة
  const handleImagePress = (imageUrl, uniqueId) => {
    const localPath = downloadedImages.get(imageUrl);
    
    if (localPath) {
      // الصورة محملة - فتحها في عارض الصور
      const updateItem = updates.find(item => {
        // دعم كل من الـ ID العادي والـ ID مع الفهرس للصور المتعددة
        const itemId = uniqueId.toString().includes('_') ? uniqueId.split('_')[0] : uniqueId;
        return item.id === itemId;
      });
      setSelectedImage({
        uri: localPath,
        updateItem: updateItem
      });
      setImageViewerVisible(true);
    } else {
      // الصورة غير محملة - بدء التحميل مباشرة
      downloadImage(imageUrl, uniqueId);
    }
  };

  // إغلاق عارض الصور
  const closeImageViewer = () => {
    setImageViewerVisible(false);
    setSelectedImage(null);
  };

  const renderUpdateItem = ({ item }) => {
    const isExpanded = expandedItems.has(item.id);
    const isArticle = item.type === 'article';
    const contentText = isArticle ? item.content : item.description;
    const textIsLong = isTextLong(contentText);
    const displayText = textIsLong && !isExpanded ? truncateText(contentText) : contentText;
    const downloadProgress = downloadingImages.get(item.id);
    
    // دعم الصور المتعددة - التحقق من وجود imageUrls أو imageUrl
    const images = item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : []);
    const hasImages = images.length > 0;

    return (
      <View style={[
        styles.updateCard,
        { backgroundColor: darkMode ? '#2c2c2c' : '#ffffff' }
      ]}>
        {/* تاريخ النشر ونوع المستجدة */}
        <View style={styles.dateContainer}>
          <MaterialIcons 
            name={isArticle ? "article" : "image"} 
            size={16} 
            color={darkMode ? '#888' : '#666'} 
          />
          <Text style={[
            styles.dateText,
            { 
              color: darkMode ? '#888' : '#666',
              fontSize: fontSize - 2
            }
          ]}>
            {formatDate(item.createdAt)} • {isArticle ? 'مقال' : `صور (${images.length})`}
          </Text>
        </View>

        {/* العنوان إذا كان موجوداً */}
        {item.title && (
          <View style={styles.titleContainer}>
            <Text style={[
              styles.titleText,
              { 
                color: darkMode ? '#ffffff' : '#333333',
                fontSize: fontSize + 2
              }
            ]}>
              {item.title}
            </Text>
          </View>
        )}

        {/* الصور إذا كانت موجودة (للصور فقط) */}
        {!isArticle && hasImages && (
          <View style={styles.imagesContainer}>
            {images.length === 1 ? (
              // صورة واحدة - عرض كبير
              <TouchableOpacity 
                style={styles.singleImageContainer}
                onPress={() => handleImagePress(images[0], item.id)}
                activeOpacity={0.8}
              >
                <Image 
                  source={{ uri: images[0] }} 
                  style={styles.singleImage}
                  resizeMode="contain"
                />
                
                {/* طبقة التحميل */}
                {downloadProgress && (
                  <View style={styles.downloadOverlay}>
                    <View style={styles.downloadContent}>
                      <ActivityIndicator size="large" color="#197278" />
                      <Text style={styles.downloadProgress}>
                        {downloadProgress.progress}%
                      </Text>
                      <Text style={styles.downloadText}>جاري التحميل...</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              // صور متعددة - عرض شبكي
              <View style={styles.multipleImagesContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {images.map((imageUrl, index) => {
                    const isDownloaded = downloadedImages.has(imageUrl);
                    const imageDownloadProgress = downloadingImages.get(`${item.id}_${index}`);
                    
                    return (
                      <TouchableOpacity 
                        key={index}
                        style={styles.multipleImageItem}
                        onPress={() => handleImagePress(imageUrl, `${item.id}_${index}`)}
                        activeOpacity={0.8}
                      >
                        <Image 
                          source={{ uri: imageUrl }} 
                          style={styles.multipleImage}
                          resizeMode="cover"
                        />
                        
                        {/* رقم الصورة */}
                        <View style={styles.imageNumberBadge}>
                          <Text style={styles.imageNumberText}>{index + 1}</Text>
                        </View>
                        
                        {/* طبقة التحميل للصور المتعددة */}
                        {imageDownloadProgress && (
                          <View style={styles.downloadOverlay}>
                            <ActivityIndicator size="small" color="#197278" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                
                {/* عداد الصور */}
                <View style={styles.imagesCountBadge}>
                  <Text style={styles.imagesCountText}>{images.length} صور</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* خيارات الصور المحملة */}
        {!isArticle && hasImages && downloadedImages.size > 0 && !downloadProgress && (
          <View style={styles.imageActionsContainer}>
            <TouchableOpacity
              style={[styles.imageActionBtn, styles.shareBtn]}
              onPress={() => {
                // في حالة الصور المتعددة، نشارك الصورة الأولى
                const firstImageUrl = images[0];
                const localPath = downloadedImages.get(firstImageUrl);
                if (localPath) {
                  shareImage(localPath, item);
                }
              }}
            >
              <MaterialIcons name="share" size={18} color="#fff" />
              <Text style={styles.imageActionText}>مشاركة</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.imageActionBtn, styles.externalBtn]}
              onPress={() => {
                const firstImageUrl = images[0];
                const localPath = downloadedImages.get(firstImageUrl);
                if (localPath) {
                  openImageExternal(localPath);
                }
              }}
            >
              <MaterialIcons name="open-in-new" size={18} color="#fff" />
              <Text style={styles.imageActionText}>فتح خارجي</Text>
            </TouchableOpacity>
          </View>
        )}
            
        {/* النص/التعليق/المحتوى إذا كان موجوداً */}
        {contentText && (
          <View style={styles.descriptionContainer}>
            <Text style={[
              styles.descriptionText,
              { 
                color: darkMode ? '#ffffff' : '#333333',
                fontSize: fontSize
              }
            ]}>
              {displayText}
            </Text>
            
            {/* زر عرض المزيد/أقل */}
            {textIsLong && (
            <TouchableOpacity
                style={styles.expandButton}
                onPress={() => toggleExpanded(item.id)}
            >
                <Text style={[
                  styles.expandButtonText,
                  { fontSize: fontSize - 2 }
                ]}>
                  {isExpanded ? 'عرض أقل' : 'عرض المزيد'}
                </Text>
            </TouchableOpacity>
            )}
        </View>
        )}

        {/* معلومات إضافية في حالة عدم وجود وصف */}
        {!contentText && hasImages && (
          <View style={styles.noDescriptionContainer}>
            <Text style={[
              styles.noDescriptionText,
              { 
                color: darkMode ? '#ccc' : '#999',
                fontSize: fontSize - 2
              }
            ]}>
              {images.length === 1 ? 'صورة جديدة من مستجدات التطبيق' : `${images.length} صور جديدة من مستجدات التطبيق`}
            </Text>
      </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons 
        name="update" 
        size={80} 
        color={darkMode ? '#555' : '#ddd'} 
      />
      <Text style={[
        styles.emptyTitle, 
        { 
          color: darkMode ? '#ffffff' : '#333333',
          fontSize: fontSize + 2
        }
      ]}>
        لا توجد مستجدات حالياً
        </Text>
      <Text style={[
        styles.emptySubtitle, 
        { 
          color: darkMode ? '#888' : '#666',
          fontSize: fontSize - 2
        }
      ]}>
        ستظهر هنا آخر المستجدات والتحديثات الخاصة بالتطبيق
            </Text>
          </View>
  );

  if (loading) {
    return (
      <View style={[
        styles.container,
        styles.centerContent,
        { backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5' }
      ]}>
        <ActivityIndicator size="large" color="#197278" />
        <Text style={[
          styles.loadingText,
          { 
            color: darkMode ? '#ffffff' : '#333333',
            fontSize: fontSize
          }
        ]}>
          جاري تحميل المستجدات...
            </Text>
          </View>
    );
  }

  return (
    <View style={[
      styles.container,
      { backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5' }
    ]}>
      {/* Header */}
      <View style={[
        styles.header,
        { backgroundColor: darkMode ? '#2c2c2c' : '#ffffff' }
      ]}>
        <View style={styles.headerContent}>
          <MaterialIcons name="update" size={28} color="#197278" />
          <View style={styles.headerTextContainer}>
          <Text style={[
              styles.headerTitle,
              { 
                color: darkMode ? '#ffffff' : '#333333',
                fontSize: fontSize + 4
              }
          ]}>
              مستجدات التطبيق
          </Text>
          <Text style={[
              styles.headerSubtitle,
              { 
                color: darkMode ? '#ccc' : '#666',
                fontSize: fontSize - 2
              }
          ]}>
              آخر الأخبار والتحديثات
        </Text>
          </View>
        </View>
        </View>

      {/* Content */}
      <FlatList
        data={updates}
        renderItem={renderUpdateItem}
        keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            colors={['#197278']}
            tintColor="#197278"
          />
        }
        contentContainerStyle={[
          styles.listContainer,
          updates.length === 0 && styles.emptyListContainer
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
      />
      
      {/* عارض الصور */}
      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageViewer}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity 
            style={styles.imageViewerBackground}
            onPress={closeImageViewer}
            activeOpacity={1}
          >
            <View style={styles.imageViewerContent}>
              {/* زر الإغلاق */}
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={closeImageViewer}
              >
                <MaterialIcons name="close" size={30} color="#fff" />
              </TouchableOpacity>

              {/* الصورة */}
              {selectedImage && (
                <Image 
                  source={{ uri: selectedImage.uri }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              )}

              {/* التعليق والأزرار في منطقة سفلية */}
              {selectedImage && (
                <View style={styles.imageViewerBottomSection}>
                  {/* التعليق إذا كان موجود */}
                  {selectedImage.updateItem && selectedImage.updateItem.description && (
                    <View style={styles.imageViewerTextContainer}>
                      <Text style={styles.imageViewerText}>
                        {selectedImage.updateItem.description}
                      </Text>
                    </View>
                  )}

                  {/* أزرار العمل */}
                  <View style={styles.imageViewerActions}>
                    <TouchableOpacity 
                      style={[styles.imageViewerActionBtn, styles.shareBtn]}
                      onPress={() => {
                        shareImage(selectedImage.uri, selectedImage.updateItem);
                        closeImageViewer();
                      }}
                    >
                      <MaterialIcons name="share" size={20} color="#fff" />
                      <Text style={styles.imageViewerActionText}>مشاركة</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.imageViewerActionBtn, styles.externalBtn]}
                      onPress={() => {
                        openImageExternal(selectedImage.uri);
                        closeImageViewer();
                      }}
                    >
                      <MaterialIcons name="open-in-new" size={20} color="#fff" />
                      <Text style={styles.imageViewerActionText}>فتح خارجي</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  headerTitle: {
    fontWeight: 'bold',
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    textAlign: 'right',
  },
  listContainer: {
    padding: 15,
  },
  emptyListContainer: {
    flex: 1,
  },
  updateCard: {
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateText: {
    marginLeft: 8,
    textAlign: 'right',
  },
  imagesContainer: {
    marginBottom: 10,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f0f0f0',
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleImageContainer: {
    width: '100%',
    height: undefined,
    aspectRatio: 1,
    maxHeight: 400,
    minHeight: 200,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  singleImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 1,
    maxHeight: 400,
    minHeight: 200,
  },
  multipleImagesContainer: {
    width: '100%',
    height: 200, // Fixed height for multiple images container
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  multipleImageItem: {
    width: 100, // Fixed width for each image item
    height: '100%',
    marginHorizontal: 5,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  multipleImage: {
    width: '100%',
    height: '100%',
  },
  imageNumberBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  imageNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  imagesCountBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  imagesCountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  downloadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadContent: {
    alignItems: 'center',
  },
  downloadProgress: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  downloadText: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 5,
  },
  descriptionContainer: {
    marginTop: 5,
  },
  descriptionText: {
    lineHeight: 24,
    textAlign: 'right',
  },
  expandButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  expandButtonText: {
    color: '#197278',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  noDescriptionContainer: {
    marginTop: 5,
  },
  noDescriptionText: {
    fontStyle: 'italic',
    textAlign: 'right',
  },
  loadingText: {
    marginTop: 15,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    marginTop: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  imageActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 114, 120, 0.8)',
  },
  shareBtn: {
    backgroundColor: '#197278',
  },
  externalBtn: {
    backgroundColor: '#4CAF50',
  },
  imageActionText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
  },
  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  imageViewerBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContent: {
    width: '90%',
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 15,
    overflow: 'hidden',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5,
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  imageViewerBottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    alignItems: 'center',
  },
  imageViewerTextContainer: {
    marginBottom: 15,
    alignSelf: 'stretch',
  },
  imageViewerText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  imageViewerActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  imageViewerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#197278',
    minWidth: 120,
    justifyContent: 'center',
  },
  imageViewerActionText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
  },
  titleContainer: {
    marginBottom: 10,
  },
  titleText: {
    fontWeight: 'bold',
    textAlign: 'right',
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
  },
}); 