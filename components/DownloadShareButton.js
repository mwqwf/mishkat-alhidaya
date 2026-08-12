import React, { useState, useEffect } from 'react';
import { TouchableOpacity, View, Text, Alert, StyleSheet, Platform } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

function sanitizeFileName(name) {
  // إزالة الرموز غير المسموح بها في أسماء الملفات وإضافة امتداد PDF
  const cleanName = (name || '').replace(/[^\w\d\-_\.\u0600-\u06FF\s]/g, '_').trim();
  return cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;
}

export default function DownloadShareButton({ 
  fileUrl, 
  fileName, 
  label, 
  iconColor = '#197278', 
  size = 24, 
  style,
  onOpenInApp = null, // callback لفتح الكتاب داخل التطبيق
  compact = false // خاصية جديدة للعرض المضغوط
}) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localFilePath, setLocalFilePath] = useState(null);
  const [downloadResumable, setDownloadResumable] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    checkIfDownloaded();
  }, [fileUrl, fileName]);

  const getSafeFileName = () => {
    const base = fileName || (fileUrl ? fileUrl.split('/').pop().split('?')[0] : 'document');
    return sanitizeFileName(base);
  };

  const checkIfDownloaded = async () => {
    if (!fileUrl) return setIsDownloaded(false);
    const name = getSafeFileName();
    const fileUri = FileSystem.documentDirectory + name;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    
    // التحقق من وجود الملف وحجمه (يجب أن يكون أكبر من 1KB لضمان اكتمال التحميل)
    if (fileInfo.exists && fileInfo.size > 1024) {
      setIsDownloaded(true);
      setLocalFilePath(fileUri);
    } else {
      // إذا كان الملف صغير جداً، احذفه لأنه تالف
      if (fileInfo.exists && fileInfo.size <= 1024) {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          console.log('🗑️ Deleted corrupted/incomplete file:', name);
        } catch (error) {
          console.warn('⚠️ Could not delete corrupted file:', error);
        }
      }
      setIsDownloaded(false);
      setLocalFilePath(null);
    }
  };

  const handleDownload = async () => {
    if (isDownloaded) return;
    
    if (!fileUrl) {
      Alert.alert('خطأ', 'لا يوجد رابط صالح للتحميل.');
      return;
    }

    // إذا كان التحميل متوقف مؤقتاً، استئنافه
    if (isPaused && downloadResumable) {
      console.log('▶️ Resuming download...');
      setIsPaused(false);
      await resumeDownload();
      return;
    }

    // إذا كان التحميل جارياً، إيقافه مؤقتاً
    if (downloading && !isPaused) {
      console.log('⏸️ Pausing download...');
      setIsPaused(true);
      return;
    }

    // بدء تحميل جديد
    await startNewDownload();
  };

  const startNewDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setIsPaused(false);
    const name = getSafeFileName();
    const fileUri = FileSystem.documentDirectory + name;
    
    try {
      // إذا كان الملف موجوداً جزئياً أو تالفاً، احذفه أولاً
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists && fileInfo.size < 1000) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
      
      // إنشاء تحميل قابل للاستئناف
      const resumable = FileSystem.createDownloadResumable(
        fileUrl,
        fileUri,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BookReaderApp)'
          }
        },
        (progress) => {
          const progressPercent = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
          // التأكد من أن النسبة بين 0 و 1
          const clampedProgress = Math.max(0, Math.min(1, progressPercent));
          setDownloadProgress(clampedProgress);
          
          // إظهار معلومات التحميل المفصلة
          const downloadedMB = (progress.totalBytesWritten / (1024 * 1024)).toFixed(2);
          const totalMB = (progress.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(2);
          console.log(`📊 Download progress: ${(clampedProgress * 100).toFixed(1)}% (${downloadedMB}MB / ${totalMB}MB)`);
        }
      );
      
      setDownloadResumable(resumable);
      
      // محاولة التحميل مع الاستئناف التلقائي
      let result;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          result = await resumable.downloadAsync();
          break; // نجح التحميل
        } catch (error) {
          retryCount++;
          console.log(`🔄 Download attempt ${retryCount}/${maxRetries} failed:`, error.message);
          
          if (retryCount >= maxRetries) {
            throw error; // فشلت جميع المحاولات
          }
          
          // انتظار قبل المحاولة التالية
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          
          // محاولة استئناف التحميل
          try {
            result = await resumable.downloadAsync();
            console.log(`✅ Resume successful on attempt ${retryCount}`);
            break;
          } catch (resumeError) {
            console.log(`🔄 Resume attempt ${retryCount} failed:`, resumeError.message);
            // استمر في الحلقة للمحاولة التالية
          }
        }
      }
      
      await handleDownloadComplete(result);
      
    } catch (error) {
      await handleDownloadError(error);
    }
  };

  const resumeDownload = async () => {
    if (!downloadResumable) return;
    
    try {
      console.log('🔄 Resuming download...');
      const result = await downloadResumable.downloadAsync();
      await handleDownloadComplete(result);
    } catch (error) {
      await handleDownloadError(error);
    }
  };

  const handleDownloadComplete = async (result) => {
    const { uri: localUri } = result;
    
    // التحقق من نجاح التحميل
    const downloadedFileInfo = await FileSystem.getInfoAsync(localUri);
    if (!downloadedFileInfo.exists || downloadedFileInfo.size <= 1024) {
      throw new Error('فشل في تحميل الملف أو الملف غير مكتمل (حجم صغير جداً)');
    }
    
    setDownloading(false);
    setDownloadProgress(0);
    setIsDownloaded(true);
    setLocalFilePath(localUri);
    setDownloadResumable(null);
    setIsPaused(false);
    
    await AsyncStorage.setItem('downloaded_' + getSafeFileName(), JSON.stringify({
      fileName: getSafeFileName(),
      filePath: localUri,
      downloadedAt: new Date().toISOString(),
      originalUrl: fileUrl
    }));
    
    // رسالة تحميل محسنة مع خيارات واضحة
    Alert.alert(
      'تم التحميل بنجاح! 📚',
      `تم تحميل "${fileName || 'الملف'}" بنجاح.\n\nماذا تريد أن تفعل الآن؟`,
      [
        { 
          text: 'فتح في تطبيق خارجي', 
          onPress: handleOpenInExternalApp,
          style: 'default' 
        },
        { 
          text: 'فتح داخل التطبيق', 
          onPress: handleOpenInApp,
          style: 'default' 
        },
        { text: 'إغلاق', style: 'cancel' }
      ]
    );
  };

  const handleDownloadError = async (error) => {
    setDownloading(false);
    setDownloadProgress(0);
    setDownloadResumable(null);
    setIsPaused(false);
    
    // إذا فشل التحميل، احذف الملف التالف إن وجد
    try { 
      await FileSystem.deleteAsync(FileSystem.documentDirectory + getSafeFileName(), { idempotent: true }); 
    } catch {}
    
    let errorMessage = 'حدث خطأ أثناء تحميل الملف.';
    if (error.message?.includes('Network request failed')) {
      errorMessage = 'فشل الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.';
    } else if (error.message?.includes('404')) {
      errorMessage = 'الملف غير موجود على الخادم.';
    } else if (error.message?.includes('403')) {
      errorMessage = 'ليس لديك صلاحية لتحميل هذا الملف.';
    } else if (error.message?.includes('Connection reset')) {
      errorMessage = 'انقطع الاتصال بالخادم. يمكنك الضغط مرة أخرى لاستئناف التحميل.';
    }
    
    Alert.alert('خطأ في التحميل', errorMessage);
  };

  const handleShare = async () => {
    try {
      if (!localFilePath) {
        Alert.alert('تنبيه', 'يجب تحميل الملف أولاً قبل مشاركته.');
        return;
      }
      
      const fileInfo = await FileSystem.getInfoAsync(localFilePath);
      if (!fileInfo.exists) {
        Alert.alert('خطأ', 'الملف غير موجود. يرجى إعادة التحميل.');
        setIsDownloaded(false);
        setLocalFilePath(null);
        return;
      }
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('خطأ', 'المشاركة غير متاحة على هذا الجهاز.');
        return;
      }
      
      await Sharing.shareAsync(localFilePath, {
        mimeType: 'application/pdf',
        dialogTitle: `مشاركة ${fileName || 'الملف'}`,
        UTI: 'com.adobe.pdf'
      });
    } catch (error) {
      console.error('خطأ في المشاركة:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء المشاركة.');
    }
  };

  const handleOpenInExternalApp = async () => {
    try {
      if (!localFilePath) {
        Alert.alert('تنبيه', 'يجب تحميل الملف أولاً قبل فتحه.');
        return;
      }
      
      const fileInfo = await FileSystem.getInfoAsync(localFilePath);
      if (!fileInfo.exists) {
        Alert.alert('خطأ', 'الملف غير موجود. يرجى إعادة التحميل.');
        setIsDownloaded(false);
        setLocalFilePath(null);
        return;
      }
      
      // إضافة file:// إذا لم يكن موجوداً
      let fullPath = localFilePath;
      if (!fullPath.startsWith('file://')) {
        fullPath = 'file://' + fullPath;
      }
      
      // الطريقة الأولى: محاولة فتح الملف مباشرة
      try {
        const canOpen = await Linking.canOpenURL(fullPath);
        if (canOpen) {
          await Linking.openURL(fullPath);
          return;
        }
      } catch (linkingError) {
        console.log('فشل Linking.openURL:', linkingError);
      }
      
      // الطريقة الثانية: استخدام Sharing مع خيارات متقدمة
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(localFilePath, {
            mimeType: 'application/pdf',
            dialogTitle: `فتح ${fileName || 'الملف'} في تطبيق خارجي`,
            UTI: 'com.adobe.pdf'
          });
          return;
        }
      } catch (sharingError) {
        console.log('فشل Sharing:', sharingError);
      }
      
      // إذا فشلت جميع الطرق
      Alert.alert(
        'تعذر فتح الملف',
        'تعذر فتح الملف في تطبيق خارجي. تأكد من وجود تطبيق قارئ PDF على جهازك مثل Adobe Reader أو Google PDF Viewer.',
        [
          { text: 'موافق', style: 'default' }
        ]
      );
    } catch (error) {
      console.error('خطأ في فتح الملف:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء محاولة فتح الملف.');
    }
  };

  const handleOpenInApp = () => {
    if (onOpenInApp && typeof onOpenInApp === 'function') {
      onOpenInApp();
    } else {
      Alert.alert('تنبيه', 'وظيفة فتح الملف داخل التطبيق غير متاحة.');
    }
  };

  // في الوضع المضغوط، نعرض فقط ايقونة التحميل
  if (compact) {
    return (
      <TouchableOpacity 
        onPress={isDownloaded ? () => {
          Alert.alert(
            'الملف محمل مسبقاً',
            `الملف "${fileName || 'هذا الملف'}" موجود على جهازك.\n\nماذا تريد أن تفعل؟`,
            [
              { 
                text: 'فتح في تطبيق خارجي', 
                onPress: handleOpenInExternalApp 
              },
              { 
                text: 'فتح داخل التطبيق', 
                onPress: handleOpenInApp 
              },
              { 
                text: 'مشاركة', 
                onPress: handleShare 
              },
              { text: 'إلغاء', style: 'cancel' }
            ]
          );
        } : handleDownload} 
        disabled={false} 
        style={[styles.compactBtn, style]}
      >
        {isDownloaded ? (
          <MaterialIcons name="check-circle" size={size} color="#4caf50" />
        ) : downloading ? (
          <View style={styles.progressContainer}>
            {isPaused ? (
              <MaterialIcons name="play-arrow" size={size * 0.6} color={iconColor} />
            ) : (
              <Text style={[styles.progressText, { color: iconColor, fontSize: size * 0.4 }]}>
                {Math.round(downloadProgress * 100)}%
              </Text>
            )}
          </View>
        ) : (
          <MaterialIcons name="file-download" size={size} color={iconColor} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* زر التحميل */}
      <TouchableOpacity 
        onPress={handleDownload} 
        disabled={isDownloaded} 
        style={[styles.iconBtn, { backgroundColor: isDownloaded ? '#e8f5e9' : '#fff3e0' }]}
      >
        {isDownloaded ? (
          <MaterialIcons name="check-circle" size={size} color="#4caf50" />
        ) : downloading ? (
          <View style={styles.progressContainer}>
            {isPaused ? (
              <MaterialIcons name="play-arrow" size={size * 0.6} color={iconColor} />
            ) : (
              <Text style={[styles.progressText, { color: iconColor }]}>
                {Math.round(downloadProgress * 100)}%
              </Text>
            )}
          </View>
        ) : (
          <MaterialIcons name="file-download" size={size} color={iconColor} />
        )}
      </TouchableOpacity>
      
      {/* أزرار إضافية عند التحميل */}
      {isDownloaded && (
        <View style={styles.actionButtons}>
          {/* زر فتح داخل التطبيق */}
          <TouchableOpacity 
            onPress={handleOpenInApp} 
            style={[styles.iconBtn, { backgroundColor: '#e3f2fd' }]}
          >
            <MaterialIcons name="menu-book" size={size} color="#1976d2" />
          </TouchableOpacity>
          
          {/* زر فتح في تطبيق خارجي */}
          <TouchableOpacity 
            onPress={handleOpenInExternalApp} 
            style={[styles.iconBtn, { backgroundColor: '#f3e5f5' }]}
          >
            <Ionicons name="open-outline" size={size} color="#7b1fa2" />
          </TouchableOpacity>
          
          {/* زر المشاركة */}
          <TouchableOpacity 
            onPress={handleShare} 
            style={[styles.iconBtn, { backgroundColor: '#e0f2f1' }]}
          >
            <MaterialIcons name="share" size={size} color="#00695c" />
        </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  iconBtn: {
    marginLeft: 6,
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    minHeight: 40,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  compactBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
}); 