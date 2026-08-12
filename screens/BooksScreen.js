import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import AppSettingsContext from '../AppSettingsContext';
import DownloadShareButton from '../components/DownloadShareButton';
import { useData } from '../context/DataContext';
import { useAudio } from '../AudioContext';
import GlobalAudioBar from '../components/GlobalAudioBar';
import AdminActionHandler from '../components/AdminActionHandler';
import usageTrackingService from '../services/usageTrackingService';
import eventEmitter from '../utils/EventEmitter';

export default function BooksScreen({ route, navigation }) {
  const { mainCategory, subCategory, subSubCategory, highlightItem } = route.params;
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadedFiles, setDownloadedFiles] = useState({});
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [audioStatus, setAudioStatus] = useState({});
  const [currentPlayingVideo, setCurrentPlayingVideo] = useState(null);
  // دعم التحميل المتعدد
  const [downloadingItems, setDownloadingItems] = useState(new Set());
  const [downloadProgressMap, setDownloadProgressMap] = useState({});
  // دعم تمييز العنصر المحدد من البحث
  const [highlightedItem, setHighlightedItem] = useState(highlightItem || null);
  const { darkMode, fontSize, autoDownload } = useContext(AppSettingsContext);
  const { getBooksByCategory, isOnline, error } = useData();
  
  // استخدام AudioContext - يجب أن يكون في أعلى المكون
  const { playSound, togglePlayback, currentUri, isPlaying: globalAudioPlaying } = useAudio();

  // متغيرات للتنقل بين الملفات الصوتية
  const audioFiles = contents.filter(item => item.contentType === 'audio');
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
        await playSound(downloadedFile.uri, {
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
        await playSound(downloadedFile.uri, {
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

  const isMounted = useRef(false);

  // دالة جلب المحتوى مع حماية isMounted
  const fetchContents = async () => {
    setLoading(true);
    try {
      console.log(`📚 Loading content for: ${mainCategory} -> ${subCategory} -> ${subSubCategory} (Offline-First)`);
      const data = await getBooksByCategory(mainCategory, subCategory, subSubCategory);
      if (!isMounted.current) return;
      console.log(`📚 Found ${data ? data.length : 0} items in local database`);
      if (data && data.length > 0) {
        data.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt) - new Date(b.createdAt);
          }
          return a.bookName.localeCompare(b.bookName, 'ar');
        });
      }
      setContents(data || []);
      await checkDownloadedFiles(data || []);
      if (!isMounted.current) return;
      setLoading(false);
    } catch (error) {
      if (error.message && error.message.includes('realm that has been closed')) {
        console.warn('fetchContents aborted: Realm closed');
        return;
      }
      console.error('Error fetching books:', error);
      if (isMounted.current) {
        setContents([]);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchContents();
    return () => { isMounted.current = false; };
  }, [mainCategory, subCategory, subSubCategory, getBooksByCategory]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // إزالة المزامنة التلقائية - تحديث البيانات فقط عند الحاجة
      console.log('📖 Books screen focused - no automatic sync needed');
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const handleForceRefresh = () => fetchContents();
    const handleClearContent = () => fetchContents();
    eventEmitter.on('forceRefresh', handleForceRefresh);
    eventEmitter.on('clearContent', handleClearContent);
    return () => {
      eventEmitter.off('forceRefresh', handleForceRefresh);
      eventEmitter.off('clearContent', handleClearContent);
    };
  }, [mainCategory, subCategory, subSubCategory]);

  // إزالة التمييز بعد 3 ثوانٍ
  useEffect(() => {
    if (highlightedItem) {
      const timer = setTimeout(() => {
        setHighlightedItem(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [highlightedItem]);

  // جلب البيانات عند تحميل الصفحة
  // تحقق من الملفات المحملة مسبقاً
  const checkDownloadedFiles = async (contentList) => {
    const downloaded = {};
    for (const item of contentList) {
      // تحقق من جميع أنواع الملفات: فيديو، صوت، كتب
      const fileName = item.contentType === 'video' || item.contentType === 'audio' 
        ? sanitizeFileName(item.bookName || item.id)
        : sanitizeFileName(item.bookName || item.id) + '.pdf';
        const fileUri = FileSystem.documentDirectory + fileName;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          downloaded[item.id] = {
            uri: fileUri,
            name: item.bookName,
          type: item.contentType || 'book'
          };
      }
    }
    setDownloadedFiles(downloaded);
  };

  // تحميل ملف فيديو/صوت
  const downloadMediaFile = async (item) => {
    // التحقق من عدم وجود تحميل جاري لنفس الملف
    if (downloadingItems.has(item.id)) {
      console.log('⚠️ File already downloading:', item.id);
      return;
    }

    try {
      // إضافة للقائمة قيد التحميل
      setDownloadingItems(prev => new Set([...prev, item.id]));
      setDownloadProgressMap(prev => ({ ...prev, [item.id]: 0 }));
      
      const fileName = sanitizeFileName(item.bookName || item.id);
      const fileUri = FileSystem.documentDirectory + fileName;
      
      console.log('📥 Starting background download:', item.bookName);
      
      // تحميل في الخلفية دون انتظار
      FileSystem.createDownloadResumable(
        item.bookUrl,
        fileUri,
        {},
        (downloadProgressEvent) => {
          const progress = downloadProgressEvent.totalBytesWritten / downloadProgressEvent.totalBytesExpectedToWrite;
          setDownloadProgressMap(prev => ({ ...prev, [item.id]: progress }));
        }
      ).downloadAsync().then(({ uri: localUri }) => {
        // نجح التحميل
      const downloadedInfo = {
        uri: localUri,
        name: item.bookName,
        type: item.contentType
      };
      
      setDownloadedFiles(prev => ({
        ...prev,
        [item.id]: downloadedInfo
      }));
      
        AsyncStorage.setItem('downloaded_' + fileName, JSON.stringify(downloadedInfo));
        console.log('✅ Background download completed:', item.bookName);
        
        // إزالة من قائمة التحميل
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
        
      }).catch(error => {
        console.error('❌ Background download error:', error);
        // إزالة من قائمة التحميل في حالة الخطأ
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
      });
      
    } catch (error) {
      console.error('❌ Download initialization error:', error);
      // إزالة من قائمة التحميل
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

    try {
      // إضافة للقائمة قيد التحميل
      setDownloadingItems(prev => new Set([...prev, item.id]));
      setDownloadProgressMap(prev => ({ ...prev, [item.id]: 0 }));
      
      const fileName = sanitizeFileName(item.bookName || item.id) + '.pdf';
      const fileUri = FileSystem.documentDirectory + fileName;
      
      console.log('📥 Starting background book download:', item.bookName);
      
      // تحميل في الخلفية دون انتظار
      FileSystem.createDownloadResumable(
        item.bookUrl,
        fileUri,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BookReaderApp)'
          }
        },
        (downloadProgressEvent) => {
          const progress = downloadProgressEvent.totalBytesWritten / downloadProgressEvent.totalBytesExpectedToWrite;
          setDownloadProgressMap(prev => ({ ...prev, [item.id]: progress }));
        }
      ).downloadAsync().then(async ({ uri: localUri }) => {
        // التحقق من نجاح التحميل
        const downloadedFileInfo = await FileSystem.getInfoAsync(localUri);
        if (!downloadedFileInfo.exists || downloadedFileInfo.size === 0) {
          throw new Error('فشل في تحميل الكتاب أو الملف فارغ');
        }
        
        // حفظ معلومات الكتاب المحمل
      const downloadedInfo = {
        uri: localUri,
        name: item.bookName,
        type: 'book'
      };
      
      setDownloadedFiles(prev => ({
        ...prev,
        [item.id]: downloadedInfo
      }));
      
      await AsyncStorage.setItem('downloaded_' + fileName, JSON.stringify(downloadedInfo));
        console.log('✅ Background book download completed:', item.bookName);
        
        // إزالة من قائمة التحميل
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
        
      }).catch(error => {
        console.error('❌ Background book download error:', error);
        // إزالة من قائمة التحميل في حالة الخطأ
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
      });
      
    } catch (error) {
      console.error('❌ Book download initialization error:', error);
      // إزالة من قائمة التحميل
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

  // دالة فتح في تطبيق خارجي
  const openInExternalApp = async (item) => {
    try {
      const fileName = sanitizeFileName(item.bookName || item.id) + (item.contentType === 'book' || item.contentType === undefined ? '.pdf' : '');
      const fileUri = FileSystem.documentDirectory + fileName;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (!fileInfo.exists) {
        Alert.alert('خطأ', 'الملف غير موجود. يرجى إعادة التحميل.');
        return;
      }
      
      // للكتب، نستخدم معرف MIME محدد
      const mimeType = item.contentType === 'video' ? 'video/mp4' 
                    : item.contentType === 'audio' ? 'audio/mpeg'
                    : 'application/pdf';
      
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeType,
        dialogTitle: `فتح ${item.bookName} في تطبيق خارجي`,
        UTI: item.contentType === 'book' || item.contentType === undefined ? 'com.adobe.pdf' : undefined
      });
    } catch (error) {
      console.error('Error opening in external app:', error);
      Alert.alert('خطأ', 'تعذر فتح الملف في تطبيق خارجي. تأكد من وجود تطبيق مناسب على جهازك.');
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
        // إعادة تحميل الملف
        downloadMediaFile(item);
        return;
      }

      // استخدام AudioContext المحسن للتشغيل في الخلفية
      await playSound(downloadedFile.uri, {
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
    if (!downloadedFile) return;

    const serializableContent = {
      ...item,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
      contentUrl: downloadedFile.uri // استخدام الملف المحمل
    };
    navigation.navigate('VideoPlayer', { content: serializableContent });
  };

  // مشاركة الملف المحمل
  const shareDownloadedFile = async (item) => {
    try {
      const downloadedFile = downloadedFiles[item.id];
      if (downloadedFile) {
        await Sharing.shareAsync(downloadedFile.uri);
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء مشاركة الملف.');
    }
  };

  const getContentTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return 'video-library';
      case 'audio':
        return 'audiotrack';
      default:
        return 'menu-book';
    }
  };

  const getContentTypeLabel = (type) => {
    switch (type) {
      case 'video':
        return 'فيديو';
      case 'audio':
        return 'صوت';
      default:
        return 'كتاب';
    }
  };

  const handleContentPress = async (content) => {
    try {
      // تتبع مشاهدة المحتوى
      await usageTrackingService.trackContentView(content);
      console.log('📊 Content view tracked:', content.bookName);
    } catch (error) {
      console.error('❌ Error tracking content view:', error);
    }

    // الكتب - نفس نظام الفيديو والصوت
    if (content.contentType !== 'video' && content.contentType !== 'audio') {
      if (!content.bookUrl) {
        Alert.alert('خطأ', 'لا يوجد رابط صالح لهذا الكتاب.');
        return;
      }

      const isDownloaded = downloadedFiles[content.id];
      
      if (!isDownloaded) {
        // بدء التحميل
        downloadBookFile(content);
      } else {
        // فتح الكتاب المحمل
        const serializableBook = {
          ...content,
          createdAt: content.createdAt ? content.createdAt.toISOString() : null,
          updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null,
          localUri: isDownloaded.uri
        };
        navigation.navigate('BookPdfViewer', { book: serializableBook });
      }
      return;
    }

    // الفيديو والصوت - كما هو
    const isDownloaded = downloadedFiles[content.id];
    
    if (!isDownloaded) {
      // بدء التحميل
      downloadMediaFile(content);
    } else {
      // تشغيل الملف المحمل
      if (content.contentType === 'video') {
        playVideo(content);
      } else if (content.contentType === 'audio') {
        playAudio(content);
      }
    }
  };

  // وظيفة فتح الكتاب داخل التطبيق (للكتب فقط)
  const handleOpenInApp = (content) => {
    if (content.contentType === 'video' || content.contentType === 'audio') return;
    
    if (!content.bookUrl) {
      Alert.alert('خطأ', 'لا يوجد رابط صالح لهذا الكتاب.');
      return;
    }
    
    const serializableBook = {
      ...content,
      createdAt: content.createdAt ? content.createdAt.toISOString() : null,
      updatedAt: content.updatedAt ? content.updatedAt.toISOString() : null
    };
    navigation.navigate('BookReader', { book: serializableBook });
  };

  const handleDownload = async (item) => {
    // التحقق من عدم وجود تحميل جاري لنفس الملف
    if (downloadingItems.has(item.id)) {
      console.log('⚠️ File already downloading:', item.id);
      return;
    }

    try {
      // إضافة للقائمة قيد التحميل
      setDownloadingItems(prev => new Set([...prev, item.id]));
      setDownloadProgressMap(prev => ({ ...prev, [item.id]: 0 }));
      
      const uri = item.bookUrl;
      const fileName = sanitizeFileName(item.bookName || uri.split('/').pop().split('?')[0]);
      const fileUri = FileSystem.documentDirectory + fileName;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        uri,
        fileUri,
        {},
        (downloadProgressEvent) => {
          const progress = downloadProgressEvent.totalBytesWritten / downloadProgressEvent.totalBytesExpectedToWrite;
          setDownloadProgressMap(prev => ({ ...prev, [item.id]: progress }));
        }
      );
      
      const { uri: localUri } = await downloadResumable.downloadAsync();
      
      await AsyncStorage.setItem('downloaded_' + fileName, JSON.stringify({ name: item.bookName, type: item.contentType || 'book' }));
      Alert.alert('تم التحميل', 'تم تحميل الملف بنجاح! يمكنك الآن مشاركته أو فتحه.');
      await Sharing.shareAsync(localUri);
      
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل الملف.');
    } finally {
      // إزالة من قائمة التحميل
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

  function sanitizeFileName(name) {
    // تنظيف اسم الملف
    const cleanName = (name || 'file').replace(/[^\w\d\-_\.]/g, '_');
    
    // إضافة امتداد مناسب إذا لم يكن موجود
    if (!cleanName.includes('.')) {
      return cleanName + '.mp4'; // افتراضي للفيديو والصوت
    }
    return cleanName;
  }

  function BookItem({ item, onPress, getContentTypeIcon, getContentTypeLabel, darkMode, fontSize, globalAudioPlaying, currentUri, isHighlighted }) {
    const isMediaFile = item.contentType === 'video' || item.contentType === 'audio';
    const isBookFile = item.contentType !== 'video' && item.contentType !== 'audio';
    const isDownloaded = downloadedFiles[item.id];
    const isDownloading = downloadingItems.has(item.id);
    const downloadProgress = downloadProgressMap[item.id] || 0;
    
    // استخدام البيانات الممررة من المكون الرئيسي
    const isCurrentlyPlaying = item.contentType === 'audio' && 
                              globalAudioPlaying && 
                              isDownloaded && 
                              currentUri === isDownloaded.uri;
    
    // دالة للتعامل مع النقر على زر التشغيل/التحميل
    const handlePlayDownload = async () => {
      if (isDownloading) return; // منع النقر المتكرر أثناء التحميل
      
      if (isDownloaded) {
        // إذا كان محمل، تشغيل مباشرة
        onPress(item);
      } else {
        // إذا لم يكن محمل، ابدأ التحميل فوراً
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
        const fileName = sanitizeFileName(item.bookName || item.id);
        const fileUri = FileSystem.documentDirectory + fileName;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        
        if (!fileInfo.exists) {
          Alert.alert('خطأ', 'الملف غير موجود. يرجى إعادة التحميل.');
          return;
        }
        
        await Sharing.shareAsync(fileUri, {
          dialogTitle: `فتح ${item.bookName} في تطبيق خارجي`,
        });
      } catch (error) {
        Alert.alert('خطأ', 'تعذر فتح الملف في تطبيق خارجي.');
      }
    };
    
    return (
      <AdminActionHandler
        item={{
          label: item.bookName,
          bookName: item.bookName,
          id: item.id,
          source: 'realm',
          data: item
        }}
        itemType="book"
        onSuccess={() => {
          console.log('🔄 Admin action completed - forcing immediate refresh');
          // إجبار التحديث الفوري
          setTimeout(() => {
            fetchContents();
          }, 500);
        }}
      >
      <TouchableOpacity 
        onPress={() => onPress(item)} 
        style={[
          styles.contentCard, 
          darkMode && { backgroundColor: '#333', borderColor: '#444' },
          isHighlighted && styles.highlightedCard,
          isHighlighted && darkMode && styles.highlightedCardDark
        ]}
      >
        <View style={[styles.contentInfo, darkMode && { backgroundColor: '#444' }]}>
          <View style={styles.contentHeader}>
          <Text style={[styles.contentName, darkMode && { color: '#90caf9' }]}>{item.bookName}</Text>
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
                  جاري التحميل... {Math.round(downloadProgress * 100)}%
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
      </AdminActionHandler>
    );
  }

  // تنسيق الوقت للصوت
  const formatTime = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, darkMode && { backgroundColor: '#222' }]}>
      {/* Header with back button */}
      <View style={[styles.headerContainer, darkMode && { backgroundColor: '#333', borderBottomColor: '#444' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-forward" size={24} color={darkMode ? '#90caf9' : '#197278'} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.subHeader, { fontSize: fontSize + 2, color: darkMode ? '#90caf9' : '#4a6d71' }]}>{mainCategory}</Text>
          {subCategory && (
            <Text style={[styles.subHeader, { fontSize: fontSize, color: darkMode ? '#90caf9' : '#4a6d71' }]}>{subCategory}</Text>
          )}
          {subSubCategory && (
            <Text style={[styles.subHeader, { fontSize: fontSize, color: darkMode ? '#90caf9' : '#4a6d71' }]}>{subSubCategory}</Text>
          )}
        </View>
      </View>
      
      {/* Offline status indicator */}
      {!isOnline && (
        <View style={[styles.statusBar, darkMode && { backgroundColor: '#d32f2f' }]}>
          <MaterialIcons name="wifi-off" size={16} color="#fff" />
          <Text style={styles.statusText}>تتصفح البيانات المحلية المتاحة</Text>
        </View>
      )}
      
      {error && (
        <View style={[styles.statusBar, { backgroundColor: '#ff9800' }]}>
          <MaterialIcons name="warning" size={16} color="#fff" />
          <Text style={styles.statusText}>{error}</Text>
        </View>
      )}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.loadingText, { fontSize, color: darkMode ? '#90caf9' : '#197278' }]}>جاري تحميل المحتوى...</Text>
        </View>
      ) : contents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="library-books" size={50} color={darkMode ? '#90caf9' : '#197278'} />
          <Text style={[styles.emptyText, { fontSize, color: darkMode ? '#aaa' : '#546e7a' }]}>لا يوجد محتوى في هذا القسم</Text>
        </View>
      ) : (
        <FlatList
          data={contents}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <BookItem
              item={item}
              onPress={handleContentPress}
              getContentTypeIcon={getContentTypeIcon}
              getContentTypeLabel={getContentTypeLabel}
              darkMode={darkMode}
              fontSize={fontSize}
              globalAudioPlaying={globalAudioPlaying}
              currentUri={currentUri}
              isHighlighted={item.id === highlightedItem}
            />
          )}
          contentContainerStyle={styles.listContainer}
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
    backgroundColor: '#fff',
  },
  headerContainer: {
    padding: 16,
    backgroundColor: '#e0f2f1',
    borderBottomWidth: 1,
    borderBottomColor: '#b2dfdb',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#197278',
    textAlign: 'center',
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 16,
    color: '#4a6d71',
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80, // مساحة إضافية للشريط العالمي
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e0f2f1',
  },
  contentInfo: {
    flex: 1,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  contentName: {
    flex: 1,
    fontSize: 18,
    color: '#29434e',
    textAlign: 'right',
    fontWeight: 'bold',
  },
  contentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  contentIcon: {
    marginLeft: 8,
  },
  contentType: {
    fontSize: 14,
    color: '#197278',
  },
  downloadSection: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#197278',
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
    color: '#546e7a',
    textAlign: 'center',
  },
  downloadButton: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#e0f2f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: 250,
  },
  progressBar: {
    width: '100%',
    height: 16,
    backgroundColor: '#e0f2f1',
    borderRadius: 8,
    marginVertical: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#197278',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 16,
    color: '#197278',
    textAlign: 'center',
  },
  progressPercent: {
    fontSize: 16,
    color: '#197278',
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b2dfdb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 17,
    color: '#29434e',
    textAlign: 'right',
    elevation: 2,
    marginTop: 12,
    width: '90%',
    alignSelf: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    elevation: 2,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
  mediaControls: {
    marginTop: 12,
  },
  downloadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  downloadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  downloadedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playButton: {
    padding: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  progressBar: {
    width: '100%',
    height: 16,
    backgroundColor: '#e0f2f1',
    borderRadius: 8,
    marginVertical: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#197278',
    borderRadius: 8,
  },
  timeText: {
    fontSize: 14,
    marginLeft: 12,
  },
  shareButton: {
    padding: 8,
    borderRadius: 20,
  },
  downloadingPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  videoPlayer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  playText: {
    marginTop: 4,
    fontSize: 14,
  },
  bookControls: {
    marginTop: 12,
  },
  unifiedPlayer: {
    marginTop: 12,
    alignItems: 'center',
  },
  unifiedPlayButton: {
    padding: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  unifiedPlayText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  downloadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  audioProgress: {
    marginTop: 12,
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
  highlightedCard: {
    borderWidth: 2,
    borderColor: '#197278',
    backgroundColor: '#e8f5e9',
  },
  highlightedCardDark: {
    borderColor: '#90caf9',
    backgroundColor: '#1a1a2e',
  },
  playPauseButton: {
    backgroundColor: '#197278',
    padding: 12,
    borderRadius: 20,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 18,
    zIndex: 1,
    padding: 8,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 50, // مساحة لزر الرجوع
  },
}); 