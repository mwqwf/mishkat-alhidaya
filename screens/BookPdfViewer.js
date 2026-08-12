import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Pdf } from 'react-native-pdf-light';
import * as Sharing from 'expo-sharing';
import AppSettingsContext from '../AppSettingsContext';

export default function BookPdfViewer({ route, navigation }) {
  const { book } = route.params;
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleLoadComplete = (numberOfPages) => {
    setIsLoading(false);
    console.log(`✅ PDF loaded successfully: ${numberOfPages} pages`);
  };

  const handleError = (error) => {
    setIsLoading(false);
    setError(error.message);
    console.error('❌ PDF load error:', error);
    Alert.alert('خطأ في تحميل الكتاب', 'حدث خطأ أثناء تحميل الكتاب. يرجى المحاولة مرة أخرى.');
  };

  const handleShare = async () => {
    try {
      if (book.localUri) {
        await Sharing.shareAsync(book.localUri);
      } else {
        Alert.alert('تنبيه', 'يجب تحميل الكتاب أولاً قبل مشاركته.');
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء مشاركة الكتاب.');
    }
  };

  const handleOpenExternal = async () => {
    try {
      if (book.bookUrl) {
        const supported = await Linking.canOpenURL(book.bookUrl);
        if (supported) {
          await Linking.openURL(book.bookUrl);
        } else {
          Alert.alert('خطأ', 'لا يمكن فتح الرابط في متصفح خارجي.');
        }
      } else {
        Alert.alert('تنبيه', 'لا يوجد رابط متاح للفتح في متصفح خارجي.');
      }
    } catch (error) {
      console.error('External open error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء فتح الرابط الخارجي.');
    }
  };

  return (
    <View style={[styles.container, darkMode && { backgroundColor: '#222' }]}>
      {/* Header مع أزرار التحكم */}
      <View style={[styles.header, darkMode && { backgroundColor: '#333', borderBottomColor: '#444' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={darkMode ? '#90caf9' : '#197278'} />
        </TouchableOpacity>
        
        <Text style={[styles.title, { fontSize: fontSize + 2, color: darkMode ? '#90caf9' : '#197278' }]} numberOfLines={1}>
          {book.bookName}
        </Text>

        <View style={styles.actionButtons}>
          {book.localUri && (
            <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
              <MaterialIcons name="share" size={24} color={darkMode ? '#90caf9' : '#197278'} />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={handleOpenExternal} style={styles.actionButton}>
            <MaterialIcons name="open-in-browser" size={24} color={darkMode ? '#90caf9' : '#197278'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* محتوى PDF */}
      <View style={styles.pdfContainer}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
            <Text style={[styles.loadingText, { color: darkMode ? '#90caf9' : '#197278', fontSize }]}>
              جاري تحميل الكتاب...
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error" size={50} color={darkMode ? '#f44336' : '#d32f2f'} />
            <Text style={[styles.errorText, { color: darkMode ? '#f44336' : '#d32f2f', fontSize }]}>
              خطأ في تحميل الكتاب
            </Text>
            <Text style={[styles.errorDetails, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
              {error}
            </Text>
          </View>
        )}

        {!error && (
          <Pdf
            source={book.localUri || book.bookUrl}
            onLoadComplete={handleLoadComplete}
            onError={handleError}
            style={styles.pdf}
          />
        )}
      </View>

      {/* شريط أدوات سفلي */}
      <View style={[styles.bottomToolbar, darkMode && { backgroundColor: '#333', borderTopColor: '#444' }]}>
        <Text style={[styles.statusText, { color: darkMode ? '#90caf9' : '#197278', fontSize: fontSize - 2 }]}>
          {book.localUri ? '📖 متاح للقراءة محلياً' : '🌐 يتطلب اتصال إنترنت'}
        </Text>
      </View>
    </View>
  );
}

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
    backgroundColor: '#e0f2f1',
    borderBottomWidth: 1,
    borderBottomColor: '#b2dfdb',
    elevation: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#197278',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  pdfContainer: {
    flex: 1,
    position: 'relative',
  },
  pdf: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorDetails: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  bottomToolbar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e0f2f1',
    borderTopWidth: 1,
    borderTopColor: '#b2dfdb',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
}); 