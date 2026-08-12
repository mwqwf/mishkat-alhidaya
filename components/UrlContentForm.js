import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import AppSettingsContext from '../AppSettingsContext';
import { isYouTubeUrl, validateYouTubeUrl } from '../utils/youtubeHelper';
import { useData } from '../context/DataContext';
import dataService from '../services/dataService';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * نموذج إضافة المحتوى عبر الروابط (UrlContentForm)
 * 
 * هذا النموذج مخصص لإضافة المحتوى عبر الروابط فقط:
 * - روابط YouTube
 * - روابط الفيديوهات الأخرى
 * - روابط الصوتيات
 * - روابط الملفات الأخرى
 * 
 * لا يستخدم هذا النموذج للملفات المحلية - استخدم BookForm بدلاً من ذلك
 */
// وظيفة لتحليل أعمق للرابط واستخراج الاسم العربي
const deepAnalyzeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    
    // 1. البحث في query parameters عن الكلمات العربية
    const searchParams = urlObj.searchParams;
    const allParams = Array.from(searchParams.entries());
    
    for (const [key, value] of allParams) {
      // فك ترميز القيمة أولاً
      const decodedValue = decodeURIComponent(value);
      const arabicChars = decodedValue.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
      if (arabicChars && arabicChars.length > 2) {
        const cleanValue = decodedValue
          .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanValue.length > 3) {
          return cleanValue;
        }
      }
    }
    
    // 2. البحث في pathname عن الكلمات العربية
    const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
    
    for (const segment of pathSegments) {
      // فك ترميز القطعة أولاً
      const decodedSegment = decodeURIComponent(segment);
      const arabicChars = decodedSegment.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
      if (arabicChars && arabicChars.length > 2) {
        const cleanSegment = decodedSegment
          .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanSegment.length > 3) {
          return cleanSegment;
        }
      }
    }
    
    // 3. البحث في fragment (بعد #)
    if (urlObj.hash) {
      const decodedHash = decodeURIComponent(urlObj.hash);
      const arabicChars = decodedHash.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
      if (arabicChars && arabicChars.length > 2) {
        const cleanHash = decodedHash
          .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanHash.length > 3) {
          return cleanHash;
        }
      }
    }
    
    // 4. البحث في جميع أجزاء الرابط كسلسلة واحدة
    const fullUrl = url.toString();
    const decodedFullUrl = decodeURIComponent(fullUrl);
    const arabicMatches = decodedFullUrl.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g);
    
    if (arabicMatches && arabicMatches.length > 0) {
      // اختيار أطول تطابق عربي
      const longestArabic = arabicMatches.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      );
      
      if (longestArabic.length > 3) {
        const cleanArabic = longestArabic
          .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanArabic.length > 3) {
          return cleanArabic;
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

// وظيفة لاستخراج اسم الملف من الرابط
const extractFileNameFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    
    // محاولة استخراج من query parameters أولاً (غالباً يحتوي على الاسم العربي)
    const searchParams = urlObj.searchParams;
    const title = searchParams.get('title') || searchParams.get('name') || searchParams.get('file') || 
                  searchParams.get('filename') || searchParams.get('document');
    
    if (title) {
      const decodedTitle = decodeURIComponent(title);
      const cleanTitle = decodedTitle
        .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // الحفاظ على الحروف العربية فقط
        .replace(/\s+/g, ' ') // استبدال المسافات المتعددة بمسافة واحدة
        .trim();
      
      if (cleanTitle.length > 2) {
        return cleanTitle;
      }
    }
    
    if (filename && filename.includes('.')) {
      // إزالة امتداد الملف
      const nameWithoutExtension = filename.split('.').slice(0, -1).join('.');
      const decodedName = decodeURIComponent(nameWithoutExtension);
      
      // تنظيف الاسم مع التركيز على الحروف العربية
      const cleanName = decodedName
        .replace(/[_-]/g, ' ') // استبدال الشرطات والشرطات السفلية بمسافات
        .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // الحفاظ على الحروف العربية فقط
        .replace(/\s+/g, ' ') // استبدال المسافات المتعددة بمسافة واحدة
        .trim();
      
      if (cleanName.length > 2) {
        return cleanName;
      }
    }
    
    // محاولة استخراج من pathname بدون امتداد
    const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
    if (pathSegments.length > 0) {
      // البحث عن الجزء الذي يحتوي على حروف عربية
      for (let i = pathSegments.length - 1; i >= 0; i--) {
        const segment = pathSegments[i];
        const decodedSegment = decodeURIComponent(segment);
        const arabicChars = decodedSegment.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
        
        if (arabicChars && arabicChars.length > 0) {
          const cleanSegment = decodedSegment
            .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanSegment.length > 2) {
            return cleanSegment;
          }
        }
      }
      
      // إذا لم نجد حروف عربية، استخدم آخر جزء
      const lastSegment = pathSegments[pathSegments.length - 1];
      const decodedLastSegment = decodeURIComponent(lastSegment);
      const cleanSegment = decodedLastSegment
        .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanSegment.length > 2) {
        return cleanSegment;
      }
    }
    
    // محاولة استخراج من hostname إذا كان يحتوي على كلمات عربية
    const hostname = urlObj.hostname;
    const decodedHostname = decodeURIComponent(hostname);
    const arabicInHostname = decodedHostname.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
    if (arabicInHostname && arabicInHostname.length > 0) {
      const cleanHostname = decodedHostname
        .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanHostname.length > 2) {
        return cleanHostname;
      }
    }
    
    return 'محتوى جديد';
  } catch (error) {
    return 'محتوى جديد';
  }
};

// وظيفة لتحديد نوع المحتوى من الرابط
const detectContentTypeFromUrl = (url) => {
  const lowerUrl = url.toLowerCase();
  
  // فحص امتدادات الفيديو
  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.ogv'];
  if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
    return 'video';
  }
  
  // فحص امتدادات الصوت
  const audioExtensions = ['.mp3', '.wav', '.aac', '.ogg', '.wma', '.flac', '.m4a', '.opus', '.amr'];
  if (audioExtensions.some(ext => lowerUrl.includes(ext))) {
    return 'audio';
  }
  
  // فحص امتدادات الكتب
  const bookExtensions = ['.pdf', '.epub', '.mobi', '.doc', '.docx', '.txt', '.rtf', '.odt'];
  if (bookExtensions.some(ext => lowerUrl.includes(ext))) {
    return 'book';
  }
  
  // فحص روابط يوتيوب
  if (isYouTubeUrl(url)) {
    return 'video';
  }
  
  // فحص كلمات مفتاحية في الرابط
  const videoKeywords = ['video', 'فيديو', 'movie', 'film', 'stream', 'play'];
  if (videoKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return 'video';
  }
  
  const audioKeywords = ['audio', 'صوت', 'podcast', 'music', 'song', 'track', 'sound'];
  if (audioKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return 'audio';
  }
  
  const bookKeywords = ['book', 'كتاب', 'document', 'pdf', 'epub', 'read', 'قراءة'];
  if (bookKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return 'book';
  }
  
  // فحص domains معروفة
  const videoDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv'];
  if (videoDomains.some(domain => lowerUrl.includes(domain))) {
    return 'video';
  }
  
  const audioDomains = ['soundcloud.com', 'spotify.com', 'podbean.com', 'anchor.fm'];
  if (audioDomains.some(domain => lowerUrl.includes(domain))) {
    return 'audio';
  }
  
  const bookDomains = ['scribd.com', 'issuu.com', 'slideshare.net', 'academia.edu'];
  if (bookDomains.some(domain => lowerUrl.includes(domain))) {
    return 'book';
  }
  
  // افتراضي
  return 'book';
};

// وظيفة لتحليل الرابط واستخراج المعلومات
const analyzeUrl = (url) => {
  // محاولة التحليل العميق أولاً للعثور على الأسماء العربية
  const deepAnalysis = deepAnalyzeUrl(url);
  const fileName = deepAnalysis || extractFileNameFromUrl(url);
  const contentType = detectContentTypeFromUrl(url);
  
  return {
    fileName,
    contentType
  };
};

export default function UrlContentForm({ onClose, onSuccess, editContent }) {
  const { isAdmin } = useContext(AppSettingsContext);
  const { forceSyncNewData } = useData();
  const [contentName, setContentName] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [contentType, setContentType] = useState('book');
  const [mainCategory, setMainCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [subSubCategories, setSubSubCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [isYouTubeLink, setIsYouTubeLink] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [categoriesApplied, setCategoriesApplied] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false); // إضافة متغير لتتبع تحميل الأقسام
  const [lastUsedCategories, setLastUsedCategories] = useState({
    mainCategory: '',
    subCategory: '',
    subSubCategory: ''
  });

  // دالة محسنة لتطبيق الأقسام المختارة مؤخراً
  const applyLastUsedCategories = useCallback(() => {
    if (categories.length > 0 && lastUsedCategories.mainCategory && !editMode && !categoriesApplied) {
      console.log('📁 UrlContentForm: applyLastUsedCategories called with:', lastUsedCategories);
      
      // تطبيق القسم الرئيسي
      setMainCategory(lastUsedCategories.mainCategory);
      
      // تحديث الأقسام الفرعية
      const subs = categories.filter(cat => cat.mainCategory === lastUsedCategories.mainCategory);
      const subCategoriesList = subs.map(cat => cat.subCategory).filter(cat => cat && cat.trim() !== '');
      setSubCategories(subCategoriesList);
      
      // تطبيق القسم الفرعي
      if (lastUsedCategories.subCategory && subCategoriesList.includes(lastUsedCategories.subCategory)) {
        setTimeout(() => {
          setSubCategory(lastUsedCategories.subCategory);
          
          // تحديث الأقسام الفرعية الثانوية
          const subSubs = categories.filter(cat => 
            cat.mainCategory === lastUsedCategories.mainCategory && 
            cat.subCategory === lastUsedCategories.subCategory
          );
          const subSubCategoriesList = subSubs.map(cat => cat.subSubCategory).filter(cat => cat && cat.trim() !== '');
          setSubSubCategories(subSubCategoriesList);
          
          // تطبيق القسم الفرعي الثانوي
          if (lastUsedCategories.subSubCategory && subSubCategoriesList.includes(lastUsedCategories.subSubCategory)) {
            setTimeout(() => {
              setSubSubCategory(lastUsedCategories.subSubCategory);
              setCategoriesApplied(true);
              setTimeout(() => {
                setCategoriesApplied(false);
              }, 5000);
              console.log('📁 UrlContentForm: all categories applied successfully from helper function');
            }, 200);
          } else {
            setCategoriesApplied(true);
            setTimeout(() => {
              setCategoriesApplied(false);
            }, 5000);
            console.log('📁 UrlContentForm: main and sub categories applied successfully from helper function');
          }
        }, 200);
      } else {
        setCategoriesApplied(true);
        setTimeout(() => {
          setCategoriesApplied(false);
        }, 5000);
        console.log('📁 UrlContentForm: only main category applied successfully from helper function');
      }
      
      return true;
    }
    return false;
  }, [categories, lastUsedCategories, editMode, categoriesApplied]);

  // دالة محسنة لتحميل الأقسام المختارة مؤخراً
  const loadLastUsedCategories = useCallback(async () => {
    try {
      const lastCategories = await AsyncStorage.getItem('lastUsedCategories');
      if (lastCategories) {
        const parsed = JSON.parse(lastCategories);
        setLastUsedCategories(parsed);
        console.log('📁 UrlContentForm: loaded last used categories:', parsed);
      }
    } catch (error) {
      console.error('📁 UrlContentForm: Error loading last used categories:', error);
    }
  }, []);

  // دالة محسنة لحفظ الأقسام المختارة مؤخراً
  const saveLastUsedCategories = useCallback(async (mainCat, subCat, subSubCat) => {
    try {
      const categoriesToSave = {
        mainCategory: mainCat,
        subCategory: subCat,
        subSubCategory: subSubCat
      };
      await AsyncStorage.setItem('lastUsedCategories', JSON.stringify(categoriesToSave));
      setLastUsedCategories(categoriesToSave);
      console.log('📁 UrlContentForm: saved last used categories:', categoriesToSave);
    } catch (error) {
      console.error('📁 UrlContentForm: Error saving last used categories:', error);
    }
  }, []);

  // تحميل البيانات الأولية
  useEffect(() => {
    const initializeForm = async () => {
      await loadLastUsedCategories();
      await fetchCategories();
      console.log('📁 UrlContentForm: form initialized');
    };
    
    initializeForm();
  }, [loadLastUsedCategories]);

  // تطبيق الأقسام المختارة مؤخراً عند تحميل الأقسام
  useEffect(() => {
    if (categories.length > 0 && !categoriesLoaded) {
      setCategoriesLoaded(true);
      console.log('📁 UrlContentForm: categories loaded, attempting to apply last used categories');
      
      // تأخير قصير لضمان استقرار الحالة
      setTimeout(() => {
        if (lastUsedCategories.mainCategory && !editMode && !mainCategory) {
          applyLastUsedCategories();
        }
      }, 500);
    }
  }, [categories, categoriesLoaded, applyLastUsedCategories, lastUsedCategories.mainCategory, editMode, mainCategory]);

  // تطبيق الأقسام المختارة مؤخراً عند تغيير الأقسام المحملة
  useEffect(() => {
    if (categories.length > 0 && lastUsedCategories.mainCategory && !editMode && !mainCategory && categoriesLoaded) {
      console.log('📁 UrlContentForm: attempting to apply last used categories after categories change');
      
      // تطبيق القسم الرئيسي
      setMainCategory(lastUsedCategories.mainCategory);
      
      // تحديث الأقسام الفرعية
      const subs = categories.filter(cat => cat.mainCategory === lastUsedCategories.mainCategory);
      const subCategoriesList = subs.map(cat => cat.subCategory).filter(cat => cat && cat.trim() !== '');
      setSubCategories(subCategoriesList);
      
      // تطبيق القسم الفرعي
      if (lastUsedCategories.subCategory && subCategoriesList.includes(lastUsedCategories.subCategory)) {
        setTimeout(() => {
          setSubCategory(lastUsedCategories.subCategory);
          
          // تحديث الأقسام الفرعية الثانوية
          const subSubs = categories.filter(cat => 
            cat.mainCategory === lastUsedCategories.mainCategory && 
            cat.subCategory === lastUsedCategories.subCategory
          );
          const subSubCategoriesList = subSubs.map(cat => cat.subSubCategory).filter(cat => cat && cat.trim() !== '');
          setSubSubCategories(subSubCategoriesList);
          
          // تطبيق القسم الفرعي الثانوي
          if (lastUsedCategories.subSubCategory && subSubCategoriesList.includes(lastUsedCategories.subSubCategory)) {
            setTimeout(() => {
              setSubSubCategory(lastUsedCategories.subSubCategory);
              setCategoriesApplied(true);
              setTimeout(() => {
                setCategoriesApplied(false);
              }, 5000);
              console.log('📁 UrlContentForm: all categories applied successfully');
            }, 200);
          } else {
            setCategoriesApplied(true);
            setTimeout(() => {
              setCategoriesApplied(false);
            }, 5000);
            console.log('📁 UrlContentForm: main and sub categories applied successfully');
          }
        }, 200);
      } else {
        setCategoriesApplied(true);
        setTimeout(() => {
          setCategoriesApplied(false);
        }, 5000);
        console.log('📁 UrlContentForm: only main category applied successfully');
      }
    }
  }, [categories, lastUsedCategories, editMode, mainCategory, categoriesLoaded]);

  useEffect(() => {
    if (editContent) {
      setEditMode(true);
      setContentName(editContent.bookName);
      setContentUrl(editContent.bookUrl);
      setMainCategory(editContent.mainCategory);
      setSubCategory(editContent.subCategory);
      setSubSubCategory(editContent.subSubCategory || '');
      setContentType(editContent.contentType || 'book');
      
      // حفظ الأقسام المختارة في حالة التحرير
      if (editContent.mainCategory && editContent.subCategory) {
        saveLastUsedCategories(editContent.mainCategory, editContent.subCategory, editContent.subSubCategory || '');
        console.log('📁 UrlContentForm: saved last used categories from edit mode:', {
          mainCategory: editContent.mainCategory,
          subCategory: editContent.subCategory,
          subSubCategory: editContent.subSubCategory || ''
        });
      }
    }
  }, [editContent, saveLastUsedCategories]);

  useEffect(() => {
    if (mainCategory) {
      const subs = categories.filter(cat => cat.mainCategory === mainCategory);
      setSubCategories(subs.map(cat => cat.subCategory));
      
      // لا نعيد تعيين القسم الفرعي إذا كان من الأقسام المختارة مؤخراً
      if (!lastUsedCategories.subCategory || lastUsedCategories.mainCategory !== mainCategory) {
        setSubCategory(''); // إعادة تعيين القسم الفرعي
        setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
      }
    } else {
      setSubCategories([]);
      setSubCategory(''); // إعادة تعيين القسم الفرعي
      setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
    }
  }, [mainCategory, categories, lastUsedCategories]);

  useEffect(() => {
    if (mainCategory && subCategory) {
      const subSubs = categories.filter(cat => 
        cat.mainCategory === mainCategory && cat.subCategory === subCategory
      );
      setSubSubCategories(subSubs.map(cat => cat.subSubCategory));
      
      // لا نعيد تعيين القسم الفرعي الثانوي إذا كان من الأقسام المختارة مؤخراً
      if (!lastUsedCategories.subSubCategory || 
          lastUsedCategories.mainCategory !== mainCategory || 
          lastUsedCategories.subCategory !== subCategory) {
        setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
      }
    } else {
      setSubSubCategories([]);
      setSubSubCategory(''); // إعادة تعيين القسم الفرعي الثانوي
    }
  }, [mainCategory, subCategory, categories, lastUsedCategories]);

  // التحقق من نوع الرابط عند تغيير الرابط
  useEffect(() => {
    if (contentUrl && contentUrl.trim()) {
      const isYouTube = isYouTubeUrl(contentUrl);
      setIsYouTubeLink(isYouTube);
      
      // تحليل الرابط واستخراج المعلومات تلقائياً
      const analysis = analyzeUrl(contentUrl);
      
      // تحديث اسم المحتوى إذا كان فارغاً أو تم الكشف التلقائي
      if (!contentName.trim() || autoDetected) {
        setContentName(analysis.fileName);
        setAutoDetected(true);
      }
      
      // تحديث نوع المحتوى إذا كان مختلفاً عن المكتشف
      if (analysis.contentType !== contentType) {
        setContentType(analysis.contentType);
        setAutoDetected(true);
      }
      
      // إذا كان الرابط من يوتيوب، تأكد من أن النوع هو فيديو
      if (isYouTube && contentType !== 'video') {
        setContentType('video');
        setAutoDetected(true);
      }
    } else {
      setIsYouTubeLink(false);
      setAutoDetected(false);
    }
  }, [contentUrl]);

  const fetchCategories = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'categories'));
      const categoriesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(categoriesData);
      console.log('📁 UrlContentForm: categories fetched successfully:', categoriesData.length);
    } catch (error) {
      console.error('خطأ في جلب الأقسام:', error);
      Alert.alert('خطأ', 'فشل في جلب الأقسام');
    }
  };

  const validateUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddContent = async () => {
    if (!contentName.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم المحتوى');
      return;
    }

    if (!contentUrl.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال رابط المحتوى');
      return;
    }

    if (!validateUrl(contentUrl)) {
      Alert.alert('خطأ', 'يرجى إدخال رابط صحيح');
      return;
    }

    if (!mainCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الرئيسي');
      return;
    }

    if (!subCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الفرعي');
      return;
    }

    if (!subSubCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الفرعي الثانوي');
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    setProgressMessage('جاري التحضير...');

    try {
      setProgressMessage('جاري التحقق من الرابط...');
      setUploadProgress(20);
      
      // التحقق من صحة رابط يوتيوب إذا كان من يوتيوب
      if (isYouTubeLink && !validateYouTubeUrl(contentUrl)) {
        Alert.alert('خطأ', 'رابط يوتيوب غير صحيح. يرجى التأكد من صحة الرابط.');
        return;
      }
      
      setProgressMessage('جاري إضافة المحتوى...');
      setUploadProgress(60);
      
      const contentData = {
        bookName: contentName.trim(),
        bookUrl: contentUrl.trim(),
        contentType: contentType,
        mainCategory: mainCategory,
        subCategory: subCategory,
        subSubCategory: subSubCategory || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isUrlContent: true, // علامة مميزة للمحتوى المضاف عبر الرابط
        source: 'url', // مصدر المحتوى
        isYouTube: isYouTubeLink // علامة إضافية لروابط يوتيوب
      };

      setProgressMessage('جاري حفظ المحتوى...');
      setUploadProgress(80);

      await addDoc(collection(db, 'books'), contentData);
      
              // إنشاء الأقسام في جدول Category إذا لم تكن موجودة
        await createCategoriesIfNotExist(mainCategory, subCategory, subSubCategory);
        
        // إنشاء الأقسام في Realm المحلي أيضاً
        if (dataService?.createCategoriesInRealm) {
          await dataService.createCategoriesInRealm(mainCategory, subCategory, subSubCategory);
        }
      
      // حفظ الأقسام المختارة مؤخراً
      await saveLastUsedCategories(mainCategory, subCategory, subSubCategory);
      console.log('📁 UrlContentForm: saved last used categories after content addition:', {
        mainCategory,
        subCategory,
        subSubCategory
      });
      
      // مزامنة فورية مع قاعدة البيانات المحلية
      try {
        console.log('📁 UrlContentForm: triggering immediate local sync after content addition');
        if (forceSyncNewData) {
          await forceSyncNewData();
          console.log('📁 UrlContentForm: local sync completed successfully');
        }
      } catch (syncError) {
        console.error('📁 UrlContentForm: local sync failed:', syncError);
        // لا نعرض خطأ للمستخدم لأن المزامنة قد تكون مؤجلة
      }
      
      setProgressMessage('تم الإضافة بنجاح!');
      setUploadProgress(100);
      
      const successMessage = isYouTubeLink 
        ? 'تم إضافة فيديو يوتيوب بنجاح! سيتم تشغيله عبر متصفح الويب المدمج.'
        : 'تم إضافة المحتوى عبر الرابط بنجاح!';
      
      Alert.alert('نجح', successMessage);
      resetForm();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('خطأ في إضافة المحتوى:', error);
      Alert.alert('خطأ', 'فشل في إضافة المحتوى');
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setProgressMessage('');
    }
  };

  const resetForm = () => {
    setContentName('');
    setContentUrl('');
    setContentType('book');
    
    // تطبيق الأقسام المختارة مؤخراً إذا كانت متاحة
    if (lastUsedCategories.mainCategory && lastUsedCategories.subCategory && lastUsedCategories.subSubCategory) {
      console.log('📁 UrlContentForm: resetForm - applying last used categories:', lastUsedCategories);
      
      // إعادة تعيين الأقسام أولاً
      setMainCategory('');
      setSubCategory('');
      setSubSubCategory('');
      setSubCategories([]);
      setSubSubCategories([]);
      
      // ثم تطبيق الأقسام المختارة مؤخراً بعد تأخير قصير
      setTimeout(() => {
        setMainCategory(lastUsedCategories.mainCategory);
        
        // تحديث الأقسام الفرعية
        const subs = categories.filter(cat => cat.mainCategory === lastUsedCategories.mainCategory);
        const subCategoriesList = subs.map(cat => cat.subCategory).filter(cat => cat && cat.trim() !== '');
        setSubCategories(subCategoriesList);
        
        // تطبيق القسم الفرعي
        if (lastUsedCategories.subCategory && subCategoriesList.includes(lastUsedCategories.subCategory)) {
          setTimeout(() => {
            setSubCategory(lastUsedCategories.subCategory);
            
            // تحديث الأقسام الفرعية الثانوية
            const subSubs = categories.filter(cat => 
              cat.mainCategory === lastUsedCategories.mainCategory && 
              cat.subCategory === lastUsedCategories.subCategory
            );
            const subSubCategoriesList = subSubs.map(cat => cat.subSubCategory).filter(cat => cat && cat.trim() !== '');
            setSubSubCategories(subSubCategoriesList);
            
            // تطبيق القسم الفرعي الثانوي
            if (lastUsedCategories.subSubCategory && subSubCategoriesList.includes(lastUsedCategories.subSubCategory)) {
              setTimeout(() => {
                setSubSubCategory(lastUsedCategories.subSubCategory);
                setCategoriesApplied(true);
                setTimeout(() => {
                  setCategoriesApplied(false);
                }, 5000);
                console.log('📁 UrlContentForm: categories applied successfully in resetForm');
              }, 200);
            }
          }, 200);
        }
      }, 100);
    } else {
      setMainCategory('');
      setSubCategory('');
      setSubSubCategory('');
      setSubCategories([]);
      setSubSubCategories([]);
    }
    
    setEditMode(false);
    setIsYouTubeLink(false);
    setAutoDetected(false);
  };

  const getContentTypeLabel = (type) => {
    switch (type) {
      case 'book': return 'كتاب';
      case 'audio': return 'ملف صوتي';
      case 'video': return 'ملف فيديو';
      case 'document': return 'مستند';
      default: return 'كتاب';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formContainer}>
        {/* معلومات توضيحية */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            💡 <Text style={styles.boldText}>ميزة جديدة:</Text> سيتم استخراج اسم المحتوى ونوعه تلقائياً من الرابط
          </Text>
          <Text style={styles.infoText}>
            🔍 <Text style={styles.boldText}>كشف ذكي:</Text> يركز على الأسماء العربية ويحاول استخراج الاسم الصحيح
          </Text>
          <Text style={styles.infoText}>
            📝 يمكنك تعديل المعلومات المستخرجة تلقائياً حسب الحاجة
          </Text>
          <Text style={styles.infoText}>
            🎯 يدعم الروابط المباشرة وروابط يوتيوب والمواقع المعروفة
          </Text>
          {lastUsedCategories.mainCategory && lastUsedCategories.subCategory && lastUsedCategories.subSubCategory && (
            <Text style={[styles.infoText, { color: '#28a745', fontWeight: 'bold' }]}>
              ✅ <Text style={styles.boldText}>الأقسام المختارة مؤخراً:</Text> تم حفظها وستتم تطبيقها تلقائياً
            </Text>
          )}
        </View>

        {/* رسالة مؤقتة عند تطبيق الأقسام تلقائياً */}
        {categoriesApplied && (
          <View style={[styles.infoContainer, { backgroundColor: '#d4edda', borderColor: '#c3e6cb' }]}>
            <Text style={[styles.infoText, { color: '#155724', fontWeight: 'bold' }]}>
              🎯 تم تطبيق الأقسام المختارة مؤخراً تلقائياً: {lastUsedCategories.mainCategory} → {lastUsedCategories.subCategory} → {lastUsedCategories.subSubCategory}
            </Text>
          </View>
        )}

        {/* زر تطبيق الأقسام يدوياً إذا لم يتم تطبيقها تلقائياً */}
        {lastUsedCategories.mainCategory && lastUsedCategories.subCategory && lastUsedCategories.subSubCategory && 
         (!mainCategory || !subCategory || !subSubCategory) && !categoriesApplied && (
          <View style={[styles.infoContainer, { backgroundColor: '#fff3cd', borderColor: '#ffeaa7' }]}>
            <Text style={[styles.infoText, { color: '#856404', fontWeight: 'bold' }]}>
              ⚠️ الأقسام المختارة مؤخراً متاحة ولكن لم يتم تطبيقها تلقائياً
            </Text>
            <TouchableOpacity 
              style={styles.analyzeButton}
              onPress={() => {
                // تطبيق الأقسام يدوياً
                setMainCategory(lastUsedCategories.mainCategory);
                
                // تحديث الأقسام الفرعية
                const subs = categories.filter(cat => cat.mainCategory === lastUsedCategories.mainCategory);
                const subCategoriesList = subs.map(cat => cat.subCategory).filter(cat => cat && cat.trim() !== '');
                setSubCategories(subCategoriesList);
                
                // تطبيق القسم الفرعي
                if (lastUsedCategories.subCategory && subCategoriesList.includes(lastUsedCategories.subCategory)) {
                  setSubCategory(lastUsedCategories.subCategory);
                  
                  // تحديث الأقسام الفرعية الثانوية
                  const subSubs = categories.filter(cat => 
                    cat.mainCategory === lastUsedCategories.mainCategory && 
                    cat.subCategory === lastUsedCategories.subCategory
                  );
                  const subSubCategoriesList = subSubs.map(cat => cat.subSubCategory).filter(cat => cat && cat.trim() !== '');
                  setSubSubCategories(subSubCategoriesList);
                  
                  // تطبيق القسم الفرعي الثانوي
                  if (lastUsedCategories.subSubCategory && subSubCategoriesList.includes(lastUsedCategories.subSubCategory)) {
                    setSubSubCategory(lastUsedCategories.subSubCategory);
                  }
                }
                
                setCategoriesApplied(true);
                setTimeout(() => {
                  setCategoriesApplied(false);
                }, 5000);
                
                Alert.alert('تم التطبيق', 'تم تطبيق الأقسام المختارة مؤخراً بنجاح!');
              }}
            >
              <Text style={styles.analyzeButtonText}>🎯 تطبيق الأقسام المختارة مؤخراً</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* عرض الأقسام المختارة مؤخراً إذا كانت متاحة */}
        {lastUsedCategories.mainCategory && lastUsedCategories.subCategory && lastUsedCategories.subSubCategory && (
          <View style={[styles.infoContainer, { backgroundColor: '#e8f5e8', borderColor: '#c3e6cb' }]}>
            <Text style={[styles.infoText, { color: '#155724', fontWeight: 'bold' }]}>
              📋 الأقسام المختارة مؤخراً:
            </Text>
            <Text style={[styles.infoText, { color: '#155724' }]}>
              الرئيسي: {lastUsedCategories.mainCategory}
            </Text>
            <Text style={[styles.infoText, { color: '#155724' }]}>
              الفرعي: {lastUsedCategories.subCategory}
            </Text>
            <Text style={[styles.infoText, { color: '#155724' }]}>
              الثانوي: {lastUsedCategories.subSubCategory}
            </Text>
          </View>
        )}

        {/* اسم المحتوى */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>اسم المحتوى *</Text>
          <TextInput
            style={styles.input}
            value={contentName}
            onChangeText={setContentName}
            placeholder="أدخل اسم المحتوى"
            placeholderTextColor="#999"
          />
          {autoDetected && contentName && (
            <View style={styles.autoDetectedInfo}>
              <Text style={styles.autoDetectedText}>
                🔍 تم استخراج الاسم تلقائياً من الرابط - يمكنك تعديله إذا لزم الأمر
              </Text>
            </View>
          )}
        </View>

        {/* رابط المحتوى */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>رابط المحتوى *</Text>
          <TextInput
            style={[styles.input, isYouTubeLink && styles.youtubeInput]}
            value={contentUrl}
            onChangeText={setContentUrl}
            placeholder="أدخل رابط المحتوى (http:// أو https://)"
            placeholderTextColor="#999"
            keyboardType="url"
            autoCapitalize="none"
          />
          {contentUrl && contentUrl.trim() && (
            <TouchableOpacity 
              style={styles.analyzeButton}
              onPress={() => {
                const analysis = analyzeUrl(contentUrl);
                setContentName(analysis.fileName);
                setContentType(analysis.contentType);
                setAutoDetected(true);
                Alert.alert(
                  'تم التحليل',
                  `تم استخراج المعلومات من الرابط:\n\nاسم المحتوى: ${analysis.fileName}\nنوع المحتوى: ${getContentTypeLabel(analysis.contentType)}\n\nيمكنك تعديل هذه المعلومات إذا لزم الأمر.`
                );
              }}
            >
              <Text style={styles.analyzeButtonText}>🔍 تحليل الرابط يدوياً</Text>
            </TouchableOpacity>
          )}
          {isYouTubeLink && (
            <View style={styles.youtubeInfo}>
              <Text style={styles.youtubeInfoText}>
                🎥 تم اكتشاف رابط يوتيوب - سيتم تشغيل الفيديو عبر متصفح الويب المدمج
              </Text>
            </View>
          )}
        </View>

        {/* نوع المحتوى */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>نوع المحتوى</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={contentType}
              onValueChange={setContentType}
              style={styles.picker}
            >
              <Picker.Item label="كتاب" value="book" />
              <Picker.Item label="ملف صوتي" value="audio" />
              <Picker.Item label="ملف فيديو" value="video" />
              <Picker.Item label="مستند" value="document" />
            </Picker>
          </View>
          {autoDetected && (
            <View style={styles.autoDetectedInfo}>
              <Text style={styles.autoDetectedText}>
                🔍 تم اكتشاف النوع تلقائياً: {getContentTypeLabel(contentType)} - يمكنك تغييره إذا لزم الأمر
              </Text>
            </View>
          )}
        </View>

        {/* القسم الرئيسي */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>القسم الرئيسي *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={mainCategory}
              onValueChange={setMainCategory}
              style={styles.picker}
            >
              <Picker.Item label="اختر القسم الرئيسي" value="" />
              {[...new Set(categories
                .map(cat => cat.mainCategory)
                .filter(cat => cat && cat.trim() !== '') // إزالة القيم الفارغة
              )].map((cat, idx) => (
                <Picker.Item key={`main-${cat}-${idx}`} label={cat} value={cat} />
              ))}
            </Picker>
          </View>
        </View>

        {/* القسم الفرعي */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>القسم الفرعي *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={subCategory}
              onValueChange={setSubCategory}
              style={styles.picker}
              enabled={subCategories.length > 0}
            >
              <Picker.Item label="اختر القسم الفرعي" value="" />
              {[...new Set(subCategories
                .filter(cat => cat && cat.trim() !== '') // إزالة القيم الفارغة
              )].map((cat, idx) => (
                <Picker.Item key={`sub-${cat}-${idx}`} label={cat} value={cat} />
              ))}
            </Picker>
          </View>
        </View>

        {/* القسم الفرعي الثانوي */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>القسم الفرعي الثانوي *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={subSubCategory}
              onValueChange={setSubSubCategory}
              style={styles.picker}
              enabled={subSubCategories.length > 0}
            >
              <Picker.Item label="اختر القسم الفرعي الثانوي" value="" />
              {[...new Set(subSubCategories
                .filter(cat => cat && cat.trim() !== '') // إزالة القيم الفارغة
              )].map((cat, idx) => (
                <Picker.Item key={`subsub-${cat}-${idx}`} label={cat} value={cat} />
              ))}
            </Picker>
          </View>
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
          </View>
        )}

        {/* أزرار الإجراءات */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.addButton, loading && styles.disabledButton]}
            onPress={handleAddContent}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? (
                progressMessage || 'جاري الإضافة...'
              ) : (
                editMode ? 'تحديث المحتوى' : 'إضافة المحتوى'
              )}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => {
              resetForm();
              if (onClose) onClose();
            }}
          >
            <Text style={styles.buttonText}>إلغاء</Text>
          </TouchableOpacity>
        </View>

        {/* معلومات إضافية */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            💡 هذا النموذج مخصص لإضافة المحتوى عبر الروابط الخارجية فقط
          </Text>
          <Text style={styles.infoText}>
            📋 تأكد من أن الرابط صحيح ومتاح للوصول العام
          </Text>
          {isYouTubeLink && (
            <Text style={styles.youtubeInfoText}>
              🎥 فيديوهات يوتيوب: سيتم تشغيلها عبر متصفح الويب المدمج في التطبيق
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6fcfa',
  },
  formContainer: {
    padding: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#197278',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: '#b2dfdb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    textAlign: 'right',
  },
  youtubeInput: {
    borderColor: '#ff0000',
    backgroundColor: '#fff8f8',
  },
  youtubeInfo: {
    backgroundColor: '#fff3cd',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  youtubeInfoText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'right',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#b2dfdb',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    textAlign: 'right',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#197278',
  },
  cancelButton: {
    backgroundColor: '#d32f2f',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#197278',
    textAlign: 'right',
    marginBottom: 4,
  },
  progressContainer: {
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#197278',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    marginTop: 8,
    fontSize: 14,
    color: '#197278',
    textAlign: 'center',
    fontWeight: '500',
  },
  autoDetectedInfo: {
    backgroundColor: '#e0f2f7',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  autoDetectedText: {
    fontSize: 12,
    color: '#007bff',
    textAlign: 'right',
  },
  analyzeButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  boldText: {
    fontWeight: 'bold',
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