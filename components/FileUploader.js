import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'react-native-document-picker';
import Constants from 'expo-constants';
import { storage } from '../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export default function FileUploader({ onFileUploaded, fileType, mainCategory, subCategory, subSubCategory }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const isExpoGo = Constants.appOwnership === 'expo';

  const handleFileSelect = async () => {
    setError(null);
    try {
      let file = null;
      let mimeType = '';
      let name = '';
      
      console.log('📁 FileUploader: Starting internal file selection for type:', fileType);
      
      if (fileType === 'video' || fileType === 'image') {
        let result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: fileType === 'video'
            ? ImagePicker.MediaTypeOptions.Videos
            : ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 1,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          file = result.assets[0];
          if (!file.uri.startsWith('file://')) {
            Alert.alert('خطأ', 'لا يمكن رفع هذا الملف. الرجاء اختيار ملف من الملفات المحلية.');
            return;
          }
          mimeType = file.mimeType || (fileType === 'video' ? 'video/mp4' : 'image/jpeg');
          name = file.fileName || file.name || `file.${fileType === 'video' ? 'mp4' : 'jpg'}`;
          
          console.log('📁 FileUploader: Internal video/image file selected:', {
            uri: file.uri,
            name: name,
            mimeType: mimeType
          });
        } else {
          console.log('📁 FileUploader: Internal file selection cancelled');
          return;
        }
      } else if (fileType === 'audio') {
        let res = await DocumentPicker.pickSingle({
          type: DocumentPicker.types.audio,
        });
        file = res;
        mimeType = res.type || 'audio/mpeg';
        name = res.name || 'file.mp3';
        
        console.log('📁 FileUploader: Internal audio file selected:', {
          uri: file.uri,
          name: name,
          mimeType: mimeType
        });
      } else if (fileType === 'book' || fileType === 'pdf') {
        let res = await DocumentPicker.pickSingle({ type: DocumentPicker.types.pdf });
        file = res;
        mimeType = res.type || 'application/pdf';
        name = res.name || 'file.pdf';
        
        console.log('📁 FileUploader: Internal book/PDF file selected:', {
          uri: file.uri,
          name: name,
          mimeType: mimeType
        });
      } else {
        setError('نوع الملف غير مدعوم');
        console.error('📁 FileUploader: Unsupported file type:', fileType);
        return;
      }
      
      // إضافة معلومات إضافية لتوضيح أن هذا ملف من داخل التطبيق
      const internalFileData = {
        uri: file.uri,
        name: name,
        mimeType: mimeType,
        source: 'internal', // تمييز واضح أن هذا ملف من داخل التطبيق
        timestamp: Date.now(),
        uploadType: 'internal' // تمييز واضح لنوع الإضافة
      };
      
      console.log('📁 FileUploader: Internal file data prepared:', internalFileData);
      
      // لا ترفع الملف هنا! فقط مرر بياناته
      onFileUploaded(internalFileData);
      
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('📁 FileUploader: Error selecting internal file:', err);
        setError('حدث خطأ أثناء اختيار الملف من داخل التطبيق');
      } else {
        console.log('📁 FileUploader: Internal file selection cancelled by user');
      }
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.button, uploading && styles.buttonDisabled]} 
        onPress={handleFileSelect}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {fileType === 'video' && 'اختيار فيديو من داخل التطبيق'}
            {fileType === 'image' && 'اختيار صورة من داخل التطبيق'}
            {fileType === 'audio' && 'اختيار ملف صوتي من داخل التطبيق'}
            {(fileType === 'book' || fileType === 'pdf') && 'اختيار ملف PDF من داخل التطبيق'}
          </Text>
        )}
      </TouchableOpacity>

      {uploading && (
        <View style={styles.progressContainer}>
          <ActivityIndicator size="large" color="#197278" />
          <Text style={styles.progressText}>
            {Math.round(uploadProgress * 100)}%
          </Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
      
      {/* رسالة توضيحية */}
      <Text style={styles.infoText}>
        📁 هذا الخيار لاختيار ملف من داخل التطبيق. للمشاركة من تطبيق خارجي، استخدم زر المشاركة في التطبيق الآخر.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
  },
  button: {
    backgroundColor: '#197278',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#d32f2f',
    marginTop: 8,
    textAlign: 'center',
  },
  progressContainer: {
    width: '80%',
    marginTop: 10,
    alignItems: 'center',
  },
  progressText: {
    marginTop: 5,
    color: '#197278',
    fontSize: 14,
  },
  infoText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
    paddingHorizontal: 20,
  },
});
