import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import AppSettingsContext from '../AppSettingsContext';
import DownloadShareButton from '../components/DownloadShareButton';
import { useData } from '../context/DataContext';
import smartCacheService from '../services/SmartCacheService';
import GlobalAudioBar from '../components/GlobalAudioBar';
import { useAudio } from '../AudioContext';
import usageTrackingService from '../services/usageTrackingService';
import eventEmitter from '../utils/EventEmitter';
import fileManager from '../utils/FileManager';
import { useFocusEffect } from '@react-navigation/native';

export default function RecentlyAddedScreen({ navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { loading: dataLoading, isOnline, error, getDataService } = useData();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  
  // متغيرات للوسائط
  const [downloadedFiles, setDownloadedFiles] = useState({});
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [audioStatus, setAudioStatus] = useState({});
  // دعم التحميل المتعدد
  const [downloadingItems, setDownloadingItems] = useState(new Set());
  const [downloadProgressMap, setDownloadProgressMap] = useState({});
  // تحسين الأداء
  const [lastFileCheck, setLastFileCheck] = useState(0);
  // إضافة مؤشر للفحص لمنع التداخل
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);

  // استخدام AudioContext - يجب أن يكون في أعلى المكون
  const { playSound, togglePlayback, currentUri, isPlaying: globalAudioPlaying } = useAudio();

  // متغيرات للتنقل بين الملفات الصوتية
  const audioFiles = items.filter(item => item.contentType === 'audio');
  const currentAudioIndex = currentUri ? 
    audioFiles.findIndex(item => {
      const downloadedFile = downloadedFiles[item.id];
      return downloadedFile && downloadedFile.uri === currentUri;
    }) : -1;

  // دالة الانتقال للملف التالي
  const handleNextAudio = async () => {
    const nextIndex = currentAudioIndex + 1;
    if (nextIndex < audioFiles.length) {
      const nextItem = audioFiles[nextIndex];
      const downloadedFile = downloadedFiles[nextItem.id];
      
      if (downloadedFile) {
        // الملف محمل - تشغيل فوري
        console.log(`🎵 Playing next audio: ${nextItem.bookName} (${nextIndex + 1}/${audioFiles.length})`);
        playSound(downloadedFile.uri, {
          name: nextItem.bookName,
          id: nextItem.id,
          type: nextItem.contentType
        });
      } else {
        // الملف غير محمل - بدء التحميل فقط
        console.log(`📥 Next audio not downloaded, starting download: ${nextItem.bookName}`);
        downloadMediaFile(nextItem);
        // التحميل يعمل في الخلفية - لا تشغيل تلقائي
      }
    }
  };

  // دالة الانتقال للملف السابق
  const handlePreviousAudio = async () => {
    const prevIndex = currentAudioIndex - 1;
    if (prevIndex >= 0) {
      const prevItem = audioFiles[prevIndex];
      const downloadedFile = downloadedFiles[prevItem.id];
      
      if (downloadedFile) {
        // الملف محمل - تشغيل فوري
        console.log(`🎵 Playing previous audio: ${prevItem.bookName} (${prevIndex + 1}/${audioFiles.length})`);
        playSound(downloadedFile.uri, {
          name: prevItem.bookName,
          id: prevItem.id,
          type: prevItem.contentType
        });
      } else {
        // الملف غير محمل - بدء التحميل فقط
        console.log(`📥 Previous audio not downloaded, starting download: ${prevItem.bookName}`);
        downloadMediaFile(prevItem);
        // التحميل يعمل في الخلفية - لا تشغيل تلقائي
      }
    }
  };

  // تحميل المحتوى المضاف مؤخراً مع التمرير اللانهائي
  const loadRecentContent = useCallback(async (page = 0, isRefresh = false) => {
    try {
      if (!smartCacheService.isInitialized) {
        console.log('⚠️ SmartCacheService not initialized yet');
        return { items: [], hasMore: false };
      }
      
      console.log(`📚 Loading recent content (page ${page})...`);
      
      if (isRefresh) {
        setRefreshing(true);
      } else if (page > 0) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      // استخدام SmartCacheService للتحميل الذكي
      const result = await smartCacheService.loadRecentContent(page);
      
      console.log(`📚 Loaded ${result.items.length} items (page ${page}), fromCache: ${result.fromCache}`);
      
      setFromCache(result.fromCache);
      
      return {
        items: result.items,
        hasMore: result.hasMore
      };
      
    } catch (error) {
      console.error(`❌ Error loading recent content (page ${page}):`, error);
      return { items: [], hasMore: false };
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  // تحميل المحتوى الأولي
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialContent = async () => {
      try {
        const result = await loadRecentContent(0);
        
        if (isMounted) {
          // منع تكرار المحتوى في التحميل الأولي
          const uniqueItems = result.items ? result.items.filter((item, index, self) => 
            index === self.findIndex(t => t.id === item.id)
          ) : [];
          
          setItems(uniqueItems);
          setHasMore(result.hasMore);
          setCurrentPage(0);
          
          // تحقق من الملفات المحملة مسبقاً
          await quickCheckDownloadedFiles(uniqueItems);
          
          // لا نضيف للتحميل التلقائي هنا - يجب أن يكون من الإعدادات فقط
          console.log(`✅ Initial recent books loaded: ${uniqueItems.length} unique items`);
        }
      } catch (error) {
        console.error('❌ Error loading initial recent items:', error);
        if (isMounted) {
          setItems([]);
          setHasMore(false);
        }
      }
    };

    loadInitialContent();
    
    return () => {
      isMounted = false;
    };
  }, [loadRecentContent]);

  // دالة التحديث
  const handleRefresh = useCallback(async () => {
    try {
      const result = await loadRecentContent(0, true);
      
      // منع تكرار المحتوى في التحديث
      const uniqueItems = result.items ? result.items.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      ) : [];
      
      setItems(uniqueItems);
      setHasMore(result.hasMore);
      setCurrentPage(0);
      
      // تحديث الملفات المحملة
      await quickCheckDownloadedFiles(uniqueItems);
      
    } catch (error) {
      console.error('❌ Error refreshing content:', error);
    }
  }, [loadRecentContent]);

  // دالة تحميل المزيد
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    try {
      const nextPage = currentPage + 1;
      const result = await loadRecentContent(nextPage);
      
      if (result.items.length > 0) {
        setItems(prevItems => [...prevItems, ...result.items]);
        setCurrentPage(nextPage);
        setHasMore(result.hasMore);
        
        // تحقق من الملفات المحملة للعناصر الجديدة
        await quickCheckDownloadedFiles(result.items);
        
        // إضافة للتحميل التلقائي
        for (const book of result.items) {
          // await autoDownloadService.addToQueue(book); // �� ����� ������� ��������
        }
      } else {
        setHasMore(false);
      }
      
    } catch (error) {
      console.error('❌ Error loading more content:', error);
      setHasMore(false);
    }
  }, [currentPage, hasMore, loadingMore, loadRecentContent]);

  // إضافة listener للتحديث عند العودة للصفحة أو التحديث
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // إزالة المزامنة التلقائية - تحديث الملفات المحملة فقط عند الحاجة
      console.log('📚 Recently added screen focused - no automatic sync needed');
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const handleForceRefresh = () => {
      if (!isCheckingFiles && items.length > 0) {
        setTimeout(() => {
          forceCheckDownloadedFiles(items);
        }, 500);
      }
    };
    const handleClearContent = () => {
      setDownloadedFiles({});
      setDownloadingItems(new Set());
      setDownloadProgressMap({});
      setLastFileCheck(0);
      setTimeout(async () => {
        try {
          setLoading(true);
          const result = await loadRecentContent(0, true);
          setItems(result.items);
          setHasMore(result.hasMore);
          setLoading(false);
        } catch (error) {
          setLoading(false);
        }
      }, 1000);
    };
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('clearContent', handleClearContent);
    return () => {
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('clearContent', handleClearContent);
    };
  }, [items, isCheckingFiles, quickCheckDownloadedFiles, forceCheckDownloadedFiles, loadRecentContent]);

  // EventEmitter listeners للحذف والتحديث - أقوى من navigation params
  useEffect(() => {
    const handleClearContent = (data) => {
      console.log('🧹 Clear content signal received via EventEmitter:', data);
      
      // مسح فوري وكامل لجميع الحالات
      setDownloadedFiles({});
      setDownloadingItems(new Set());
      setDownloadProgressMap({});
      setLastFileCheck(0);
      
      // إعادة تحميل البيانات
      setTimeout(async () => {
        try {
          setLoading(true);
          console.log('🔄 Reloading data after clear content...');
          
          const result = await loadRecentContent(0, true);
          setItems(result.items);
          setHasMore(result.hasMore);
          setLoading(false);
          
          console.log('✅ Data reloaded successfully after clear');
        } catch (error) {
          console.error('❌ Error reloading data after clear:', error);
          setLoading(false);
        }
      }, 1000);
    };

    const handleForceRefresh = (data) => {
      console.log('🔄 Force refresh signal received via EventEmitter:', data);
      
      // تجنب الفحص إذا كان هناك فحص جاري
      if (!isCheckingFiles && items.length > 0) {
        // تأخير بسيط لضمان عدم التداخل مع عمليات أخرى
        setTimeout(() => {
          forceCheckDownloadedFiles(items);
        }, 500);
      }
    };

    // استقبال إشارات التحميل التلقائي
    const handleAutoDownloadStarted = (data) => {
      if (data.isAutoDownload) {
        console.log('🤖 Auto-download started:', data.name);
        // إضافة للحالة كما لو كان تحميل يدوي
        setDownloadingItems(prev => new Set([...prev, data.id]));
        setDownloadProgressMap(prev => ({ ...prev, [data.id]: 0 }));
      }
    };

    const handleAutoDownloadProgress = (data) => {
      if (data.isAutoDownload) {
        console.log(`🤖 Auto-download progress: ${data.progress}% for ${data.id}`);
        // تحديث التقدم كما لو كان تحميل يدوي
        setDownloadProgressMap(prev => ({ ...prev, [data.id]: data.progress }));
      }
    };

    const handleAutoDownloadCompleted = (data) => {
      if (data.isAutoDownload) {
        console.log('🤖 Auto-download completed:', data.name);
        // إزالة من حالة التحميل وإضافة للملفات المحملة
        setDownloadingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.id);
          return newSet;
        });
        setDownloadProgressMap(prev => {
          const newMap = { ...prev };
          delete newMap[data.id];
          return newMap;
        });
        
        // إضافة للملفات المحملة
        setDownloadedFiles(prev => ({
          ...prev,
          [data.id]: {
            uri: data.uri,
            name: data.name,
            type: data.type
          }
        }));
      }
    };

    const handleAutoDownloadFailed = (data) => {
      if (data.isAutoDownload) {
        console.log('🤖 Auto-download failed:', data.name, data.error);
        // إزالة من حالة التحميل
        setDownloadingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.id);
          return newSet;
        });
        setDownloadProgressMap(prev => {
          const newMap = { ...prev };
          delete newMap[data.id];
          return newMap;
        });
      }
    };

    // إضافة listeners
    eventEmitter.on('clearContent', handleClearContent);
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('downloadStarted', handleAutoDownloadStarted);
    eventEmitter.on('downloadProgress', handleAutoDownloadProgress);
    eventEmitter.on('downloadCompleted', handleAutoDownloadCompleted);
    eventEmitter.on('downloadFailed', handleAutoDownloadFailed);

    // تنظيف listeners عند unmount
    return () => {
      eventEmitter.off('clearContent', handleClearContent);
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('downloadStarted', handleAutoDownloadStarted);
      eventEmitter.off('downloadProgress', handleAutoDownloadProgress);
      eventEmitter.off('downloadCompleted', handleAutoDownloadCompleted);
      eventEmitter.off('downloadFailed', handleAutoDownloadFailed);
    };
  }, [items, loadRecentContent, isCheckingFiles]);

  // فحص سريع ومحسن للملفات المحملة - نسخة مبسطة للأداء
  const quickCheckDownloadedFiles = useCallback(async (contentList) => {
    // منع تشغيل عدة فحوصات في نفس الوقت
    if (isCheckingFiles) {
      console.log('🔄 File check already in progress, skipping...');
      return;
    }
    
    try {
      setIsCheckingFiles(true);
      
      // منع التحديث المتكرر (debouncing)
      const now = Date.now();
      if (now - lastFileCheck < 3000) { // زيادة debouncing إلى 3 ثوان
        console.log('🔄 Skipping file check due to debouncing');
        return;
      }
      setLastFileCheck(now);

      console.log('🔍 Starting simple file check...');
      
      // فحص بسيط للملفات المحملة
      const downloadedFiles = {};
      
      for (const item of contentList) {
        try {
          const fileName = sanitizeFileName(item.bookName || item.id);
          const fileUri = FileSystem.documentDirectory + fileName;
          
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            downloadedFiles[item.id] = {
              uri: fileUri,
              size: fileInfo.size,
              exists: true
            };
          }
        } catch (error) {
          console.log(`⚠️ Error checking file for ${item.bookName}:`, error.message);
        }
      }
      
      setDownloadedFiles(downloadedFiles);
      console.log(`✅ Simple file check completed: ${Object.keys(downloadedFiles).length} files found`);
    } catch (error) {
      console.error('❌ Error in simple file check:', error);
    } finally {
      setIsCheckingFiles(false);
    }
  }, [lastFileCheck, isCheckingFiles]);

  // فحص مخصص للتحديث بعد الحذف - نسخة مبسطة
  const forceCheckDownloadedFiles = useCallback(async (contentList) => {
    try {
      console.log('🔍 Force checking files after deletion...');
      
      // فحص بسيط للملفات المحملة
      const downloadedFiles = {};
      
      for (const item of contentList) {
        try {
          const fileName = sanitizeFileName(item.bookName || item.id);
          const fileUri = FileSystem.documentDirectory + fileName;
          
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            downloadedFiles[item.id] = {
              uri: fileUri,
              size: fileInfo.size,
              exists: true
            };
          }
        } catch (error) {
          console.log(`⚠️ Error force checking file for ${item.bookName}:`, error.message);
        }
      }
      
      setDownloadedFiles(downloadedFiles);
      console.log(`✅ Force check completed: ${Object.keys(downloadedFiles).length} files found`);
    } catch (error) {
      console.error('❌ Error in force file check:', error);
    }
  }, []);

  // تحميل ملف وسائط (فيديو/صوت)
  const downloadMediaFile = async (item) => {
    // التحقق من عدم وجود تحميل جاري لنفس الملف
    if (downloadingItems.has(item.id)) {
      console.log('⚠️ Media already downloading:', item.id);
      return;
    }

    // التحقق من صحة الرابط قبل التحميل
    if (!item.bookUrl || !item.bookUrl.startsWith('http')) {
      console.log('❌ Invalid or missing URL for media:', item.bookName, 'URL:', item.bookUrl);
      Alert.alert('خطأ', `لا يوجد رابط صالح لتحميل "${item.bookName}". يرجى التواصل مع المطور لإضافة الرابط.`);
      return;
    }

    try {
      // إضافة للقائمة قيد التحميل
      setDownloadingItems(prev => new Set([...prev, item.id]));
      setDownloadProgressMap(prev => ({ ...prev, [item.id]: 0 }));
      
      const fileName = sanitizeFileName(item.bookName || item.id);
      const fileUri = FileSystem.documentDirectory + fileName;
      
      console.log('📥 Starting media download:', item.bookName, 'from URL:', item.bookUrl);
      
      // محاولة الحصول على حجم الملف من الخادم أولاً
      let expectedSize = 0;
      try {
        const headResponse = await fetch(item.bookUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            expectedSize = parseInt(contentLength, 10);
            console.log(`📊 Expected file size: ${formatFileSize(expectedSize)}`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not get file size from server:', error);
      }
      
      // إنشاء تحميل قابل للإستكمال
      const downloadResumable = FileSystem.createDownloadResumable(
        item.bookUrl,
        fileUri,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible: HudaLibrary/1.0)'
          }
        },
        (downloadProgressEvent) => {
          const progress = downloadProgressEvent.totalBytesWritten / downloadProgressEvent.totalBytesExpectedToWrite;
          setDownloadProgressMap(prev => ({ ...prev, [item.id]: Math.round(progress * 100) }));
          
          // إظهار معلومات التحميل المفصلة
          const downloadedMB = (downloadProgressEvent.totalBytesWritten / (1024 * 1024)).toFixed(2);
          const totalMB = (downloadProgressEvent.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(2);
          console.log(`📊 Media download progress: ${(progress * 100).toFixed(1)}% (${downloadedMB}MB / ${totalMB}MB)`);
        }
      );
      
      // تحميل مع timeout (5 دقائق للملفات الصغيرة، 15 دقيقة للملفات الكبيرة)
      const timeoutDuration = item.contentType === 'video' ? 900000 : 300000; // 15 دقيقة للفيديو، 5 دقائق للباقي
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Download timeout - الرابط لا يستجيب بعد ${Math.round(timeoutDuration / 60000)} دقيقة`)), timeoutDuration);
      });
      
      // تحميل مع محاولات الاستئناف
      let result;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          result = await Promise.race([
            downloadResumable.downloadAsync(),
            timeoutPromise
          ]);
          break; // نجح التحميل
        } catch (error) {
          retryCount++;
          console.log(`🔄 Download attempt ${retryCount}/${maxRetries} failed for ${item.bookName}:`, error.message);
          
          if (retryCount >= maxRetries) {
            throw error; // فشلت جميع المحاولات
          }
          
          // انتظار قبل المحاولة التالية
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          
          // محاولة استئناف التحميل
          try {
            result = await downloadResumable.downloadAsync();
            console.log(`✅ Resume successful for ${item.bookName}`);
            break;
          } catch (resumeError) {
            console.log(`🔄 Resume attempt ${retryCount} failed for ${item.bookName}:`, resumeError.message);
            // استمر في الحلقة للمحاولة التالية
          }
        }
      }
      
      if (result?.uri) {
        // التحقق من أن الملف مكتمل (إذا كان الحجم المتوقع معروف)
        const finalFileInfo = await FileSystem.getInfoAsync(result.uri);
        if (expectedSize > 0 && finalFileInfo.size < expectedSize * 0.9) {
          throw new Error(`Downloaded file is incomplete. Expected: ${formatFileSize(expectedSize)}, Got: ${formatFileSize(finalFileInfo.size)}`);
        }
        
        const downloadedInfo = {
          uri: result.uri,
          name: item.bookName,
          type: item.contentType
        };
        
        // تحديث الحالة فوراً
        setDownloadedFiles(prev => ({
          ...prev,
          [item.id]: downloadedInfo
        }));
        
        // حفظ في AsyncStorage
        AsyncStorage.setItem(`downloaded_${fileName}`, JSON.stringify(downloadedInfo));
        console.log(`✅ Download completed: ${item.bookName} (${formatFileSize(finalFileInfo.size)})`);
      }
    } catch (error) {
      console.error('❌ Download failed:', error);
      Alert.alert('خطأ', `فشل في تحميل ${item.bookName}: ${error.message}`);
    } finally {
      // تنظيف حالة التحميل
      setDownloadingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
      setDownloadProgressMap(prev => {
        const newMap = { ...prev };
        delete newMap[item.id];
        return newMap;
      });
    }
  };

  // تحميل ملف كتاب
  const downloadBookFile = async (item) => {
    // التحقق من عدم وجود تحميل جاري لنفس الملف
    if (downloadingItems.has(item.id)) {
      console.log('⚠️ Book already downloading:', item.id);
      return;
    }

    // التحقق من صحة الرابط قبل التحميل
    if (!item.bookUrl || !item.bookUrl.startsWith('http')) {
      console.log('❌ Invalid or missing URL for book:', item.bookName, 'URL:', item.bookUrl);
      Alert.alert('خطأ', `لا يوجد رابط صالح لتحميل الكتاب "${item.bookName}". يرجى التواصل مع المطور لإضافة الرابط.`);
      return;
    }

    try {
      // إضافة للقائمة قيد التحميل
      setDownloadingItems(prev => new Set([...prev, item.id]));
      setDownloadProgressMap(prev => ({ ...prev, [item.id]: 0 }));
      
      const fileName = sanitizeFileName(item.bookName || item.id) + '.pdf';
      const fileUri = FileSystem.documentDirectory + fileName;
      
      console.log('📥 Starting book download:', item.bookName, 'from URL:', item.bookUrl);
      
      // محاولة الحصول على حجم الملف من الخادم أولاً
      let expectedSize = 0;
      try {
        const headResponse = await fetch(item.bookUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            expectedSize = parseInt(contentLength, 10);
            console.log(`📊 Expected file size: ${formatFileSize(expectedSize)}`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not get file size from server:', error);
      }
      
      // إنشاء تحميل قابل للإستكمال
      const downloadResumable = FileSystem.createDownloadResumable(
        item.bookUrl,
        fileUri,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible: HudaLibrary/1.0)',
            'Accept': 'application/pdf,*/*'
          }
        },
        (downloadProgressEvent) => {
          const progress = downloadProgressEvent.totalBytesWritten / downloadProgressEvent.totalBytesExpectedToWrite;
          setDownloadProgressMap(prev => ({ ...prev, [item.id]: Math.round(progress * 100) }));
          
          // إظهار معلومات التحميل المفصلة
          const downloadedMB = (downloadProgressEvent.totalBytesWritten / (1024 * 1024)).toFixed(2);
          const totalMB = (downloadProgressEvent.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(2);
          console.log(`📊 Book download progress: ${(progress * 100).toFixed(1)}% (${downloadedMB}MB / ${totalMB}MB)`);
        }
      );
      
      // تحميل مع timeout (10 دقائق للكتب، 15 دقيقة للفيديو)
      const timeoutDuration = item.contentType === 'video' ? 900000 : 600000; // 15 دقيقة للفيديو، 10 دقائق للكتب
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Download timeout - الرابط لا يستجيب بعد ${Math.round(timeoutDuration / 60000)} دقيقة`)), timeoutDuration);
      });
      
      // تحميل مع محاولات الاستئناف
      let result;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          result = await Promise.race([
            downloadResumable.downloadAsync(),
            timeoutPromise
          ]);
          break; // نجح التحميل
        } catch (error) {
          retryCount++;
          console.log(`🔄 Download attempt ${retryCount}/${maxRetries} failed for ${item.bookName}:`, error.message);
          
          if (retryCount >= maxRetries) {
            throw error; // فشلت جميع المحاولات
          }
          
          // انتظار قبل المحاولة التالية
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          
          // محاولة استئناف التحميل
          try {
            result = await downloadResumable.downloadAsync();
            console.log(`✅ Resume successful for ${item.bookName}`);
            break;
          } catch (resumeError) {
            console.log(`🔄 Resume attempt ${retryCount} failed for ${item.bookName}:`, resumeError.message);
            // استمر في الحلقة للمحاولة التالية
          }
        }
      }
      
      if (result?.uri) {
        // التحقق من أن الملف مكتمل (إذا كان الحجم المتوقع معروف)
        const finalFileInfo = await FileSystem.getInfoAsync(result.uri);
        if (expectedSize > 0 && finalFileInfo.size < expectedSize * 0.9) {
          throw new Error(`Downloaded file is incomplete. Expected: ${formatFileSize(expectedSize)}, Got: ${formatFileSize(finalFileInfo.size)}`);
        }
        
        const downloadedInfo = {
          uri: result.uri,
          name: item.bookName,
          type: item.contentType
        };
        
        // تحديث الحالة فوراً
        setDownloadedFiles(prev => ({
          ...prev,
          [item.id]: downloadedInfo
        }));
        
        // حفظ في AsyncStorage
        AsyncStorage.setItem(`downloaded_${fileName}`, JSON.stringify(downloadedInfo));
        console.log(`✅ Download completed: ${item.bookName} (${formatFileSize(finalFileInfo.size)})`);
      }
    } catch (error) {
      console.error('❌ Download failed:', error);
      Alert.alert('خطأ', `فشل في تحميل ${item.bookName}: ${error.message}`);
    } finally {
      // تنظيف حالة التحميل
      setDownloadingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
      setDownloadProgressMap(prev => {
        const newMap = { ...prev };
        delete newMap[item.id];
        return newMap;
      });
    }
  };

  // تشغيل الصوت المدمج
  const playAudio = async (item) => {
    try {
      const downloadedFile = downloadedFiles[item.id];
      if (!downloadedFile) {
        console.log('❌ No downloaded file found for audio:', item.id);
        // بدء التحميل إذا لم يكن موجوداً
        downloadMediaFile(item);
        return;
      }

      console.log('🎵 Playing audio file:', downloadedFile.uri);

      // التحقق من وجود الملف
      const fileInfo = await FileSystem.getInfoAsync(downloadedFile.uri);
      if (!fileInfo.exists) {
        console.log('❌ Audio file does not exist:', downloadedFile.uri);
        // الملف محذوف - إزالة من الحالة وبدء التحميل
        setDownloadedFiles(prev => {
          const newFiles = { ...prev };
          delete newFiles[item.id];
          return newFiles;
        });
        Alert.alert('الملف محذوف', 'الملف الصوتي غير موجود. سيتم إعادة تحميله.', [
          { text: 'موافق', onPress: () => downloadMediaFile(item) }
        ]);
        return;
      }

      // استخدام AudioContext المحسن للتشغيل في الخلفية
      playSound(downloadedFile.uri, {
        name: item.bookName,
        id: item.id,
        type: item.contentType
      });

      console.log('✅ Audio started playing via AudioContext');
      
    } catch (error) {
      console.error('❌ Audio play error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تشغيل الصوت: ' + error.message);
    }
  };

  // إيقاف/استكمال الصوت
  const toggleAudio = async (item) => {
    try {
      const downloadedFile = downloadedFiles[item.id];
      
      if (downloadedFile && currentUri === downloadedFile.uri) {
        await togglePlayback();
        } else {
        // تشغيل ملف جديد
        await playAudio(item);
      }
    } catch (error) {
      console.error('Audio toggle error:', error);
    }
  };

  // تشغيل الفيديو
  const playVideo = (item) => {
    const downloadedFile = downloadedFiles[item.id];
    if (!downloadedFile) {
      downloadMediaFile(item);
      return;
    }

    // التحقق من وجود الملف قبل التشغيل
    FileSystem.getInfoAsync(downloadedFile.uri).then(fileInfo => {
      if (!fileInfo.exists) {
        console.log('❌ Video file does not exist:', downloadedFile.uri);
        // الملف محذوف - إزالة من الحالة وبدء التحميل
        setDownloadedFiles(prev => {
          const newFiles = { ...prev };
          delete newFiles[item.id];
          return newFiles;
        });
        Alert.alert('الملف محذوف', 'ملف الفيديو غير موجود. سيتم إعادة تحميله.', [
          { text: 'موافق', onPress: () => downloadMediaFile(item) }
        ]);
        return;
      }

    const serializableContent = {
      ...item,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
      contentUrl: downloadedFile.uri
    };
    navigation.navigate('VideoPlayer', { content: serializableContent });
    }).catch(error => {
      console.error('❌ Error checking video file:', error);
      downloadMediaFile(item);
    });
  };

  // مشاركة الملف المحمل
  const shareDownloadedFile = async (item) => {
    try {
      const downloadedFile = downloadedFiles[item.id];
      if (downloadedFile) {
        // التحقق من وجود الملف قبل المشاركة
        const fileInfo = await FileSystem.getInfoAsync(downloadedFile.uri);
        if (!fileInfo.exists) {
          console.log('❌ File does not exist for sharing:', downloadedFile.uri);
          // الملف محذوف - إزالة من الحالة وإشعار المستخدم
          setDownloadedFiles(prev => {
            const newFiles = { ...prev };
            delete newFiles[item.id];
            return newFiles;
          });
          Alert.alert('الملف محذوف', 'الملف غير موجود للمشاركة. سيتم إعادة تحميله.', [
            { text: 'موافق', onPress: () => {
              if (item.contentType === 'video' || item.contentType === 'audio') {
                downloadMediaFile(item);
              } else {
                downloadBookFile(item);
              }
            }}
          ]);
          return;
        }
        
        await Sharing.shareAsync(downloadedFile.uri);
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء مشاركة الملف.');
    }
  };

  // التعامل مع الضغط على المحتوى - محدث للـ Offline-First
  const handleContentPress = async (content) => {
    // التحقق من أن المحتوى محمل فعلاً قبل الفتح
    const isDownloaded = downloadedFiles[content.id];
    const isDownloading = downloadingItems.has(content.id);
    
    if (isDownloading) {
      Alert.alert(
        'تحميل قيد التقدم',
        'يرجى الانتظار حتى يكتمل التحميل قبل فتح المحتوى.',
        [{ text: 'موافق', style: 'default' }]
      );
      return;
    }
    
    if (!isDownloaded) {
      Alert.alert(
        'المحتوى غير محمل',
        'يرجى تحميل المحتوى أولاً قبل فتحه.',
        [
          { 
            text: 'تحميل الآن', 
            onPress: () => {
              if (content.contentType === 'video' || content.contentType === 'audio') {
                downloadMediaFile(content);
              } else {
                downloadBookFile(content);
              }
            }
          },
          { text: 'إلغاء', style: 'cancel' }
        ]
      );
      return;
    }
    
    // التحقق من وجود الملف الفعلي
    try {
      const fileInfo = await FileSystem.getInfoAsync(isDownloaded.uri);
      if (!fileInfo.exists || fileInfo.size < 1024) {
        console.log(`❌ File no longer exists or is corrupted: ${isDownloaded.uri}`);
        // إزالة من الحالة فوراً
        setDownloadedFiles(prev => {
          const newFiles = { ...prev };
          delete newFiles[content.id];
          return newFiles;
        });
        
        Alert.alert(
          'الملف مفقود',
          'الملف المحمل مفقود أو تالف. يرجى إعادة التحميل.',
          [
            { 
              text: 'إعادة التحميل', 
              onPress: () => {
                if (content.contentType === 'video' || content.contentType === 'audio') {
                  downloadMediaFile(content);
                } else {
                  downloadBookFile(content);
                }
              }
            },
            { text: 'إلغاء', style: 'cancel' }
          ]
        );
        return;
      }
    } catch (error) {
      console.error('❌ Error checking file:', error);
      Alert.alert(
        'خطأ في التحقق من الملف',
        'تعذر التحقق من وجود الملف المحمل.',
        [{ text: 'موافق', style: 'default' }]
      );
      return;
    }

    try {
      // تتبع مشاهدة المحتوى
      await usageTrackingService.trackContentView(content);
      console.log('📊 Content view tracked:', content.bookName);
    } catch (error) {
      console.error('❌ Error tracking content view:', error);
    }

    try {
      // فتح المحتوى مباشرة بنفس منطق الصفحة الرئيسية
      if (content.contentType === 'video') {
        const serializableContent = {
          ...content,
          createdAt: content.createdAt ? content.createdAt.toISOString() : null,
          updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null,
          contentUrl: isDownloaded.uri, // استخدام الملف المحلي
          isOfflineContent: true
        };
        navigation.navigate('VideoPlayer', { content: serializableContent });
        
      } else if (content.contentType === 'audio') {
        // تشغيل الصوت المحلي
        await playSound(isDownloaded.uri, {
          name: content.bookName,
          id: content.id,
          type: content.contentType
        });
        console.log('✅ Playing local audio');
        
      } else {
        // فتح الكتاب المحلي
        const serializableBook = {
          ...content,
          createdAt: content.createdAt ? content.createdAt.toISOString() : null,
          updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null,
          internet_url: content.bookUrl,
          bookUrl: isDownloaded.uri, // استخدام الملف المحلي
          isOfflineContent: true
        };
        navigation.navigate('BookReader', { book: serializableBook });
      }
      
    } catch (error) {
      console.error('❌ Error in handleContentPress:', error);
      
      // في حالة الخطأ، عرض رسالة بسيطة
      const contentTypeArabic = content.contentType === 'video' ? 'الفيديو' : 
                               content.contentType === 'audio' ? 'الملف الصوتي' : 'الكتاب';
      
      Alert.alert(
        'خطأ في الفتح', 
        `تعذر فتح ${contentTypeArabic} "${content.bookName}".\n\nيرجى المحاولة مرة أخرى.`,
        [{ text: 'موافق', style: 'default' }]
      );
    }
  };

  // تحميل المحتوى للاستخدام بدون إنترنت
  const downloadContentForOfflineUse = async (content) => {
    try {
      const dataService = getDataService();
      
      console.log(`📥 Starting offline download for: ${content.bookName}`);
      
      // إظهار مؤشر التحميل
      setDownloadingItems(prev => new Set([...prev, content.id]));
      setDownloadProgressMap(prev => ({ ...prev, [content.id]: 0 }));
      
      // محاولة الحصول على حجم الملف من الخادم أولاً
      let expectedSize = 0;
      try {
        const headResponse = await fetch(content.bookUrl, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength) {
            expectedSize = parseInt(contentLength, 10);
            console.log(`📊 Expected file size: ${formatFileSize(expectedSize)}`);
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not get file size from server:', error);
      }
      
      const result = await dataService.downloadContentForOffline(
        content.id,
        (progress) => {
          // تحديث مؤشر التقدم
          setDownloadProgressMap(prev => ({ ...prev, [content.id]: Math.round(progress * 100) }));
          
          // إظهار معلومات التحميل المفصلة
          if (expectedSize > 0) {
            const downloadedBytes = expectedSize * progress;
            const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
            const totalMB = (expectedSize / (1024 * 1024)).toFixed(2);
            console.log(`📊 Offline download progress: ${(progress * 100).toFixed(1)}% (${downloadedMB}MB / ${totalMB}MB)`);
          }
        }
      );
      
      if (result.success) {
        Alert.alert(
          'تم التحميل بنجاح! 🎉',
          result.message + '\n\nيمكنك الآن الوصول لهذا المحتوى بدون إنترنت.',
          [
            { 
              text: 'فتح الآن', 
              style: 'default',
              onPress: () => handleContentPress(content) // إعادة المحاولة مع المحتوى المحلي
            },
            { text: 'موافق', style: 'cancel' }
          ]
        );
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      console.error('❌ Offline download failed:', error);
      Alert.alert('فشل التحميل', `لم يتم تحميل المحتوى: ${error.message}`);
    } finally {
      // إزالة مؤشر التحميل
      setDownloadingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(content.id);
        return newSet;
      });
      setDownloadProgressMap(prev => {
        const newMap = { ...prev };
        delete newMap[content.id];
        return newMap;
      });
    }
  };

  // فتح المحتوى مباشرة (أونلاين)
  const openContentOnline = async (content) => {
    try {
      if (content.contentType === 'video') {
        const serializableContent = {
          ...content,
          createdAt: content.createdAt ? content.createdAt.toISOString() : null,
          updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null,
          contentUrl: content.bookUrl,
          isOfflineContent: false
        };
        navigation.navigate('VideoPlayer', { content: serializableContent });
        
      } else if (content.contentType === 'audio') {
        // تشغيل الصوت مباشرة من الإنترنت (إذا كان مدعوماً)
        try {
          await playSound(content.bookUrl, {
            name: content.bookName,
            id: content.id,
            type: content.contentType
          });
          console.log('✅ Playing online audio');
        } catch (error) {
          Alert.alert('خطأ', 'لا يمكن تشغيل الصوت مباشرة من الإنترنت. يرجى تحميله أولاً.');
        }
        
      } else {
        // فتح الكتاب مباشرة من الإنترنت
        const serializableBook = {
          ...content,
          createdAt: content.createdAt ? content.createdAt.toISOString() : null,
          updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null,
          internet_url: content.bookUrl,
          bookUrl: content.bookUrl,
          isOfflineContent: false
        };
        navigation.navigate('BookReader', { book: serializableBook });
      }
      
    } catch (error) {
      console.error('❌ Error opening content online:', error);
      Alert.alert('خطأ', 'فشل في فتح المحتوى من الإنترنت');
    }
  };

  function sanitizeFileName(name) {
    return (name || 'file').replace(/[^\w\d\-_\.]/g, '_');
  }

  // تنسيق حجم الملف
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // تنسيق الوقت للصوت
  const formatTime = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // تحميل المزيد من المحتوى
  const loadMoreContent = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const nextPage = currentPage + 1;
      console.log(`📚 Loading more recent books (page: ${nextPage})...`);
      
      const result = await loadRecentContent(nextPage);
      
      if (result && result.items && result.items.length > 0) {
        // منع تكرار المحتوى - فحص التكرار قبل الإضافة
        const newItems = result.items.filter(newItem => 
          !items.some(existingItem => existingItem.id === newItem.id)
        );
        
        if (newItems.length > 0) {
          setItems(prevItems => [...prevItems, ...newItems]);
          setCurrentPage(nextPage);
          setHasMore(result.hasMore);
          
          // تحقق من الملفات المحملة للعناصر الجديدة
          await quickCheckDownloadedFiles([...items, ...newItems]);
          
          // إضافة المحتوى الجديد للتحميل التلقائي
          for (const book of newItems) {
            // await autoDownloadService.addToQueue(book); // �� ����� ������� ��������
          }
          
          console.log(`✅ More recent books loaded: ${newItems.length} new items (filtered from ${result.items.length})`);
        } else {
          console.log('📚 All items already exist, no duplicates added');
          // إذا كانت جميع العناصر مكررة، تحقق من الصفحة التالية
          if (result.hasMore) {
            // محاولة الصفحة التالية
            setTimeout(() => loadMoreContent(), 100);
          } else {
            setHasMore(false);
          }
        }
      } else {
        setHasMore(false);
        console.log('📚 No more recent books to load');
      }
    } catch (error) {
      console.error('❌ Error loading more recent items:', error);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, currentPage, loadRecentContent, items]);

  // إعادة تحديث المحتوى
  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setCurrentPage(0);
      setHasMore(true);
      console.log('🔄 Refreshing recent books...');
      
      const result = await loadRecentContent(0, true);
      
      // منع تكرار المحتوى في التحديث
      const uniqueItems = result.items ? result.items.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      ) : [];
      
      setItems(uniqueItems);
      setHasMore(result.hasMore);
      
      // تحديث حالة الملفات المحملة - استخدام forceCheck للتأكد
      await forceCheckDownloadedFiles(uniqueItems);
      
      // لا نضيف للتحميل التلقائي هنا - يجب أن يكون من الإعدادات فقط
      console.log(`✅ Recent books refreshed: ${uniqueItems.length} unique items`);
    } catch (error) {
      console.error('❌ Error refreshing recent items:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadRecentContent]);

  const renderFooter = () => {
    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.footerLoader}>
          <Text style={[styles.footerText, { color: darkMode ? '#888' : '#666', fontSize: fontSize - 2 }]}>
            {fromCache ? 'تتصفح البيانات المحلية' : 'لا توجد عناصر أخرى'}
          </Text>
          {fromCache && (
            <Text style={[styles.footerSubText, { color: darkMode ? '#666' : '#999', fontSize: fontSize - 4 }]}>
              اتصل بالإنترنت للمزيد من المحتوى
            </Text>
          )}
        </View>
      );
    }

    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.footerText, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize - 2 }]}>
            تحميل المزيد...
          </Text>
        </View>
      );
    }

    return null;
  };

  // مكون العنصر الجديد مع دعم الوسائط
  function RecentBookItem({ item }) {
    const isMediaFile = item.contentType === 'video' || item.contentType === 'audio';
    const isBookFile = item.contentType !== 'video' && item.contentType !== 'audio';
    const isDownloaded = downloadedFiles[item.id];
    const isDownloading = downloadingItems.has(item.id);
    const downloadProgress = downloadProgressMap[item.id] || 0;
    
    // استخدام البيانات من المكون الرئيسي
    const isCurrentlyPlaying = item.contentType === 'audio' && 
                              globalAudioPlaying && 
                              isDownloaded && 
                              currentUri === isDownloaded.uri;
    
    const getContentTypeIcon = (type) => {
      switch (type) {
        case 'video': return 'video-library';
        case 'audio': return 'audiotrack';
        default: return 'menu-book';
      }
    };

    const getContentTypeLabel = (type) => {
      switch (type) {
        case 'video': return 'فيديو';
        case 'audio': return 'صوت';
        default: return 'كتاب';
      }
    };

    // دالة للتعامل مع النقر على زر التشغيل/التحميل
    const handlePlayDownload = async () => {
      if (isDownloading) {
        // إذا كان التحميل جارياً، منع التشغيل تماماً
        Alert.alert(
          'تحميل قيد التقدم',
          'يرجى الانتظار حتى يكتمل التحميل قبل التشغيل.',
          [{ text: 'موافق', style: 'default' }]
        );
        return;
      }
      
      if (isDownloaded) {
        // التحقق من وجود الملف الفعلي قبل التشغيل
        try {
          const fileInfo = await FileSystem.getInfoAsync(isDownloaded.uri);
          if (!fileInfo.exists || fileInfo.size < 1024) {
            console.log(`❌ File no longer exists or is corrupted: ${isDownloaded.uri}`);
            // إزالة من الحالة فوراً
            setDownloadedFiles(prev => {
              const newFiles = { ...prev };
              delete newFiles[item.id];
              return newFiles;
            });
            
            // بدء التحميل مباشرة بدلاً من التشغيل
            if (isMediaFile) {
              downloadMediaFile(item);
            } else {
              downloadBookFile(item);
            }
            return;
          }
          
          // الملف موجود وصحيح - المتابعة للتشغيل
          handleContentPress(item);
        } catch (error) {
          console.error('❌ Error checking file:', error);
          // في حالة الخطأ، إزالة من الحالة وبدء التحميل
          setDownloadedFiles(prev => {
            const newFiles = { ...prev };
            delete newFiles[item.id];
            return newFiles;
          });
          
          if (isMediaFile) {
            downloadMediaFile(item);
          } else {
            downloadBookFile(item);
          }
        }
      } else {
        // بدء التحميل
        if (isMediaFile) {
          downloadMediaFile(item);
        } else {
          downloadBookFile(item);
        }
      }
    };

    // دالة فتح في تطبيق خارجي
    const openInExternalApp = async (item) => {
      try {
        const downloadedFile = downloadedFiles[item.id];
        if (!downloadedFile) {
          Alert.alert('خطأ', 'الملف غير محمل.');
          return;
        }

        // التحقق من وجود الملف قبل الفتح
        const fileInfo = await FileSystem.getInfoAsync(downloadedFile.uri);
        if (!fileInfo.exists) {
          console.log('❌ File does not exist for external open:', downloadedFile.uri);
          // الملف محذوف - إزالة من الحالة وإشعار المستخدم
          setDownloadedFiles(prev => {
            const newFiles = { ...prev };
            delete newFiles[item.id];
            return newFiles;
          });
          Alert.alert('الملف محذوف', 'الملف غير موجود للفتح. سيتم إعادة تحميله.', [
            { text: 'موافق', onPress: () => {
              if (item.contentType === 'video' || item.contentType === 'audio') {
                downloadMediaFile(item);
              } else {
                downloadBookFile(item);
              }
            }}
          ]);
        return;
      }
      
        const mimeType = item.contentType === 'video' ? 'video/mp4' 
                      : item.contentType === 'audio' ? 'audio/mpeg'
                      : 'application/pdf';
        
        await Sharing.shareAsync(downloadedFile.uri, {
          mimeType: mimeType,
          dialogTitle: `فتح ${item.bookName} في تطبيق خارجي`,
          UTI: item.contentType === 'book' || item.contentType === undefined ? 'com.adobe.pdf' : undefined
        });
      } catch (error) {
        console.error('❌ Error opening in external app:', error);
        Alert.alert('خطأ', 'تعذر فتح الملف في تطبيق خارجي.');
      }
    };
    
    return (
      <TouchableOpacity onPress={() => handleContentPress(item)} style={[styles.contentCard, darkMode && { backgroundColor: '#333', borderColor: '#444' }]}>
        <View style={[styles.contentInfo, darkMode && { backgroundColor: '#444' }]}>
          <View style={styles.contentHeader}>
            <View style={styles.contentTitleContainer}>
              <Text style={[styles.contentName, darkMode && { color: '#90caf9' }]}>{item.bookName}</Text>
              
              {/* عرض أسماء الأقسام */}
              <View style={styles.categoryInfo}>
                {item.mainCategory && (
                  <Text style={[styles.categoryText, darkMode && { color: '#81c784' }]}>
                    📁 {item.mainCategory}
                  </Text>
                )}
                {item.subCategory && (
                  <Text style={[styles.categoryText, darkMode && { color: '#64b5f6' }]}>
                    📂 {item.subCategory}
                  </Text>
                )}
                {item.subSubCategory && (
                  <Text style={[styles.categoryText, darkMode && { color: '#ffb74d' }]}>
                    📄 {item.subSubCategory}
                  </Text>
                )}
              </View>
            </View>
            
            <View style={[styles.contentMeta, darkMode && { backgroundColor: '#555' }]}>
              <MaterialIcons 
                name={getContentTypeIcon(item.contentType)} 
                size={24} 
                color={darkMode ? '#90caf9' : '#197278'} 
                style={[styles.contentIcon, darkMode && { color: '#90caf9' }]}
              />
              <Text style={[styles.contentType, darkMode && { color: '#90caf9' }]}>{getContentTypeLabel(item.contentType)}</Text>
            </View>
          </View>
          
          {/* مشغل موحد لجميع أنواع المحتوى */}
          <View style={styles.unifiedPlayer}>
              {isDownloading ? (
              // حالة التحميل - مؤشر تحميل
              <View style={styles.downloadingState}>
                  <ActivityIndicator size="small" color={darkMode ? '#90caf9' : '#197278'} />
                  <Text style={[styles.downloadingText, { color: darkMode ? '#90caf9' : '#197278' }]}>
                  جاري التحميل... {Math.round(downloadProgress)}%
                  </Text>
                </View>
              ) : (
              // المشغل - يبدو جاهزاً دائماً
              <View style={styles.playerContainer}>
                  <TouchableOpacity 
                  onPress={handlePlayDownload}
                  style={[styles.unifiedPlayButton, { backgroundColor: darkMode ? '#444' : '#e0f2f1' }]}
                  >
                    <MaterialIcons 
                    name={
                      item.contentType === 'video' ? 'play-circle-filled' 
                      : item.contentType === 'audio' ? (isCurrentlyPlaying ? 'pause-circle-filled' : 'play-circle-filled')
                      : 'menu-book'
                    } 
                    size={32} 
                      color={darkMode ? '#90caf9' : '#197278'} 
                    />
                  <Text style={[styles.unifiedPlayText, { color: darkMode ? '#90caf9' : '#197278' }]}>
                    {item.contentType === 'video' ? 'تشغيل الفيديو'
                     : item.contentType === 'audio' ? (isCurrentlyPlaying ? 'إيقاف مؤقت' : 'تشغيل الصوت')
                     : 'قراءة الكتاب'}
                    </Text>
                  </TouchableOpacity>
                  
                {/* أزرار المشاركة والفتح الخارجي - تظهر فقط بعد التحميل */}
                {isDownloaded && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity 
                      onPress={() => shareDownloadedFile(item)}
                      style={[styles.actionButton, { backgroundColor: darkMode ? '#444' : '#e8f5e9' }]}
                    >
                      <MaterialIcons name="share" size={20} color={darkMode ? '#90caf9' : '#4caf50'} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => openInExternalApp(item)}
                      style={[styles.actionButton, { backgroundColor: darkMode ? '#444' : '#f3e5f5' }]}
                    >
                      <MaterialIcons name="open-in-new" size={20} color={darkMode ? '#90caf9' : '#7b1fa2'} />
                    </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          
            {/* شريط تقدم الصوت إذا كان يعمل */}
            {item.contentType === 'audio' && isDownloaded && (
              <View style={styles.audioProgress}>
                            <View style={[styles.progressBar, { backgroundColor: darkMode ? '#555' : '#e0f2f1' }]}>
                              <View 
                                style={[
                                  styles.progressFill, 
                                  { 
                        width: `${(audioStatus[item.id]?.positionMillis / audioStatus[item.id]?.durationMillis) * 100}%`,
                                    backgroundColor: darkMode ? '#90caf9' : '#197278'
                                  }
                                ]} 
                              />
                            </View>
                            <Text style={[styles.timeText, { color: darkMode ? '#90caf9' : '#197278' }]}>
                  {formatTime(audioStatus[item.id]?.positionMillis)} / {formatTime(audioStatus[item.id]?.durationMillis)}
                            </Text>
                          </View>
                    )}
                  </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: darkMode ? '#222' : '#f9fbe7' }]}> 
      <Text style={[styles.header, { color: darkMode ? '#90caf9' : '#388e3c', fontSize: fontSize + 6 }]}>
        المضافة مؤخراً
      </Text>
      
      {!isOnline && (
        <View style={{backgroundColor:'#ffc107',padding:6}}>
          <Text style={{color:'#333',textAlign:'center'}}>أنت الآن في وضع عدم الاتصال</Text>
        </View>
      )}
      
      {error && (
        <View style={{backgroundColor:'#f44336',padding:6}}>
          <Text style={{color:'#fff',textAlign:'center'}}>حدث خطأ في تحميل البيانات</Text>
        </View>
      )}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278', fontSize }]}>
            جاري تحميل المحتوى المضاف مؤخراً...
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="history" size={50} color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.emptyText, { color: darkMode ? '#aaa' : '#888', fontSize }]}>
            سيتم تحميل المحتوى المضاف مؤخراً عند توفره.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <RecentBookItem item={item} />
          )}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[darkMode ? '#90caf9' : '#197278']}
              tintColor={darkMode ? '#90caf9' : '#197278'}
            />
          }
          onEndReached={loadMoreContent}
          onEndReachedThreshold={0.1}
          ListFooterComponent={renderFooter}
        />
      )}
      
      {/* شريط التشغيل العالمي */}
      <GlobalAudioBar 
        darkMode={darkMode}
        audioList={audioFiles}
        currentIndex={currentAudioIndex}
        onNext={handleNextAudio}
        onPrevious={handlePreviousAudio}
      />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9fbe7',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 18,
    textAlign: 'center',
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 100, // مساحة إضافية للشريط العالمي
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  footerText: {
    marginLeft: 8,
  },
  footerSubText: {
    marginTop: 4,
    textAlign: 'center',
  },
  itemContainer: {
    borderRadius: 10,
    marginBottom: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contentCard: {
    borderRadius: 10,
    marginBottom: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  contentInfo: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f0f0f0',
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contentTitleContainer: {
    flex: 1,
    marginRight: 10,
  },
  contentName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  categoryInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  categoryText: {
    fontSize: 12,
    marginRight: 5,
    marginBottom: 2,
  },
  contentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  contentIcon: {
    marginRight: 5,
  },
  contentType: {
    fontSize: 14,
    color: '#333',
  },
  mediaControls: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  downloadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  downloadingText: {
    fontSize: 14,
    marginLeft: 5,
  },
  downloadedControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  playButton: {
    padding: 8,
    borderRadius: 15,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  progressBar: {
    width: 100,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  timeText: {
    fontSize: 12,
    marginLeft: 10,
  },
  shareButton: {
    padding: 8,
    borderRadius: 15,
  },
  downloadSection: {
    marginTop: 10,
  },
  downloadingPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  videoPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  playText: {
    marginLeft: 5,
    fontSize: 14,
  },
  bookControls: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  unifiedPlayer: {
    marginTop: 10,
    alignItems: 'center',
  },
  unifiedPlayButton: {
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedPlayText: {
    marginTop: 5,
    fontSize: 14,
  },
  downloadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  audioProgress: {
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  playerContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    width: '100%',
    justifyContent: 'space-around',
  },
  actionButton: {
    padding: 10,
    borderRadius: 20,
  },
}); 
