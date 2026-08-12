import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  BackHandler,
  Share,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import usageTrackingService from '../services/usageTrackingService';

const BookReaderScreen = ({ route, navigation }) => {
  const { book } = route.params;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localFilePath, setLocalFilePath] = useState(null);
  const webViewRef = useRef(null);
  const [viewStartTime, setViewStartTime] = useState(null);

  // Always use internet URL for reading, but keep local file info for sharing
  const readingUrl = book.internet_url;

  useEffect(() => {
    const backAction = () => {
      // تسجيل وقت المشاهدة عند الخروج
      trackViewTime();
      navigation.goBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    // Check if we have a local file for sharing purposes
    checkLocalFile();

    // تسجيل بداية المشاهدة
    setViewStartTime(Date.now());

    // تسجيل مشاهدة الكتاب فوراً
    trackBookView();

    return () => {
      // تسجيل وقت المشاهدة عند إلغاء تحميل المكون
      trackViewTime();
      backHandler.remove();
    };
  }, []);

  // تسجيل مشاهدة الكتاب
  const trackBookView = async () => {
    try {
      await usageTrackingService.trackContentView(book, 0);
      console.log(`📊 Book view tracked: ${book.bookName}`);
    } catch (error) {
      console.error('❌ Error tracking book view:', error);
    }
  };

  // تسجيل وقت المشاهدة
  const trackViewTime = async () => {
    if (viewStartTime) {
      try {
        const viewTimeSeconds = Math.floor((Date.now() - viewStartTime) / 1000);
        if (viewTimeSeconds > 0) {
          await usageTrackingService.trackContentView(book, viewTimeSeconds);
          console.log(`📊 View time tracked: ${viewTimeSeconds} seconds for ${book.bookName}`);
        }
      } catch (error) {
        console.error('❌ Error tracking view time:', error);
      }
    }
  };

  const checkLocalFile = async () => {
    try {
      if (book.file_path) {
        const fileExists = await FileSystem.getInfoAsync(book.file_path);
        if (fileExists.exists) {
          setLocalFilePath(book.file_path);
        }
      }
    } catch (error) {
      console.log('Error checking local file:', error);
    }
  };

  const handleShare = async () => {
    try {
      if (localFilePath) {
        // Share local file if available
        const result = await Share.share({
          url: localFilePath,
          title: book.title,
          message: `شاهد هذا الكتاب: ${book.title}`,
        });
      } else if (book.internet_url) {
        // Share internet URL
        const result = await Share.share({
          url: book.internet_url,
          title: book.title,
          message: `شاهد هذا الكتاب: ${book.title}`,
        });
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء المشاركة');
    }
  };

  const openExternally = async () => {
    try {
      if (localFilePath) {
        // Open local file externally
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: localFilePath,
            flags: 1,
            type: 'application/pdf',
          });
        }
      } else if (book.internet_url) {
        // Open internet URL externally
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: book.internet_url,
            flags: 1,
          });
        }
      }
    } catch (error) {
      Alert.alert('خطأ', 'لا يمكن فتح الملف خارجياً');
    }
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    setIsLoading(false);
    setError('فشل في تحميل الكتاب. تأكد من الاتصال بالإنترنت.');
    console.log('WebView error: ', nativeEvent);
  };

  const retry = () => {
    setError(null);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book.title}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={openExternally}>
              <Ionicons name="open-outline" size={20} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#666" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {book.title}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={openExternally}>
            <Ionicons name="open-outline" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>جاري تحميل الكتاب...</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: readingUrl }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="compatibility"
        onShouldStartLoadWithRequest={(request) => {
          return true;
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BookReaderScreen; 