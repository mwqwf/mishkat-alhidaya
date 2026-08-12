import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { collection, addDoc, getDocs, query, doc, deleteDoc, updateDoc, limit } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { db, storage } from '../config/firebase';
import FileUploader from './FileUploader';
import { ref, deleteObject, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import sha1 from 'js-sha1';
import AppSettingsContext from '../AppSettingsContext';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from '../context/DataContext';
import dataService from '../services/dataService';

/**
 * نموذج إضافة المحتوى المحلي (BookForm/ContentForm)
 * 
 * هذا النموذج مخصص لإضافة الملفات المحلية فقط:
 * 
 * 1. الملفات المشتركة من تطبيقات خارجية (مثل تيليجرام، واتساب، إلخ)
 *    - يتم استدعاؤه من App.js مع sharedFile
 *    - uploadType = 'external'
 * 
 * 2. الملفات المختارة من داخل التطبيق (من خلال FileUploader)
 *    - يتم استدعاؤه من AdminDashboard.js بدون sharedFile
 *    - uploadType = 'internal'
 * 
 * 3. تعديل المحتوى الموجود
 *    - يتم استدعاؤه مع editContent
 *    - editMode = true
 * 
 * لا يستخدم هذا النموذج للروابط - استخدم UrlContentForm بدلاً من ذلك
 */
export default function ContentForm({ onBookAdded, onStatsChanged, editContent, sharedFile, onClose }) {
  console.log('📁 BookForm initialized with:', { 
    hasSharedFile: !!sharedFile, 
    sharedFileUri: sharedFile?.uri,
    sharedFileName: sharedFile?.name,
    sharedFileMimeType: sharedFile?.mimeType,
    editContent: !!editContent,
    isExternalShare: !!sharedFile, // تمييز واضح بين الإضافة من تطبيق خارجي
    source: sharedFile?.source || 'unknown'
  });

  const { isAdmin } = useContext(AppSettingsContext);
  const { forceSyncNewData } = useData();
  const [contentName, setContentName] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [contentType, setContentType] = useState('book');
  const [mainCategory, setMainCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [contents, setContents] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [subSubCategories, setSubSubCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [processedSharedFile, setProcessedSharedFile] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadTaskRef = useRef(null);

  // إضافة متغير لحالة التقدم
  const [progressMessage, setProgressMessage] = useState('');
  
  // إضافة متغير لتتبع نوع الإضافة
  const [uploadType, setUploadType] = useState(null); // 'external' أو 'internal' أو null

  // إضافة متغيرات لحفظ الأقسام المختارة مؤخراً
  const [lastUsedCategories, setLastUsedCategories] = useState({
    mainCategory: '',
    subCategory: '',
    subSubCategory: ''
  });

  // دالة لتحسين استخراج الأسماء العربية من الملفات
  const extractArabicNameFromFile = (fileName, mimeType) => {
    try {
      // إزالة الامتداد أولاً
      const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
      
      // تجاهل الأسماء المؤقتة مثل external_shared_file_1754185550776
      if (nameWithoutExtension.match(/^(external_shared_file_|temp_|tmp_|cache_|upload_|download_)\d+$/)) {
        console.log(`📁 BookForm: ignoring temporary file name: ${nameWithoutExtension}`);
        return null;
      }
      
      // تجاهل الأسماء التي تحتوي على كلمات إنجليزية شائعة في أسماء الملفات المؤقتة
      const commonEnglishWords = ['temp', 'tmp', 'cache', 'upload', 'download'];
      const lowerName = nameWithoutExtension.toLowerCase();
      
      // تحسين: لا نتجاهل كلمات مثل "external", "internal", "shared" لأنها قد تكون جزءاً من اسم حقيقي
      // فقط نتجاهل الكلمات المؤقتة حقاً
      for (const word of commonEnglishWords) {
        if (lowerName === word || lowerName.startsWith(word + '_') || lowerName.endsWith('_' + word)) {
          console.log(`📁 BookForm: ignoring name with temporary word: ${word}`);
          return null;
        }
      }
      
      // 1. البحث عن الحروف العربية في الاسم مباشرة
      const arabicMatches = nameWithoutExtension.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g);
      
      if (arabicMatches && arabicMatches.length > 0) {
        // اختيار أطول تطابق عربي
        const longestArabic = arabicMatches.reduce((longest, current) => 
          current.length > longest.length ? current : longest
        );
        
        if (longestArabic.length > 2) {
          const cleanArabic = longestArabic
            .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanArabic.length > 2) {
            console.log(`📁 BookForm: extracted Arabic name: ${cleanArabic}`);
            return cleanArabic;
          }
        }
      }
      
      // 2. محاولة فك ترميز الاسم إذا كان مشفراً
      try {
        const decodedName = decodeURIComponent(nameWithoutExtension);
        const arabicInDecoded = decodedName.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g);
        
        if (arabicInDecoded && arabicInDecoded.length > 0) {
          const longestArabic = arabicInDecoded.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
          
          if (longestArabic.length > 2) {
            const cleanArabic = longestArabic
              .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (cleanArabic.length > 2) {
              console.log(`📁 BookForm: extracted Arabic name from decoded: ${cleanArabic}`);
              return cleanArabic;
            }
          }
        }
      } catch (e) {
        // تجاهل أخطاء فك الترميز
      }
      
      // 3. البحث في جميع أجزاء الاسم كسلسلة واحدة (مثل UrlContentForm)
      const fullName = fileName.toString();
      const decodedFullName = decodeURIComponent(fullName);
      const arabicMatchesFull = decodedFullName.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g);
      
      if (arabicMatchesFull && arabicMatchesFull.length > 0) {
        // اختيار أطول تطابق عربي
        const longestArabic = arabicMatchesFull.reduce((longest, current) => 
          current.length > longest.length ? current : longest
        );
        
        if (longestArabic.length > 3) {
          const cleanArabic = longestArabic
            .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanArabic.length > 3) {
            console.log(`📁 BookForm: extracted Arabic name from full name: ${cleanArabic}`);
            return cleanArabic;
          }
        }
      }
      
      // 4. إذا كان الاسم يحتوي على كلمات إنجليزية مفيدة، نحاول استخراجها
      const englishWords = nameWithoutExtension.match(/[a-zA-Z]+/g);
      if (englishWords && englishWords.length > 0) {
        // تجاهل الكلمات القصيرة جداً أو الشائعة
        const meaningfulWords = englishWords.filter(word => 
          word.length > 3 && 
          !commonEnglishWords.includes(word.toLowerCase()) &&
          !word.match(/^(temp|tmp|cache|upload|download)$/i)
        );
        
        if (meaningfulWords.length > 0) {
          // اختيار أطول كلمة إنجليزية مفيدة
          const longestEnglish = meaningfulWords.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
          
          console.log(`📁 BookForm: extracted meaningful English name: ${longestEnglish}`);
          return longestEnglish;
        }
      }
      
      console.log(`📁 BookForm: no meaningful name extracted from: ${fileName}`);
      return null;
      
    } catch (error) {
      console.error(`📁 BookForm: error extracting name from file:`, error);
      return null;
    }
  };

  // دالة خاصة لاستخراج الأسماء من الملفات المشتركة من التطبيقات الخارجية
  const extractNameFromExternalSharedFile = (sharedFile) => {
    try {
      console.log('📁 BookForm: extracting name from external shared file:', sharedFile);
      
      // محاولة استخراج اسم من URI إذا كان من تيليجرام
      if (sharedFile.uri && sharedFile.uri.includes('Telegram')) {
        const uriParts = sharedFile.uri.split('/');
        const lastPart = uriParts[uriParts.length - 1];
        if (lastPart && lastPart.includes('%')) {
          try {
            const decodedName = decodeURIComponent(lastPart);
            console.log('📁 BookForm: decoded name from Telegram URI:', decodedName);
            
            // محاولة استخراج اسم عربي من الاسم المستخرج
            const arabicName = extractArabicNameFromFile(decodedName, sharedFile.mimeType);
            if (arabicName && arabicName.length > 2) {
              console.log('📁 BookForm: extracted Arabic name from Telegram URI:', arabicName);
              return arabicName;
            }
            
            // إذا لم يكن هناك اسم عربي، استخدم الاسم المستخرج كما هو
            const cleanName = decodedName.replace(/\.[^/.]+$/, ''); // إزالة الامتداد
            if (cleanName.length > 3) {
              console.log('📁 BookForm: using decoded name from Telegram URI:', cleanName);
              return cleanName;
            }
          } catch (e) {
            console.log('📁 BookForm: failed to decode Telegram URI name:', e.message);
          }
        }
      }
      
      // محاولة استخراج اسم من اسم الملف الأصلي
      if (sharedFile.name && sharedFile.name !== 'external_shared_file_1754184855015.mp4') {
        const arabicName = extractArabicNameFromFile(sharedFile.name, sharedFile.mimeType);
        if (arabicName && arabicName.length > 2) {
          console.log('📁 BookForm: extracted Arabic name from original file name:', arabicName);
          return arabicName;
        }
      }
      
      // إذا لم نتمكن من استخراج اسم، استخدم اسم افتراضي
      const timestamp = new Date().toISOString().slice(0, 10);
      const mimeType = sharedFile.mimeType || '';
      const typePrefix = mimeType.startsWith('audio/') ? 'صوت' : 
                       mimeType.startsWith('video/') ? 'فيديو' : 
                       mimeType.startsWith('text/') ? 'نص' : 'ملف';
      
      let extension = '';
      if (mimeType.startsWith('audio/')) {
        if (mimeType.includes('mp3')) extension = '.mp3';
        else if (mimeType.includes('wav')) extension = '.wav';
        else if (mimeType.includes('ogg')) extension = '.ogg';
        else if (mimeType.includes('aac')) extension = '.aac';
        else if (mimeType.includes('m4a')) extension = '.m4a';
        else extension = '.mp3';
      } else if (mimeType.startsWith('video/')) {
        if (mimeType.includes('mp4')) extension = '.mp4';
        else if (mimeType.includes('mkv')) extension = '.mkv';
        else if (mimeType.includes('avi')) extension = '.avi';
        else if (mimeType.includes('webm')) extension = '.webm';
        else extension = '.mp4';
      } else if (mimeType.startsWith('text/')) {
        extension = '.txt';
      } else if (mimeType.includes('pdf')) {
        extension = '.pdf';
      } else if (mimeType.includes('doc')) {
        extension = '.doc';
      }
      
      const defaultName = `${typePrefix}_مشترك_${timestamp}${extension}`;
      console.log('📁 BookForm: using default name for external shared file:', defaultName);
      return defaultName;
      
    } catch (error) {
      console.error('📁 BookForm: error extracting name from external shared file:', error);
      return null;
    }
  };

  // دالة لتحميل الأقسام المختارة مؤخراً
  const loadLastUsedCategories = async () => {
    try {
      const lastCategories = await AsyncStorage.getItem('lastUsedCategories');
      if (lastCategories) {
        const parsed = JSON.parse(lastCategories);
        setLastUsedCategories(parsed);
        console.log('📁 BookForm: loaded last used categories:', parsed);
      }
    } catch (error) {
      console.error('📁 BookForm: Error loading last used categories:', error);
    }
  };

  // دالة لحفظ الأقسام المختارة مؤخراً
  const saveLastUsedCategories = async (mainCat, subCat, subSubCat) => {
    try {
      const categoriesToSave = {
        mainCategory: mainCat,
        subCategory: subCat,
        subSubCategory: subSubCat
      };
      await AsyncStorage.setItem('lastUsedCategories', JSON.stringify(categoriesToSave));
      setLastUsedCategories(categoriesToSave);
      console.log('📁 BookForm: saved last used categories:', categoriesToSave);
    } catch (error) {
      console.error('📁 BookForm: Error saving last used categories:', error);
    }
  };

  // تعريف fetchCategories كدالة داخلية
  const fetchCategories = async () => {
    try {
      console.log('📁 BookForm: fetching categories from Firebase...');
      const querySnapshot = await getDocs(collection(db, 'categories'));
      const categoriesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('📁 BookForm: categories fetched successfully:', categoriesData.length);
      
      setTimeout(() => {
        setCategories(categoriesData);
        
        if (editMode && editingContent) {
          console.log('📁 BookForm: updating subcategories for edit mode after categories fetch');
        }
      }, 50);
    } catch (error) {
      console.error('📁 BookForm: Error fetching categories:', error);
    }
  };

  const fetchContents = async () => {
    try {
      console.log('📁 BookForm: fetching contents from Firebase...');
      const querySnapshot = await getDocs(collection(db, 'books'));
      const contentsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('📁 BookForm: contents fetched successfully:', contentsData.length);
      setTimeout(() => {
        setContents(contentsData);
      }, 50);
    } catch (error) {
      console.error('📁 BookForm: Error fetching contents:', error);
    }
  };

  // فحص الصلاحيات والملف المشترك
  useEffect(() => {
    console.log('📁 BookForm: checking permissions and shared file', { 
      isAdmin, 
      hasSharedFile: !!sharedFile, 
      editContent: !!editContent,
      uploadType: uploadType,
      source: sharedFile?.source
    });
    
    setTimeout(() => {
      if (isAdmin === false && !sharedFile && !editContent) {
        console.log('📁 BookForm: User not admin and no shared file or edit content - showing error message');
      }
    }, 50);
  }, [isAdmin, sharedFile, editContent, uploadType]);

  // تحميل البيانات عند بدء التطبيق
  useEffect(() => {
    fetchCategories();
    fetchContents();
    loadLastUsedCategories(); // تحميل الأقسام المختارة مؤخراً
  }, []);

  useEffect(() => {
    if (editContent) {
      setTimeout(() => {
        setEditMode(true);
        setEditingContent(editContent);
        setContentName(editContent.bookName);
        setContentUrl(editContent.bookUrl);
        setMainCategory(editContent.mainCategory);
        setSubCategory(editContent.subCategory);
        setSubSubCategory(editContent.subSubCategory || '');
        setContentType(editContent.contentType || 'book');
      }, 50);
    }
  }, [editContent]);

  // عند استقبال ملف مشترك (من تطبيق خارجي)
  useEffect(() => {
    async function handleSharedFile() {
      if (!sharedFile) {
        console.log('📁 BookForm: sharedFile is null/undefined - waiting for file to load');
        return;
      }
      
      console.log('📁 BookForm: processing EXTERNAL shared file:', {
        uri: sharedFile.uri,
        name: sharedFile.name,
        mimeType: sharedFile.mimeType,
        hasUri: !!sharedFile.uri,
        source: sharedFile.source
      });
      
      if (sharedFile && sharedFile.uri) {
        // منع المعالجة المتكررة للملف نفسه
        if (processedSharedFile && processedSharedFile.uri === sharedFile.uri) {
          console.log('📁 BookForm: الملف تم معالجته مسبقاً، تجاهل المعالجة المتكررة');
          return;
        }
        
        if (loading) {
          console.log('📁 BookForm: معالجة ملف أخرى جارية، انتظار...');
          return;
        }
        
        console.log('📁 BookForm: استقبلت ملف مشترك من تطبيق خارجي', sharedFile);
        setProcessedSharedFile(sharedFile);
        setUploadType('external'); // تحديد نوع الإضافة
        
        setTimeout(() => {
          // تحسين استخراج اسم الملف من الملفات المشتركة من التطبيقات الخارجية
          let fileName = sharedFile.name || sharedFile.uri.split('/').pop() || 'sharedfile';
          
          // إذا كان الملف من تطبيق خارجي، استخدم نفس منطق النموذج الداخلي
          if (sharedFile.source === 'external_app' || sharedFile.uri.includes('content://')) {
            // استخدام نفس منطق استخراج الأسماء العربية مثل النموذج الداخلي
            const arabicName = extractArabicNameFromFile(fileName, sharedFile.mimeType);
            if (arabicName && arabicName.length > 2) {
              const extension = fileName.split('.').pop() || '';
              fileName = `${arabicName}.${extension}`;
              console.log('📁 BookForm: using extracted Arabic name for external shared file:', arabicName);
            } else {
              // إذا لم نتمكن من استخراج اسم عربي، استخدم الاسم الأصلي
              console.log('📁 BookForm: using original name for external shared file:', fileName);
            }
          } else {
            // للملفات غير الخارجية، استخدم الطريقة القديمة
            const arabicName = extractArabicNameFromFile(fileName, sharedFile.mimeType);
            if (arabicName && arabicName.length > 2) {
              const extension = fileName.split('.').pop() || '';
              fileName = `${arabicName}.${extension}`;
              console.log('📁 BookForm: using Arabic name for non-external file:', arabicName);
            }
          }
          
          console.log('📁 BookForm: final file name set to:', fileName);
          setContentName(fileName);
          
          // تحديد النوع تلقائيًا حسب الامتداد أو mimeType
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const mimeType = sharedFile.mimeType || '';
          let correctedMimeType = mimeType;
          if (mimeType === 'audio/mp4') {
            correctedMimeType = 'audio/m4a';
          }
          
          let contentType = 'book';
          if (correctedMimeType.startsWith('video/') || ["mp4","mkv","mov","avi","webm","3gp","flv"].includes(ext)) {
            contentType = 'video';
          } else if (correctedMimeType.startsWith('audio/') || ["mp3","wav","ogg","aac","m4a","flac","wma"].includes(ext)) {
            contentType = 'audio';
          } else if (correctedMimeType.startsWith('text/') || ext === 'txt') {
            contentType = 'book';
          } else if (ext === 'pdf' || correctedMimeType.includes('pdf')) {
            contentType = 'book';
          }
          
          console.log('📁 BookForm: setting content type to:', contentType);
          setContentType(contentType);
        }, 50);
      } else {
        console.log('📁 BookForm: لم يتم استقبال ملف مشترك أو الملف غير صالح');
      }
    }
    
    handleSharedFile();
  }, [sharedFile]);

  // عند استقبال ملف من FileUploader (من داخل التطبيق)
  useEffect(() => {
    if (selectedFile && selectedFile.uri) {
      console.log('📁 BookForm: processing INTERNAL selected file:', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        mimeType: selectedFile.mimeType,
        source: selectedFile.source
      });
      
      setUploadType('internal'); // تحديد نوع الإضافة
      
      // تحديد النوع تلقائياً
      const ext = selectedFile.name?.split('.').pop()?.toLowerCase() || '';
      const mimeType = selectedFile.mimeType || '';
      if (mimeType.startsWith('video/') || ["mp4","mkv","mov","avi","webm","3gp","flv"].includes(ext)) {
        setContentType('video');
      } else if (mimeType.startsWith('audio/') || ["mp3","wav","ogg","aac","m4a","flac","wma"].includes(ext)) {
        setContentType('audio');
      } else if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'pdf') {
        setContentType('book');
      } else {
        setContentType('book');
      }
      
      // تحسين استخراج اسم الملف من الملفات المختارة من داخل التطبيق
      setTimeout(() => {
        let fileName = selectedFile.name || selectedFile.uri.split('/').pop() || 'selectedfile';
        
        // استخدام نفس منطق استخراج الأسماء العربية
        const arabicName = extractArabicNameFromFile(fileName, selectedFile.mimeType);
        if (arabicName && arabicName.length > 2) {
          const extension = fileName.split('.').pop() || '';
          fileName = `${arabicName}.${extension}`;
          console.log('📁 BookForm: using extracted Arabic name for internal file:', arabicName);
        } else {
          console.log('📁 BookForm: using original name for internal file:', fileName);
        }
        
        console.log('📁 BookForm: final internal file name set to:', fileName);
        setContentName(fileName);
      }, 50);
    }
  }, [selectedFile]);

  // إذا كان المستخدم ليس مشرفاً أو لا يوجد ملف مشترك، اعرض رسالة خطأ
  if (isAdmin === false && !sharedFile && !editContent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#e74c3c', textAlign: 'center', marginBottom: 20 }}>
          لا تملك صلاحيات لإضافة محتوى
        </Text>
        <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>
          يجب أن تكون مشرفاً لإضافة محتوى جديد
        </Text>
        {onClose && (
          <TouchableOpacity
            style={{
              backgroundColor: '#197278',
              padding: 15,
              borderRadius: 8,
              minWidth: 150,
              alignItems: 'center'
            }}
            onPress={onClose}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
              العودة
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // إضافة فحص إضافي - إذا كان sharedFile undefined، اعرض رسالة انتظار
  if (sharedFile === undefined && onClose && !editContent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#197278', textAlign: 'center', marginBottom: 20 }}>
          جاري تحميل الملف المشترك...
        </Text>
        <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>
          يرجى الانتظار
        </Text>
      </View>
    );
  }

  useEffect(() => {
    if (mainCategory) {
      const subs = categories.filter(cat => cat.mainCategory === mainCategory);
      // إضافة تأخير آمن لمنع كراش Reanimated عند تحديث الحالة
      setTimeout(() => {
        // إزالة الفلتر لمنع إخفاء الأقسام الفارغة
        let subCategoriesToShow = subs.map(cat => cat.subCategory || '');
        
        // في وضع التعديل، تأكد من ظهور الأقسام الفرعية المرتبطة بالمحتوى المحرر
        if (editMode && editingContent && editingContent.subCategory) {
          if (!subCategoriesToShow.includes(editingContent.subCategory)) {
            subCategoriesToShow.push(editingContent.subCategory);
            console.log('📁 BookForm: Added editing content subcategory to display:', editingContent.subCategory);
          }
        }
        
        // إذا لم توجد أقسام فرعية في قاعدة البيانات، أضف القسم الفرعي الحالي
        if (subs.length === 0 && editingContent && editingContent.subCategory) {
          subCategoriesToShow.push(editingContent.subCategory);
          console.log('📁 BookForm: Added missing subcategory to display:', editingContent.subCategory);
        }
        
        // تأكد من عدم تكرار القسم الفرعي
        subCategoriesToShow = [...new Set(subCategoriesToShow)];
        setSubCategories(subCategoriesToShow);
        
        // عدم إعادة تعيين القسم الفرعي إذا كان في وضع التعديل
        if (!editMode) {
          setSubCategory(''); // إعادة تعيين القسم الفرعي
          setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
        } else {
          console.log('📁 BookForm: Skipping subcategory reset during edit mode');
          // في وضع التعديل، تأكد من ظهور الأقسام الفرعية المرتبطة بالقسم الرئيسي الحالي
          if (editingContent && editingContent.subCategory) {
            console.log('📁 BookForm: Ensuring subcategory visibility for edit mode:', editingContent.subCategory);
          }
        }
      }, 50);
    } else {
      // إضافة تأخير آمن لمنع كراش Reanimated عند تحديث الحالة
      setTimeout(() => {
        setSubCategories([]);
        if (!editMode) {
          setSubCategory(''); // إعادة تعيين القسم الفرعي
          setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
        } else {
          console.log('📁 BookForm: Skipping subcategory reset during edit mode (no main category)');
        }
      }, 50);
    }
  }, [mainCategory, categories, editMode, editingContent]);

  useEffect(() => {
    if (mainCategory && subCategory) {
      const subSubs = categories.filter(cat => 
        cat.mainCategory === mainCategory && cat.subCategory === subCategory
      );
      // إضافة تأخير آمن لمنع كراش Reanimated عند تحديث الحالة
      setTimeout(() => {
        // إزالة الفلتر لمنع إخفاء الأقسام الفارغة
        let subSubCategoriesToShow = subSubs.map(cat => cat.subSubCategory || '');
        
        // في وضع التعديل، تأكد من ظهور الأقسام الفرعية الثانوية المرتبطة بالمحتوى المحرر
        if (editMode && editingContent && editingContent.subSubCategory) {
          if (!subSubCategoriesToShow.includes(editingContent.subSubCategory)) {
            subSubCategoriesToShow.push(editingContent.subSubCategory);
            console.log('📁 BookForm: Added editing content sub-subcategory to display:', editingContent.subSubCategory);
          }
        }
        
        // إذا لم توجد أقسام فرعية ثانوية في قاعدة البيانات، أضف القسم الفرعي الثانوي الحالي
        if (subSubs.length === 0 && editingContent && editingContent.subSubCategory) {
          subSubCategoriesToShow.push(editingContent.subSubCategory);
          console.log('📁 BookForm: Added missing sub-subcategory to display:', editingContent.subSubCategory);
        }
        
        // تأكد من عدم تكرار القسم الفرعي الثانوي
        subSubCategoriesToShow = [...new Set(subSubCategoriesToShow)];
        setSubSubCategories(subSubCategoriesToShow);
        
        // عدم إعادة تعيين القسم الفرعي الثانوي إذا كان في وضع التعديل
        if (!editMode) {
          setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
        } else {
          console.log('📁 BookForm: Skipping sub-subcategory reset during edit mode');
          // في وضع التعديل، تأكد من ظهور الأقسام الفرعية الثانوية المرتبطة بالقسم الفرعي الحالي
          if (editingContent && editingContent.subSubCategory) {
            console.log('📁 BookForm: Ensuring sub-subcategory visibility for edit mode:', editingContent.subSubCategory);
          }
        }
      }, 50);
    } else {
      // إضافة تأخير آمن لمنع كراش Reanimated عند تحديث الحالة
      setTimeout(() => {
        setSubSubCategories([]);
        if (!editMode) {
          setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
        } else {
          console.log('📁 BookForm: Skipping sub-subcategory reset during edit mode (no sub category)');
        }
      }, 50);
    }
  }, [mainCategory, subCategory, categories, editMode, editingContent]);

  const handleAddContent = async () => {
    // التحقق من الحقول الإلزامية
    if (!contentName || !mainCategory || !subCategory || !subSubCategory) {
      let missingFields = [];
      if (!contentName) missingFields.push('اسم المحتوى');
      if (!mainCategory) missingFields.push('القسم الرئيسي');
      if (!subCategory) missingFields.push('القسم الفرعي');
      if (!subSubCategory) missingFields.push('القسم الفرعي الثانوي');
      Alert.alert('حقول مطلوبة', `يرجى تعبئة الحقول التالية:\n• ${missingFields.join('\n• ')}`);
      setLoading(false);
      return;
    }

    // التحقق من وجود ملف (إما مشترك أو مختار أو رابط موجود)
    if (!sharedFile && !selectedFile && !contentUrl && !isAdmin) {
      Alert.alert('ملف مطلوب', 'يرجى اختيار ملف أو مشاركة ملف لإضافته.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    setProgressMessage('جاري التحضير...');
    
    try {
      // فحص الاتصال بـ Firebase قبل بدء العملية
      console.log('📁 BookForm: checking Firebase connection...');
      setProgressMessage('جاري التحقق من الاتصال...');
      try {
        const testQuery = query(collection(db, 'books'), limit(1));
        await getDocs(testQuery);
        console.log('📁 BookForm: Firebase connection verified');
        setProgressMessage('تم التحقق من الاتصال');
      } catch (connectionError) {
        console.error('📁 BookForm: Firebase connection failed:', connectionError);
        throw new Error('فشل في الاتصال بقاعدة البيانات. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.');
      }
      
      let finalContentUrl = contentUrl;
      
      // =============== معالجة الملف المشترك (من تطبيق خارجي) ===============
      if (sharedFile && !contentUrl && (uploadType === 'external' || sharedFile.source === 'external_app')) {
        console.log('📁 BookForm: Processing EXTERNAL SHARED FILE');
        console.log('📁 BookForm: External file details:', {
          uri: sharedFile.uri,
          name: sharedFile.name,
          mimeType: sharedFile.mimeType,
          source: sharedFile.source
        });
        
        setProgressMessage('جاري معالجة الملف المشترك من التطبيق الخارجي...');
        
        const result = await handleExternalFileUpload(sharedFile, contentName);
        finalContentUrl = result.url;
        setContentUrl(finalContentUrl);
      }
      
      // =============== معالجة الملف المختار (من داخل التطبيق) ===============
      if (selectedFile && !contentUrl && (uploadType === 'internal' || selectedFile.source === 'internal')) {
        console.log('📁 BookForm: Processing INTERNAL SELECTED FILE');
        console.log('📁 BookForm: Internal file details:', {
          uri: selectedFile.uri,
          name: selectedFile.name,
          mimeType: selectedFile.mimeType,
          source: selectedFile.source
        });
        
        setProgressMessage('جاري معالجة الملف المختار من داخل التطبيق...');
        
        const result = await handleInternalFileUpload(selectedFile, contentName);
        finalContentUrl = result.url;
        setContentUrl(finalContentUrl);
      }
      
      // =============== حفظ المحتوى في Firebase ===============
      if (finalContentUrl) {
        setProgressMessage('جاري حفظ المحتوى...');
        setUploadProgress(90);
        
        const contentData = {
          bookName: contentName,
          bookUrl: finalContentUrl,
          mainCategory: mainCategory,
          subCategory: subCategory,
          subSubCategory: subSubCategory,
          contentType: contentType,
          uploadType: uploadType, // حفظ نوع الإضافة
          source: sharedFile?.source || selectedFile?.source || 'manual', // حفظ مصدر الملف
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        console.log('📁 BookForm: saving content to Firebase:', contentData);
        
        const docRef = await addDoc(collection(db, 'books'), contentData);
        console.log('📁 BookForm: content saved successfully with ID:', docRef.id);
        
        // إنشاء الأقسام في جدول Category إذا لم تكن موجودة
        await createCategoriesIfNotExist(mainCategory, subCategory, subSubCategory);
        
        // إنشاء الأقسام في Realm المحلي أيضاً
        if (dataService?.createCategoriesInRealm) {
          await dataService.createCategoriesInRealm(mainCategory, subCategory, subSubCategory);
        }
        
        // حفظ الأقسام المختارة مؤخراً
        await saveLastUsedCategories(mainCategory, subCategory, subSubCategory);
        
        setProgressMessage('تم حفظ المحتوى بنجاح');
        setUploadProgress(100);
        
        // إعادة تعيين النموذج
        resetForm();
        
        // إشعار النجاح
        Alert.alert(
          'نجح الإضافة',
          `تم إضافة "${contentName}" بنجاح!`,
          [{ text: 'حسناً', onPress: () => {
            if (onBookAdded) onBookAdded();
            if (onStatsChanged) onStatsChanged();
            if (onClose) onClose();
          }}]
        );
      } else {
        throw new Error('لم يتم الحصول على رابط الملف بعد الرفع');
      }
      
    } catch (error) {
      console.error('❌ Error in handleAddContent:', error);
      setLoading(false);
      setUploadProgress(0);
      setProgressMessage('');
      
      // رسائل خطأ محسنة ومفصلة
      let errorMessage = 'حدث خطأ أثناء إضافة المحتوى';
      
      if (error.message.includes('فشل في الاتصال')) {
        errorMessage = error.message;
      } else if (error.message.includes('فشل في رفع الملف')) {
        errorMessage = 'فشل في رفع الملف. تأكد من أن الملف صالح وحجمه مناسب.';
      } else if (error.message.includes('فشل في قراءة الملف')) {
        errorMessage = 'فشل في قراءة الملف. تأكد من أن الملف غير تالف.';
      } else if (error.message.includes('فشل في إنشاء blob')) {
        errorMessage = 'فشل في معالجة الملف. جرب ملف أصغر أو صيغة مختلفة.';
      } else if (error.message.includes('الملف كبير جداً')) {
        errorMessage = `الملف كبير جداً. الحد الأقصى هو 2GB. حجم الملف الحالي: ${Math.round((sharedFile?.size || selectedFile?.size || 0) / (1024 * 1024 * 1024))}GB`;
      } else if (error.message.includes('لم يتم الحصول على رابط')) {
        errorMessage = 'فشل في الحصول على رابط الملف بعد الرفع. يرجى المحاولة مرة أخرى.';
      } else if (error.message.includes('فشل في نسخ الملف')) {
        errorMessage = 'فشل في نسخ الملف من التطبيق الخارجي. تأكد من أن الملف متاح.';
      } else if (error.message.includes('فشل في معالجة')) {
        errorMessage = 'فشل في معالجة الملف. جرب ملف آخر أو أعد تشغيل التطبيق.';
      } else if (error.message.includes('HTTP error')) {
        errorMessage = 'خطأ في الاتصال بالخادم. تأكد من اتصال الإنترنت.';
      } else if (error.message.includes('Network request failed')) {
        errorMessage = 'فشل في الاتصال بالشبكة. تحقق من اتصال الإنترنت.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'انتهت مهلة الاتصال. جرب مرة أخرى أو استخدم ملف أصغر.';
      } else if (error.message.includes('permission')) {
        errorMessage = 'لا توجد صلاحية للوصول للملف. تأكد من إعطاء الصلاحيات المطلوبة.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'الملف غير موجود أو تم حذفه. جرب ملف آخر.';
      } else if (error.message.includes('access denied')) {
        errorMessage = 'تم رفض الوصول للملف. تأكد من الصلاحيات.';
      } else {
        // رسالة عامة مع تفاصيل الخطأ للمطورين
        errorMessage = `حدث خطأ غير متوقع: ${error.message}`;
      }
      
      Alert.alert('خطأ في الإضافة', errorMessage);
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setProgressMessage('');
    }
  };

  // =============== دالة معالجة الملف المشترك (من تطبيق خارجي) ===============
  const handleExternalFileUpload = async (sharedFile, fileName) => {
    console.log('📁 BookForm: handleExternalFileUpload - Processing external shared file');
    
    let fileUri = sharedFile.uri;
    let tempPath = fileUri;
    let finalFileName = fileName || sharedFile.name || sharedFile.uri.split('/').pop() || 'sharedfile';
    
    console.log('📁 BookForm: external shared file details:', {
      uri: fileUri,
      name: finalFileName,
      mimeType: sharedFile.mimeType,
      size: sharedFile.size
    });
    
    // التعامل مع content:// URIs (من تطبيقات خارجية)
    if (fileUri.startsWith('content://')) {
      console.log('📁 BookForm: Processing content:// URI from external app');
      const tempDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
      const tempFileName = `temp_external_shared_${Date.now()}.${finalFileName.split('.').pop() || 'tmp'}`;
      tempPath = `${tempDir}/${tempFileName}`;
      
      console.log('📁 BookForm: copying content:// file to temp path:', tempPath);
      
      try {
        // محاولة نسخ الملف باستخدام ReactNativeBlobUtil
        await ReactNativeBlobUtil.fs.cp(fileUri, tempPath);
        console.log('📁 BookForm: external file copied successfully using ReactNativeBlobUtil');
        
        // التحقق من أن الملف تم نسخه بنجاح
        const tempFileInfo = await ReactNativeBlobUtil.fs.stat(tempPath);
        console.log('📁 BookForm: temp file size after copy:', tempFileInfo.size, 'bytes');
        
        if (tempFileInfo.size === 0) {
          throw new Error('الملف المنسوخ فارغ - قد يكون الملف الأصلي تالفاً');
        }
        
      } catch (error) {
        console.error('Error copying external content:// file with ReactNativeBlobUtil:', error);
        
        // محاولة بديلة: استخدام طريقة أخرى للنسخ
        try {
          console.log('📁 BookForm: trying alternative copy method for external file');
          const fileData = await ReactNativeBlobUtil.fs.readFile(fileUri, 'base64');
          await ReactNativeBlobUtil.fs.writeFile(tempPath, fileData, 'base64');
          console.log('📁 BookForm: external file copied successfully using alternative method');
        } catch (altError) {
          console.error('Alternative copy method also failed:', altError);
          throw new Error('فشل في نسخ الملف المشترك من التطبيق الخارجي: ' + error.message);
        }
      }
    } else if (fileUri.startsWith('file://')) {
      fileUri = fileUri.replace('file://', '');
      tempPath = fileUri;
      console.log('📁 BookForm: using external file:// path directly:', tempPath);
    }
    
    // تحويل الملف إذا كان صوتي أو فيديو
    let finalTempPath = tempPath;
    let finalMimeType = sharedFile.mimeType;
    
    // تم إزالة مكتبات تحويل الصوتيات والفيديوهات - سيتم رفع الملف كما هو
    
    // رفع الملف المشترك من التطبيق الخارجي
    try {
      const result = await uploadFileToFirebase(finalTempPath, finalFileName, finalMimeType, 'external');
      
      // تنظيف الملف المؤقت إذا كان تم إنشاؤه
      if (tempPath !== sharedFile.uri && tempPath.includes('temp_external_shared_')) {
        try {
          await ReactNativeBlobUtil.fs.unlink(tempPath);
          console.log('📁 BookForm: temp external file cleaned up successfully');
        } catch (cleanupError) {
          console.warn('📁 BookForm: failed to cleanup temp external file:', cleanupError.message);
        }
      }
      
      return result;
    } catch (uploadError) {
      // تنظيف الملف المؤقت في حالة فشل الرفع
      if (tempPath !== sharedFile.uri && tempPath.includes('temp_external_shared_')) {
        try {
          await ReactNativeBlobUtil.fs.unlink(tempPath);
          console.log('📁 BookForm: temp external file cleaned up after upload failure');
        } catch (cleanupError) {
          console.warn('📁 BookForm: failed to cleanup temp external file after upload failure:', cleanupError.message);
        }
      }
      throw uploadError;
    }
  };

  // =============== دالة معالجة الملف المختار (من داخل التطبيق) ===============
  const handleInternalFileUpload = async (selectedFile, fileName) => {
    console.log('📁 BookForm: handleInternalFileUpload - Processing internal selected file');
    
    let fileUri = selectedFile.uri;
    let tempPath = fileUri;
    let finalFileName = fileName || selectedFile.name || 'selectedfile';
    
    console.log('📁 BookForm: internal selected file details:', {
      uri: fileUri,
      name: finalFileName,
      mimeType: selectedFile.mimeType,
      size: selectedFile.size
    });
    
    // التعامل مع content:// URIs (من داخل التطبيق)
    if (fileUri.startsWith('content://')) {
      console.log('📁 BookForm: Processing content:// URI from internal app');
      const tempDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
      const tempFileName = `temp_internal_selected_${Date.now()}.${finalFileName.split('.').pop() || 'tmp'}`;
      tempPath = `${tempDir}/${tempFileName}`;
      
      try {
        await ReactNativeBlobUtil.fs.cp(fileUri, tempPath);
        console.log('📁 BookForm: internal selected file copied successfully');
        
        // التحقق من أن الملف تم نسخه بنجاح
        const tempFileInfo = await ReactNativeBlobUtil.fs.stat(tempPath);
        console.log('📁 BookForm: temp internal file size after copy:', tempFileInfo.size, 'bytes');
        
        if (tempFileInfo.size === 0) {
          throw new Error('الملف المنسوخ فارغ - قد يكون الملف الأصلي تالفاً');
        }
        
      } catch (error) {
        console.error('Error copying internal content:// file:', error);
        
        // محاولة بديلة: استخدام طريقة أخرى للنسخ
        try {
          console.log('📁 BookForm: trying alternative copy method for internal file');
          const fileData = await ReactNativeBlobUtil.fs.readFile(fileUri, 'base64');
          await ReactNativeBlobUtil.fs.writeFile(tempPath, fileData, 'base64');
          console.log('📁 BookForm: internal file copied successfully using alternative method');
        } catch (altError) {
          console.error('Alternative copy method also failed for internal file:', altError);
          throw new Error('فشل في نسخ الملف المختار من داخل التطبيق: ' + error.message);
        }
      }
    } else if (fileUri.startsWith('file://')) {
      fileUri = fileUri.replace('file://', '');
      tempPath = fileUri;
      console.log('📁 BookForm: using internal file:// path directly:', tempPath);
    }
    
    // تحويل الملف إذا كان صوتي أو فيديو
    let finalTempPath = tempPath;
    let finalMimeType = selectedFile.mimeType;
    
    // تم إزالة مكتبات تحويل الصوتيات والفيديوهات - سيتم رفع الملف كما هو
    
    // رفع الملف المختار من داخل التطبيق
    try {
      const result = await uploadFileToFirebase(finalTempPath, finalFileName, finalMimeType, 'internal');
      
      // تنظيف الملف المؤقت إذا كان تم إنشاؤه
      if (tempPath !== selectedFile.uri && tempPath.includes('temp_internal_selected_')) {
        try {
          await ReactNativeBlobUtil.fs.unlink(tempPath);
          console.log('📁 BookForm: temp internal file cleaned up successfully');
        } catch (cleanupError) {
          console.warn('📁 BookForm: failed to cleanup temp internal file:', cleanupError.message);
        }
      }
      
      return result;
    } catch (uploadError) {
      // تنظيف الملف المؤقت في حالة فشل الرفع
      if (tempPath !== selectedFile.uri && tempPath.includes('temp_internal_selected_')) {
        try {
          await ReactNativeBlobUtil.fs.unlink(tempPath);
          console.log('📁 BookForm: temp internal file cleaned up after upload failure');
        } catch (cleanupError) {
          console.warn('📁 BookForm: failed to cleanup temp internal file after upload failure:', cleanupError.message);
        }
      }
      throw uploadError;
    }
  };

  // =============== دالة رفع الملف إلى Firebase (محسنة للملفات الكبيرة جداً) ===============
  const uploadFileToFirebase = async (filePath, fileName, mimeType, fileType) => {
    console.log(`📁 BookForm: uploadFileToFirebase - Uploading ${fileType} file:`, {
      path: filePath,
      name: fileName,
      mimeType: mimeType
    });
    
    try {
      // فحص حجم الملف
      const fileInfo = await ReactNativeBlobUtil.fs.stat(filePath);
      const fileSize = fileInfo.size;
      
      console.log(`📁 BookForm: ${fileType} file size:`, fileSize, 'bytes (', Math.round(fileSize / (1024 * 1024)), 'MB)');
      
      // فحص حجم الملف - تحسين للملفات الكبيرة جداً
      const maxFileSize = 2 * 1024 * 1024 * 1024; // 2GB - زيادة الحد الأقصى للملفات الكبيرة جداً
      if (fileSize > maxFileSize) {
        throw new Error(`الملف كبير جداً (${Math.round(fileSize / (1024 * 1024 * 1024))}GB). الحد الأقصى هو 2GB.`);
      }
      
      const timestamp = Date.now();
      const storageRef = ref(storage, `uploads/${timestamp}_${fileName}`);
      
      setProgressMessage(`جاري رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}...`);
      
      // للملفات الكبيرة جداً (> 500MB)، استخدم طريقة مختلفة
      if (fileSize > 500 * 1024 * 1024) {
        console.log(`📁 BookForm: Very large ${fileType} file detected (${Math.round(fileSize / (1024 * 1024))}MB), using enhanced chunked upload`);
        return await uploadLargeFile(filePath, fileName, mimeType, storageRef, fileType);
      } else if (fileSize > 100 * 1024 * 1024) {
        console.log(`📁 BookForm: Large ${fileType} file detected (${Math.round(fileSize / (1024 * 1024))}MB), using chunked upload`);
        return await uploadLargeFile(filePath, fileName, mimeType, storageRef, fileType);
      } else {
        console.log(`📁 BookForm: Regular ${fileType} file (${Math.round(fileSize / (1024 * 1024))}MB), using standard upload`);
        return await uploadRegularFile(filePath, fileName, mimeType, storageRef, fileType);
      }
      
    } catch (error) {
      console.error(`Error in uploadFileToFirebase for ${fileType} file:`, error);
      throw new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`);
    }
  };

  // =============== دالة رفع الملفات العادية ===============
  const uploadRegularFile = async (filePath, fileName, mimeType, storageRef, fileType) => {
    console.log(`📁 BookForm: uploadRegularFile - Uploading regular ${fileType} file`);
    
    try {
      // فحص حجم الملف
      const fileInfo = await ReactNativeBlobUtil.fs.stat(filePath);
      const fileSize = fileInfo.size;
      
      console.log(`📁 BookForm: Regular ${fileType} file size:`, fileSize, 'bytes (', Math.round(fileSize / (1024 * 1024)), 'MB)');
      
      // تصحيح mimeType إذا لزم الأمر
      let correctedMimeType = mimeType || 'application/octet-stream';
      if (correctedMimeType === 'audio/mp4') {
        correctedMimeType = 'audio/m4a';
      }
      
      // رفع الملف مباشرة من المسار
      setProgressMessage(`جاري رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}...`);
      
      // استخدام طريقة الرفع المباشر من الملف بدون إنشاء blob
      console.log(`📁 BookForm: using direct file upload method for ${fileType} file`);
      
      // استخدام طريقة الرفع المباشر من الملف بدون إنشاء blob
      console.log(`📁 BookForm: using direct file upload method for ${fileType} file`);
      
      // رفع الملف مباشرة من المسار بدون قراءته في الذاكرة
      const uploadTask = uploadBytesResumable(storageRef, filePath, correctedMimeType);
      
      // مراقبة التقدم
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          setProgressMessage(`جاري رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}... ${Math.round(progress)}%`);
        },
        (error) => {
          console.error(`Upload error for ${fileType} file:`, error);
          throw new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log(`📁 BookForm: ${fileType} file uploaded successfully, URL:`, downloadURL);
            
            return {
              url: downloadURL,
              fileName: fileName,
              mimeType: correctedMimeType,
              size: fileSize
            };
          } catch (error) {
            console.error(`Error getting download URL for ${fileType} file:`, error);
            throw new Error(`فشل في الحصول على رابط ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`);
          }
        }
      );
      
      // انتظار اكتمال الرفع
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
            setProgressMessage(`جاري رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}... ${Math.round(progress)}%`);
          },
          (error) => {
            console.error(`Upload error for ${fileType} file:`, error);
            reject(new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`));
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              console.log(`📁 BookForm: ${fileType} file uploaded successfully, URL:`, downloadURL);
              
              resolve({
                url: downloadURL,
                fileName: fileName,
                mimeType: correctedMimeType,
                size: fileSize
              });
            } catch (error) {
              console.error(`Error getting download URL for ${fileType} file:`, error);
              reject(new Error(`فشل في الحصول على رابط ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`));
            }
          }
        );
      });
      
    } catch (error) {
      console.error(`Error uploading regular ${fileType} file:`, error);
      throw new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'}: ${error.message}`);
    }
  };

  // دالة مساعدة للحصول على token المصادقة (إذا كان مطلوباً)
  const getAuthToken = async () => {
    // إذا كنت تستخدم Firebase Auth، يمكنك الحصول على token هنا
    // return await firebase.auth().currentUser?.getIdToken();
    return null; // إذا لم تكن تستخدم مصادقة
  };

  // =============== دالة رفع الملفات الكبيرة جداً ===============
  const uploadLargeFile = async (filePath, fileName, mimeType, storageRef, fileType) => {
    console.log(`📁 BookForm: uploadLargeFile - Uploading very large ${fileType} file`);
    
    try {
      // فحص حجم الملف
      const fileInfo = await ReactNativeBlobUtil.fs.stat(filePath);
      const fileSize = fileInfo.size;
      
      console.log(`📁 BookForm: Very large ${fileType} file size:`, fileSize, 'bytes (', Math.round(fileSize / (1024 * 1024)), 'MB)');
      
      setProgressMessage(`جاري معالجة ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'} الكبير جداً...`);
      
      // تصحيح mimeType إذا لزم الأمر
      let correctedMimeType = mimeType || 'application/octet-stream';
      if (correctedMimeType === 'audio/mp4') {
        correctedMimeType = 'audio/m4a';
      }
      
      // للملفات الكبيرة جداً، استخدم طريقة القراءة على أجزاء أصغر
      // للملفات الكبيرة جداً، استخدم طريقة الرفع المباشر بدون قراءة في الذاكرة
      console.log(`📁 BookForm: using direct upload for very large ${fileType} file to avoid memory issues`);
      
      // رفع الملف مباشرة من المسار بدون قراءته في الذاكرة
      const uploadTask = uploadBytesResumable(storageRef, filePath, correctedMimeType);
      
      uploadTaskRef.current = uploadTask;
      
      // انتظار اكتمال الرفع
      return new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
            setProgressMessage(`جاري رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'} الكبير جداً... ${Math.round(progress)}%`);
        },
        (error) => {
          console.error(`Upload error for very large ${fileType} file:`, error);
            reject(new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'} الكبير جداً: ${error.message}`));
        },
        async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              console.log(`📁 BookForm: Very large ${fileType} file uploaded successfully, URL:`, downloadURL);
              
              resolve({
                url: downloadURL,
                fileName: fileName,
                mimeType: correctedMimeType,
                size: fileSize
              });
            } catch (error) {
              console.error(`Error getting download URL for very large ${fileType} file:`, error);
              reject(new Error(`فشل في الحصول على رابط ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'} الكبير جداً: ${error.message}`));
            }
          }
        );
      });
      
    } catch (error) {
      console.error(`Error uploading very large ${fileType} file:`, error);
      throw new Error(`فشل في رفع ${fileType === 'external' ? 'الملف المشترك من التطبيق الخارجي' : 'الملف المختار من داخل التطبيق'} الكبير جداً: ${error.message}`);
    }
  };

  // زر إلغاء الرفع
  const handleCancelUpload = () => {
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      setLoading(false);
      setUploadProgress(0);
      uploadTaskRef.current = null;
      Alert.alert('تم الإلغاء', 'تم إلغاء رفع الملف.');
    }
  };

  const handleUpdateContent = async (overrideObj) => {
    try {
      console.log('📁 BookForm: attempting to update document in Firebase...');
      const contentRef = doc(db, 'books', editingContent.id);
      
      const updateObj = overrideObj || {
        bookName: contentName,
        updatedAt: new Date(),
      };
      
      console.log('📁 BookForm: updating with object:', updateObj);
      
      await updateDoc(contentRef, updateObj);
      console.log('📁 BookForm: document updated successfully - name only');
      
      Alert.alert('تم التحديث', 'تم تحديث اسم المحتوى بنجاح!');
      await fetchContents();
      
      try {
        console.log('📁 BookForm: triggering immediate local sync after content update');
        if (forceSyncNewData) {
          await forceSyncNewData();
          console.log('📁 BookForm: local sync completed successfully after update');
        }
      } catch (syncError) {
        console.error('📁 BookForm: local sync failed after update:', syncError);
      }
      
      setEditMode(false);
      setEditingContent(null);
      resetForm();
      if (onStatsChanged) onStatsChanged();
    } catch (error) {
      console.error('📁 BookForm: Firebase error during document update:', error);
      
      let errorMessage = 'حدث خطأ أثناء تحديث المحتوى';
      if (error.code === 'permission-denied') {
        errorMessage = 'ليس لديك صلاحية لتحديث المحتوى. يرجى التحقق من صلاحياتك.';
      } else if (error.code === 'not-found') {
        errorMessage = 'المحتوى غير موجود. قد يكون قد تم حذفه.';
      } else if (error.code === 'network-request-failed') {
        errorMessage = 'فشل في الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('خطأ', errorMessage);
      throw error;
    }
  };

  const handleDeleteContent = async (content) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف هذا المحتوى؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              if (content.bookUrl && content.bookUrl.startsWith('https://')) {
                try {
                  const fileName = content.bookUrl.split('/').pop().split('?')[0];
                  const fileRef = ref(storage, fileName);
                  await deleteObject(fileRef);
                } catch (e) { /* قد يكون الملف غير موجود */ }
              }
              await deleteDoc(doc(db, 'books', content.id));
              await fetchContents();
              
              try {
                console.log('📁 BookForm: triggering immediate local sync after content deletion');
                if (forceSyncNewData) {
                  await forceSyncNewData();
                  console.log('📁 BookForm: local sync completed successfully after deletion');
                }
              } catch (syncError) {
                console.error('📁 BookForm: local sync failed after deletion:', syncError);
              }
              
              Alert.alert('تم الحذف', 'تم حذف المحتوى بنجاح');
            } catch (error) {
              Alert.alert('خطأ', 'حدث خطأ أثناء حذف المحتوى');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEdit = (content) => {
    setTimeout(() => {
      setEditMode(true);
      setEditingContent(content);
      
      setContentName(content.bookName);
      setContentUrl(content.bookUrl);
      setMainCategory(content.mainCategory);
      setSubCategory(content.subCategory);
      setSubSubCategory(content.subSubCategory || '');
      setContentType(content.contentType || 'book');
      
      if (content.mainCategory) {
        const subs = categories.filter(cat => cat.mainCategory === content.mainCategory);
        let subCategoriesToShow = subs.map(cat => cat.subCategory || '');
        
        if (subs.length === 0 && content.subCategory) {
          subCategoriesToShow.push(content.subCategory);
          console.log('📁 BookForm: Added missing subcategory to display:', content.subCategory);
        }
        
        subCategoriesToShow = [...new Set(subCategoriesToShow)];
        setSubCategories(subCategoriesToShow);
      }
      
      if (content.mainCategory && content.subCategory) {
        const subSubs = categories.filter(cat => 
          cat.mainCategory === content.mainCategory && cat.subCategory === content.subCategory
        );
        let subSubCategoriesToShow = subSubs.map(cat => cat.subSubCategory || '');
        
        if (subSubs.length === 0 && content.subSubCategory) {
          subSubCategoriesToShow.push(content.subSubCategory);
          console.log('📁 BookForm: Added missing sub-subcategory to display:', content.subSubCategory);
        }
        
        subSubCategoriesToShow = [...new Set(subSubCategoriesToShow)];
        setSubSubCategories(subSubCategoriesToShow);
      }
      
      console.log('📁 BookForm: Edit mode activated - name only editing');
    }, 50);
  };

  const resetForm = () => {
    setTimeout(() => {
      setContentName('');
      setContentUrl('');
      
      if (!editMode) {
        // تطبيق الأقسام المختارة مؤخراً إذا كانت متاحة
        if (lastUsedCategories.mainCategory && lastUsedCategories.subCategory && lastUsedCategories.subSubCategory) {
          setMainCategory(lastUsedCategories.mainCategory);
          setSubCategory(lastUsedCategories.subCategory);
          setSubSubCategory(lastUsedCategories.subSubCategory);
          console.log('📁 BookForm: applied last used categories:', lastUsedCategories);
        } else {
          setMainCategory('');
          setSubCategory('');
          setSubSubCategory('');
        }
      } else {
        console.log('📁 BookForm: Skipping category reset during edit mode');
      }
      
      setContentType('book');
      setEditMode(false);
      setEditingContent(null);
      setSelectedFile(null);
      setProcessedSharedFile(null); // تنظيف الملف المشترك المعالج
      setUploadProgress(0);
      setProgressMessage('');
      setUploadType(null); // إعادة تعيين نوع الإضافة
      uploadTaskRef.current = null;
      
      console.log('📁 BookForm: form reset completed, sharedFile preserved:', !!sharedFile);
    }, 50);
  };

  const getContentTypeLabel = (type) => {
    switch (type) {
      case 'book':
        return 'كتاب';
      case 'video':
        return 'فيديو';
      case 'audio':
        return 'صوت';
      default:
        return 'كتاب';
    }
  };

  // تطبيق الأقسام المختارة مؤخراً عند بدء النموذج لأول مرة
  useEffect(() => {
    if (categories.length > 0 && lastUsedCategories.mainCategory && !editMode && !mainCategory) {
      console.log('📁 BookForm: attempting to apply last used categories:', lastUsedCategories);
      
      // تطبيق القسم الرئيسي أولاً
      setMainCategory(lastUsedCategories.mainCategory);
      console.log('📁 BookForm: applied main category:', lastUsedCategories.mainCategory);
      
      // تحديث الأقسام الفرعية
      const subs = categories.filter(cat => cat.mainCategory === lastUsedCategories.mainCategory);
      const subCategoriesList = subs.map(cat => cat.subCategory).filter(cat => cat && cat.trim() !== '');
      setSubCategories(subCategoriesList);
      console.log('📁 BookForm: updated sub categories:', subCategoriesList);
      
      // تطبيق القسم الفرعي إذا كان متاحاً
      if (lastUsedCategories.subCategory && subCategoriesList.includes(lastUsedCategories.subCategory)) {
        setTimeout(() => {
          setSubCategory(lastUsedCategories.subCategory);
          console.log('📁 BookForm: applied sub category:', lastUsedCategories.subCategory);
          
          // تحديث الأقسام الفرعية الثانوية
          const subSubs = categories.filter(cat => 
            cat.mainCategory === lastUsedCategories.mainCategory && 
            cat.subCategory === lastUsedCategories.subCategory
          );
          const subSubCategoriesList = subSubs.map(cat => cat.subSubCategory).filter(cat => cat && cat.trim() !== '');
          setSubSubCategories(subSubCategoriesList);
          console.log('📁 BookForm: updated sub-sub categories:', subSubCategoriesList);
          
          // تطبيق القسم الفرعي الثانوي إذا كان متاحاً
          if (lastUsedCategories.subSubCategory && subSubCategoriesList.includes(lastUsedCategories.subSubCategory)) {
            setTimeout(() => {
              setSubSubCategory(lastUsedCategories.subSubCategory);
              console.log('📁 BookForm: applied sub-sub category:', lastUsedCategories.subSubCategory);
              console.log('📁 BookForm: categories applied successfully');
            }, 200);
          }
        }, 200);
      }
    }
  }, [categories, lastUsedCategories, editMode, mainCategory]);

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
    >
      {/* زر إغلاق يدوي أعلى النموذج */}
      {onClose && (
        <View style={{ alignItems: 'flex-end', marginBottom: 10 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, backgroundColor: '#e53935', borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>إغلاق</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* رسالة خطأ إذا لم يكن المستخدم مشرفاً وليس هناك ملف مشترك أو محتوى للتعديل */}
      {isAdmin === false && !sharedFile && !editContent && (
        <View style={{ backgroundColor: '#ffebee', padding: 15, borderRadius: 8, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#d32f2f' }}>
          <Text style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: 16 }}>⚠️ خطأ في الصلاحيات</Text>
          <Text style={{ color: '#d32f2f', fontSize: 14, marginTop: 5 }}>
            عذراً، لا يمكنك الوصول إلى هذه الصفحة. يجب أن تكون مشرفاً لإضافة محتوى جديد.
          </Text>
        </View>
      )}
      
      {/* رسالة الملف المشترك من تطبيق خارجي */}
      {sharedFile && uploadType === 'external' && (
        <View style={{ backgroundColor: '#fff3cd', padding: 15, borderRadius: 8, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#ffc107' }}>
          <Text style={{ color: '#856404', fontWeight: 'bold', fontSize: 16 }}>📁 ملف مشترك من تطبيق خارجي</Text>
          <Text style={{ color: '#856404', fontSize: 14, marginTop: 5 }}>
            تم استقبال الملف: {sharedFile.name || 'ملف غير محدد'}
          </Text>
          <Text style={{ color: '#28a745', fontSize: 14, marginTop: 5 }}>
            ✅ الملف جاهز للإضافة! يرجى تعديل العنوان إذا أردت واختيار الأقسام المناسبة.
          </Text>
        </View>
      )}
      
      {/* رسالة الملف المختار من داخل التطبيق */}
      {selectedFile && uploadType === 'internal' && (
        <View style={{ backgroundColor: '#e8f5e8', padding: 15, borderRadius: 8, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#28a745' }}>
          <Text style={{ color: '#155724', fontWeight: 'bold', fontSize: 16 }}>📁 ملف مختار من داخل التطبيق</Text>
          <Text style={{ color: '#155724', fontSize: 14, marginTop: 5 }}>
            تم اختيار الملف: {selectedFile.name || 'ملف غير محدد'}
          </Text>
          <Text style={{ color: '#28a745', fontSize: 14, marginTop: 5 }}>
            ✅ الملف جاهز للإضافة! يرجى تعديل العنوان إذا أردت واختيار الأقسام المناسبة.
          </Text>
        </View>
      )}
      
      {/* عرض النموذج إذا كان المستخدم مشرفاً أو كان هناك ملف مشترك أو محتوى للتعديل */}
      {(isAdmin === true || sharedFile || editContent) && (
        <View style={styles.formBox}>
          <Text style={styles.label}>نوع المحتوى *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={contentType} onValueChange={value => { setContentType(value); }} style={styles.picker}>
              <Picker.Item label="كتاب" value="book" />
              <Picker.Item label="فيديو" value="video" />
              <Picker.Item label="صوت" value="audio" />
            </Picker>
          </View>

          <Text style={styles.label}>
            اسم {getContentTypeLabel(contentType)} *
            {(sharedFile || selectedFile) && (
              <Text style={{ color: '#666', fontSize: 14, fontWeight: 'normal' }}>
                {' '}(يمكنك تعديل الاسم المقترح)
              </Text>
            )}
          </Text>
          <TextInput 
            style={[
              styles.input, 
              (sharedFile || selectedFile) && contentName && { 
                backgroundColor: '#e8f5e8', 
                borderColor: '#28a745',
                borderWidth: 2 
              }
            ]} 
            value={contentName} 
            onChangeText={setContentName} 
            placeholder={(sharedFile || selectedFile) ? 'عدل الاسم حسب رغبتك' : `اسم ${getContentTypeLabel(contentType)}`} 
            textAlign="right" 
            editable={true}
          />

          {/* عرض FileUploader فقط إذا لم يكن هناك ملف مشترك */}
          {!sharedFile && (
            <>
              {(contentType === 'video' || contentType === 'audio') && (
                <View style={{ marginBottom: 16 }}>
                  <FileUploader
                    fileType={contentType}
                    onFileUploaded={setSelectedFile}
                  />
                </View>
              )}
              {(contentType === 'book') && (
                <View style={{ marginBottom: 16 }}>
                  <FileUploader
                    fileType="book"
                    onFileUploaded={setSelectedFile}
                  />
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>القسم الرئيسي *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={mainCategory} onValueChange={setMainCategory} style={styles.picker} enabled={!editMode}>
              <Picker.Item label="اختر القسم الرئيسي" value="" />
              {[...new Set(categories
                .map(cat => cat.mainCategory)
                .filter(cat => cat && cat.trim() !== '')
              )].map((cat, idx) => (
                <Picker.Item key={`main-${cat}-${idx}`} label={cat} value={cat} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>القسم الفرعي *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={subCategory} onValueChange={setSubCategory} style={styles.picker} enabled={!editMode && !!mainCategory}>
              <Picker.Item label="اختر القسم الفرعي" value="" />
              {[...new Set(subCategories
              )].map((cat, idx) => (
                <Picker.Item key={`sub-${cat}-${idx}`} label={cat || '(فارغ)'} value={cat} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>القسم الفرعي الثانوي *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={subSubCategory} onValueChange={setSubSubCategory} style={styles.picker} enabled={!editMode && !!subCategory}>
              <Picker.Item label="اختر القسم الفرعي الثانوي..." value="" />
              {[...new Set(subSubCategories
              )].map((cat, idx) => (
                <Picker.Item key={`subsub-${cat}-${idx}`} label={cat || '(فارغ)'} value={cat} />
              ))}
            </Picker>
          </View>

          {/* مؤشر التقدم */}
          {loading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${uploadProgress}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {progressMessage || `${Math.round(uploadProgress)}%`}
              </Text>
              <Text style={styles.progressPercentage}>
                {Math.round(uploadProgress)}%
              </Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.addButton, loading && styles.disabledButton]}
              onPress={handleAddContent} 
              disabled={loading} 
            >
              <Text style={styles.addButtonText}>
                {loading ? (
                  progressMessage ? (
                    progressMessage
                  ) : (
                  uploadProgress > 0 ? (
                      `جاري الرفع... ${Math.round(uploadProgress)}%`
                  ) : (
                    "جاري المعالجة..."
                    )
                  )
                ) : (
                  editMode ? "تحديث المحتوى" : "إضافة المحتوى"
                )}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* زر إلغاء الرفع منفصل لضمان ظهوره بالكامل */}
          {loading && uploadProgress > 0 && (
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#dc3545',
                  padding: 15,
                  borderRadius: 8,
                  minWidth: 200,
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: '#dc3545',
                  elevation: 3,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3.84,
                }}
                onPress={handleCancelUpload}
              >
                <Text style={{ 
                  color: '#fff', 
                  fontSize: 16, 
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  ⏹️ إلغاء الرفع
                </Text>
              </TouchableOpacity>
            </View>
          )}
          
          {editMode && !loading && (
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={resetForm}
              >
                <Text style={styles.cancelButtonText}>إلغاء التحرير</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {(sharedFile || selectedFile) && (
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
              <Text style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
                ⬆️ قم بالتمرير للأعلى لتعديل البيانات
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 100,
  },
  formBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#197278',
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  addButton: {
    backgroundColor: '#197278',
    padding: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  disabledButton: {
    backgroundColor: '#ddd',
  },
  cancelButton: {
    backgroundColor: '#888',
    padding: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  progressBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#197278',
    borderRadius: 5,
    transition: 'width 0.3s ease',
  },
  progressText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
    fontWeight: '500',
  },
  progressPercentage: {
    color: '#999',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 5,
    fontWeight: '400',
  },
});

// =============== دالة إنشاء الأقسام في جدول Category ===============
const createCategoriesIfNotExist = async (mainCategory, subCategory, subSubCategory) => {
  try {
    console.log('📂 Creating categories in Category table if not exist:', { mainCategory, subCategory, subSubCategory });
    
    // إنشاء القسم الرئيسي إذا لم يكن موجوداً
    if (mainCategory && mainCategory.trim()) {
      const mainCategoryQuery = query(
        collection(db, 'categories'), 
        where('mainCategory', '==', mainCategory.trim())
      );
      const mainCategorySnap = await getDocs(mainCategoryQuery);
      
      if (mainCategorySnap.empty) {
        await addDoc(collection(db, 'categories'), {
          mainCategory: mainCategory.trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`📂 Created main category: ${mainCategory.trim()}`);
      }
    }
    
    // إنشاء القسم الفرعي إذا لم يكن موجوداً
    if (subCategory && subCategory.trim()) {
      const subCategoryQuery = query(
        collection(db, 'categories'), 
        where('mainCategory', '==', mainCategory.trim()),
        where('subCategory', '==', subCategory.trim())
      );
      const subCategorySnap = await getDocs(subCategoryQuery);
      
      if (subCategorySnap.empty) {
        await addDoc(collection(db, 'categories'), {
          mainCategory: mainCategory.trim(),
          subCategory: subCategory.trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`📂 Created sub category: ${mainCategory.trim()} > ${subCategory.trim()}`);
      }
    }
    
    // إنشاء القسم الفرعي الثانوي إذا لم يكن موجوداً
    if (subSubCategory && subSubCategory.trim()) {
      const subSubCategoryQuery = query(
        collection(db, 'categories'), 
        where('mainCategory', '==', mainCategory.trim()),
        where('subCategory', '==', subCategory.trim()),
        where('subSubCategory', '==', subSubCategory.trim())
      );
      const subSubCategorySnap = await getDocs(subSubCategoryQuery);
      
      if (subSubCategorySnap.empty) {
        await addDoc(collection(db, 'categories'), {
          mainCategory: mainCategory.trim(),
          subCategory: subCategory.trim(),
          subSubCategory: subSubCategory.trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`📂 Created sub-sub category: ${mainCategory.trim()} > ${subCategory.trim()} > ${subSubCategory.trim()}`);
      }
    }
    
    console.log('📂 Categories creation completed successfully');
  } catch (error) {
    console.error('❌ Error creating categories:', error);
    // لا نريد أن نوقف العملية إذا فشل إنشاء الأقسام
  }
};