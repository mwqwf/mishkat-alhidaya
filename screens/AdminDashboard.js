import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Button, TextInput, Image } from 'react-native';
import { collection, getDocs, deleteDoc, doc, setDoc, serverTimestamp, addDoc, query, where, getDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import ContentForm from '../components/BookForm';
import CategoryForm from '../components/CategoryForm';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useData } from '../context/DataContext';
import UrlContentForm from '../components/UrlContentForm'; // Added import for UrlContentForm
import dataService from '../services/dataService'; // Added import for dataService

// مكون إدارة المستجدات المحدث
const UpdatesManagementForm = ({ onClose, onSuccess, type = 'image', editData = null }) => {
  // حالات مشتركة
  const [title, setTitle] = useState(editData?.title || '');
  const [uploading, setUploading] = useState(false);

  // حالات خاصة بالصور
  const [selectedImages, setSelectedImages] = useState([]);
  const [imageDescription, setImageDescription] = useState(editData?.description || '');

  // حالات خاصة بالمقالات
  const [articleContent, setArticleContent] = useState(editData?.content || '');

  // تحديد ما إذا كنا في وضع التعديل
  const isEditing = editData && editData.id;

  // تحديث الحالة عند تغيير editData
  React.useEffect(() => {
    if (editData) {
      setTitle(editData.title || '');
      setImageDescription(editData.description || '');
      setArticleContent(editData.content || '');
    }
  }, [editData]);

  // طلب إذن الوصول للصور
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('خطأ', 'نحتاج إذن للوصول إلى الصور لتتمكن من رفع الصور');
      return false;
    }
    return true;
  };

  // اختيار صور متعددة
  const pickImages = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImages(result.assets);
        console.log('تم اختيار الصور:', result.assets.length);
      }
    } catch (error) {
      console.error('خطأ في اختيار الصور:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء اختيار الصور');
    }
  };

  // رفع صورة واحدة إلى Firebase Storage
  const uploadImage = async (imageUri) => {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      const fileName = `app_updates/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const imageRef = ref(storage, fileName);
      
      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);
      
      console.log('تم رفع الصورة بنجاح:', downloadURL);
      return downloadURL;
    } catch (error) {
      console.error('خطأ في رفع الصورة:', error);
      throw new Error('فشل في رفع الصورة');
    }
  };

  // رفع جميع الصور
  const uploadAllImages = async () => {
    try {
      const imageUrls = [];
      for (const image of selectedImages) {
        const url = await uploadImage(image.uri);
        imageUrls.push(url);
      }
      return imageUrls;
    } catch (error) {
      console.error('خطأ في رفع الصور:', error);
      throw new Error('فشل في رفع الصور');
    }
  };

  // إزالة صورة من القائمة
  const removeImage = (index) => {
    const newImages = [...selectedImages];
    newImages.splice(index, 1);
    setSelectedImages(newImages);
  };

  // نشر أو تحديث المستجدة مع الصور
  const publishUpdate = async () => {
    // التحقق من وجود العنوان
    if (!title.trim()) {
      Alert.alert('تنبيه', 'العنوان مطلوب');
      return;
    }

    // التحقق من وجود محتوى للنشر (في حالة الإضافة فقط)
    if (!isEditing && selectedImages.length === 0 && !imageDescription.trim()) {
      Alert.alert('تنبيه', 'يجب إضافة صورة أو تعليق على الأقل');
      return;
    }

    setUploading(true);
    
    try {
      let imageUrls = [];
      
      // رفع الصور الجديدة إذا تم اختيار صور
      if (selectedImages.length > 0) {
        imageUrls = await uploadAllImages();
      } else if (isEditing && editData.imageUrls) {
        // في حالة التعديل، احتفظ بالصور الموجودة إذا لم يتم اختيار صور جديدة
        imageUrls = editData.imageUrls;
      } else if (isEditing && editData.imageUrl) {
        // للتوافق مع النظام القديم
        imageUrls = [editData.imageUrl];
      }

      // إنشاء أو تحديث وثيقة المستجدة في Firestore
      const updateData = {
        type: 'image',
        title: title.trim(),
        imageUrls: imageUrls,
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : null, // للتوافق مع النظام القديم
        description: imageDescription.trim() || null,
        imagesCount: imageUrls.length,
      };

      if (isEditing) {
        // تحديث المستجدة الموجودة
        updateData.updatedAt = serverTimestamp();
        await setDoc(doc(db, 'appUpdates', editData.id), updateData, { merge: true });
        console.log('تم تحديث المستجدة بنجاح');
      } else {
        // إنشاء مستجدة جديدة
        updateData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'appUpdates'), updateData);
        console.log('تم نشر المستجدة بنجاح');
      }
      
      onSuccess();
      
    } catch (error) {
      console.error('خطأ في نشر/تحديث المستجدة:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء ' + (isEditing ? 'تحديث' : 'نشر') + ' المستجدة. يرجى المحاولة مرة أخرى.');
    } finally {
      setUploading(false);
    }
  };

  // نشر أو تحديث مقال
  const publishArticle = async () => {
    if (!title.trim()) {
      Alert.alert('تنبيه', 'العنوان مطلوب');
      return;
    }

    if (!articleContent.trim()) {
      Alert.alert('تنبيه', 'محتوى المقال مطلوب');
      return;
    }

    setUploading(true);
    
    try {
      const updateData = {
        type: 'article',
        title: title.trim(),
        content: articleContent.trim(),
      };

      if (isEditing) {
        // تحديث المقال الموجود
        updateData.updatedAt = serverTimestamp();
        await setDoc(doc(db, 'appUpdates', editData.id), updateData, { merge: true });
        console.log('تم تحديث المقال بنجاح');
      } else {
        // إنشاء مقال جديد
        updateData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'appUpdates'), updateData);
        console.log('تم نشر المقال بنجاح');
      }
      
      onSuccess();
      
    } catch (error) {
      console.error('خطأ في نشر/تحديث المقال:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء ' + (isEditing ? 'تحديث' : 'نشر') + ' المقال. يرجى المحاولة مرة أخرى.');
    } finally {
      setUploading(false);
    }
  };

  if (type === 'image') {
    return (
      <View style={styles.updatesFormContainer}>
        <Text style={styles.updatesFormTitle}>
          📷 {isEditing ? 'تعديل صورة مع تعليق' : 'نشر صورة مع تعليق'}
        </Text>
        
        {/* حقل العنوان */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>العنوان (مطلوب):</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="أدخل عنوان المستجدة..."
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
        </View>

        {/* منطقة اختيار الصور */}
        <View style={styles.imagePickerContainer}>
          <Text style={styles.imagePickerLabel}>
            {isEditing ? 'الصور (اتركها فارغة للاحتفاظ بالصور الحالية):' : 'الصور (يمكن اختيار عدة صور):'}
          </Text>
          
          {selectedImages.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedImagesContainer}>
              {selectedImages.map((image, index) => (
                <View key={index} style={styles.selectedImageItem}>
                  <Image source={{ uri: image.uri }} style={styles.selectedImageThumbnail} />
                  <TouchableOpacity 
                    style={styles.removeImageBtn} 
                    onPress={() => removeImage(index)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addMoreImagesBtn} onPress={pickImages}>
                <Text style={styles.addMoreImagesText}>+ إضافة المزيد</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImages}>
              <Text style={styles.imagePickerBtnText}>📷 اختر صور</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* منطقة التعليق */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionLabel}>التعليق (اختياري):</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="اكتب تعليقاً عن الصور..."
            value={imageDescription}
            onChangeText={setImageDescription}
            multiline={true}
            numberOfLines={4}
            textAlign="right"
          />
        </View>

        {/* أزرار العمل */}
        <View style={styles.updatesFormActions}>
          <TouchableOpacity 
            style={[styles.publishBtn, uploading && styles.publishBtnDisabled]} 
            onPress={publishUpdate}
            disabled={uploading}
          >
            <Text style={styles.publishBtnText}>
              {uploading ? '⏳ جاري ' + (isEditing ? 'التحديث' : 'النشر') + '...' : 
               `🚀 ${isEditing ? 'تحديث' : 'نشر'} ${selectedImages.length > 0 ? selectedImages.length + ' صور' : 'المستجدة'}`}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // نموذج المقال
  return (
    <View style={styles.updatesFormContainer}>
      <Text style={styles.updatesFormTitle}>
        ✍️ {isEditing ? 'تعديل مقال' : 'كتابة مقال'}
      </Text>
      
      {/* حقل العنوان */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>عنوان المقال (مطلوب):</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="أدخل عنوان المقال..."
          value={title}
          onChangeText={setTitle}
          textAlign="right"
        />
      </View>

      {/* منطقة محتوى المقال */}
      <View style={styles.articleContainer}>
        <Text style={styles.articleLabel}>محتوى المقال (مطلوب):</Text>
        <TextInput
          style={styles.articleInput}
          placeholder="اكتب محتوى المقال هنا..."
          value={articleContent}
          onChangeText={setArticleContent}
          multiline={true}
          numberOfLines={10}
          textAlign="right"
        />
      </View>

      {/* أزرار العمل */}
      <View style={styles.updatesFormActions}>
        <TouchableOpacity 
          style={[styles.publishBtn, uploading && styles.publishBtnDisabled]} 
          onPress={publishArticle}
          disabled={uploading}
        >
          <Text style={styles.publishBtnText}>
            {uploading ? '⏳ جاري ' + (isEditing ? 'التحديث' : 'النشر') + '...' : 
             '📝 ' + (isEditing ? 'تحديث' : 'نشر') + ' المقال'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>إلغاء</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function AdminDashboard({ navigation }) {
  const { forceReload } = useData();
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false); // تغيير الحالة الافتراضية إلى false
  const [error, setError] = useState(null);
  
  // إزالة متغيرات الإحصائيات لأنها انتقلت للإعدادات
  
  const [showAdmins, setShowAdmins] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [activeTab, setActiveTab] = useState('main'); // تبويب نشط: main, sub, content
  const [showMainForm, setShowMainForm] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [showSubSubForm, setShowSubSubForm] = useState(false);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [showContentForm, setShowContentForm] = useState(false);
  const [contentType, setContentType] = useState('book'); // نوع المحتوى: book, audio, video
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [editCategoryType, setEditCategoryType] = useState(null);
  const [editContent, setEditContent] = useState(null);
  const [showUpdatesManagement, setShowUpdatesManagement] = useState(false);
  const [updatesType, setUpdatesType] = useState('image'); // نوع المستجدة: image أو article
  const [editUpdate, setEditUpdate] = useState(null);
  const [showUrlContentForm, setShowUrlContentForm] = useState(false); // إضافة متغير جديد لإدارة نموذج إضافة المحتوى عبر الرابط

  // دالة تسجيل الخروج
  const handleLogout = async () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من أنك تريد تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تسجيل الخروج',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('adminData');
            navigation.navigate('Home');
          }
        }
      ]
    );
  };

  // دالة الخروج من لوحة التحكم
  const handleExitDashboard = () => {
    Alert.alert(
      'الخروج من لوحة التحكم',
      'هل تريد العودة إلى الشاشة الرئيسية؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'خروج',
          onPress: () => {
            navigation.goBack();
          }
        }
      ]
    );
  };

  // تم إزالة دالة fetchStats لأن الإحصائيات انتقلت للإعدادات

  useEffect(() => {
    fetchAdmins();
    // لا نحتاج fetchStats() بعد الآن
    (async () => {
      const adminData = await AsyncStorage.getItem('adminData');
      if (adminData) {
        setCurrentAdmin(JSON.parse(adminData));
      }
    })();
  }, []);

  const handleFormClosed = () => {
    // إعادة تعيين حالة التعديل
    setEditCategory(null);
    setEditCategoryType(null);
    setEditContent(null);
    setEditUpdate(null);
    setContentType('book');
    
    // إغلاق جميع النماذج
    setShowMainForm(false);
    setShowSubForm(false);
    setShowSubSubForm(false);
    setShowContentForm(false);
    setShowCategoryManagement(false);
    setShowUpdatesManagement(false);
    setShowUrlContentForm(false);
    
    // تحديث البيانات
    forceReload();
  };

  // جلب المشرفين
  const fetchAdmins = async () => {
    setLoadingAdmins(true);
    try {
    const snap = await getDocs(collection(db, 'admins'));
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    setAdmins(arr);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
    setLoadingAdmins(false);
    }
  };

  const handleShowAdmins = async () => {
    await fetchAdmins();
    setShowAdmins(true);
  };

  const handleBanAdmin = async (adminId) => {
    if (!currentAdmin || !currentAdmin.owner) return;
    try {
    await deleteDoc(doc(db, 'admins', adminId));
      await fetchAdmins(); // هذا سيحدث الإحصائيات تلقائياً
      // تم إزالة fetchStats() لأن الإحصائيات انتقلت للإعدادات
    } catch (err) {
      console.error('Error banning admin:', err);
      Alert.alert('خطأ', 'فشل في حذف المشرف');
    }
  };

  // البحث في الأقسام والمحتوى والمستجدات - محدثة لتشمل Realm و Firebase
  const handleSearch = async (text) => {
    setSearchText(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    
    try {
      const results = [];
      const searchText = text.toLowerCase().trim();
      
      // البحث في Realm المحلي (مثل البحث العادي)
      if (dataService?.realm) {
        const realm = dataService.realm;
        
        // البحث في الكتب المحلية
        const localBooks = realm.objects('Book').filtered('isDeleted == false');
        Array.from(localBooks).forEach(book => {
          const searchableText = `${book.bookName || ''} ${book.mainCategory || ''} ${book.subCategory || ''} ${book.subSubCategory || ''}`.toLowerCase();
          if (searchableText.includes(searchText)) {
            results.push({
              id: `realm_book_${book.id}`,
              type: book.contentType || 'book',
              label: book.bookName,
              data: { 
                bookName: book.bookName,
                bookUrl: book.bookUrl,
                mainCategory: book.mainCategory,
                subCategory: book.subCategory,
                subSubCategory: book.subSubCategory,
                contentType: book.contentType,
                id: book.id, 
                type: book.contentType || 'book',
                isLocal: true 
              },
              source: 'realm'
            });
          }
        });

        // البحث في الأقسام المحلية
        const localCategories = realm.objects('Category').filtered('isDeleted == false');
        Array.from(localCategories).forEach(category => {
          const categoryName = category.mainCategory || '';
          const searchableText = `${categoryName} ${category.subCategory || ''} ${category.subSubCategory || ''}`.toLowerCase();
          
          if (searchableText.includes(searchText)) {
            // إضافة الأقسام الرئيسية
            if (categoryName) {
              results.push({
                id: `realm_mainCategory_${category.id}`,
                type: 'mainCategory',
                label: categoryName,
                data: { 
                  mainCategory: categoryName,
                  id: category.id, 
                  type: 'mainCategory',
                  isLocal: true 
                },
                source: 'realm'
              });
            }
            
            // إضافة الأقسام الفرعية
            if (category.subCategory) {
              results.push({
                id: `realm_subCategory_${category.id}`,
                type: 'subCategory',
                label: category.subCategory,
                data: { 
                  subCategory: category.subCategory,
                  mainCategory: categoryName,
                  id: category.id, 
                  type: 'subCategory',
                  isLocal: true 
                },
                source: 'realm'
              });
            }
            
            // إضافة الأقسام الثانوية
            if (category.subSubCategory) {
              results.push({
                id: `realm_subSubCategory_${category.id}`,
                type: 'subSubCategory',
                label: category.subSubCategory,
                data: { 
                  subSubCategory: category.subSubCategory,
                  subCategory: category.subCategory,
                  mainCategory: categoryName,
                  id: category.id, 
                  type: 'subSubCategory',
                  isLocal: true 
                },
                source: 'realm'
              });
            }
          }
        });
      }

      // البحث في Firebase
      try {
        console.log(`\n🔥 === FIREBASE SEARCH DIAGNOSIS ===`);
        console.log(`🔍 Searching for: "${searchText}"`);
        
        // جلب الأقسام من Firebase
    const catsSnap = await getDocs(collection(db, 'categories'));
        console.log(`📂 Total Firebase categories found: ${catsSnap.docs.length}`);
        
        if (catsSnap.docs.length === 0) {
          console.log(`❌ NO CATEGORIES FOUND IN FIREBASE!`);
        } else {
          console.log(`\n📂 === CATEGORIES DETAILS ===`);
          catsSnap.forEach((docSnap, index) => {
      const data = docSnap.data();
            console.log(`\n📂 Category ${index + 1}:`);
            console.log(`   ID: ${docSnap.id}`);
            console.log(`   Data:`, JSON.stringify(data, null, 2));
            
            // البحث في mainCategory أو name
            const mainCategory = data.mainCategory || data.name || '';
            console.log(`   MainCategory field: "${mainCategory}"`);
            console.log(`   MainCategory matches search: ${mainCategory.toLowerCase().includes(searchText.toLowerCase())}`);
            
            if (mainCategory && mainCategory.toLowerCase().includes(searchText.toLowerCase())) {
              console.log(`   ✅ ADDING mainCategory to results: ${mainCategory}`);
              results.push({
                id: `firebase_mainCategory_${docSnap.id}`,
            type: 'mainCategory',
                label: mainCategory,
                data: { 
                  mainCategory: mainCategory,
            id: docSnap.id,
                  type: 'mainCategory' 
                },
                source: 'firebase'
              });
            }
            
            // البحث في subCategory
            if (data.subCategory) {
              console.log(`   SubCategory field: "${data.subCategory}"`);
              console.log(`   SubCategory matches search: ${data.subCategory.toLowerCase().includes(searchText.toLowerCase())}`);
              
              if (data.subCategory.toLowerCase().includes(searchText.toLowerCase())) {
                console.log(`   ✅ ADDING subCategory to results: ${data.subCategory}`);
                results.push({
                  id: `firebase_subCategory_${docSnap.id}`,
            type: 'subCategory',
            label: data.subCategory,
                  data: { 
                    subCategory: data.subCategory,
                    mainCategory: data.mainCategory || data.name,
                    id: docSnap.id, 
                    type: 'subCategory' 
                  },
                  source: 'firebase'
          });
        }
      }
            
            // البحث في subSubCategory
            if (data.subSubCategory) {
              console.log(`   SubSubCategory field: "${data.subSubCategory}"`);
              console.log(`   SubSubCategory matches search: ${data.subSubCategory.toLowerCase().includes(searchText.toLowerCase())}`);
              
              if (data.subSubCategory.toLowerCase().includes(searchText.toLowerCase())) {
                console.log(`   ✅ ADDING subSubCategory to results: ${data.subSubCategory}`);
                results.push({
                  id: `firebase_subSubCategory_${docSnap.id}`,
            type: 'subSubCategory',
            label: data.subSubCategory,
                  data: { 
                    subSubCategory: data.subSubCategory,
                    subCategory: data.subCategory,
                    mainCategory: data.mainCategory || data.name,
                    id: docSnap.id, 
                    type: 'subSubCategory' 
                  },
                  source: 'firebase'
          });
        }
      }
    });
        }
    
        console.log(`\n📊 Firebase category results count: ${results.length}`);
        
        // جلب المحتوى من Firebase
    const booksSnap = await getDocs(collection(db, 'books'));
        console.log(`📚 Total Firebase books found: ${booksSnap.docs.length}`);
        
    booksSnap.forEach(docSnap => {
      const data = docSnap.data();
          if (data.bookName && data.bookName.toLowerCase().includes(searchText.toLowerCase())) {
            console.log(`✅ ADDING book to results: ${data.bookName}`);
            results.push({
              id: `firebase_${data.contentType || 'book'}_${docSnap.id}`,
            type: data.contentType || 'book',
            label: data.bookName,
              data: { ...data, id: docSnap.id, type: data.contentType || 'book' },
              source: 'firebase'
          });
      }
    });

        // جلب المستجدات من Firebase
    const updatesSnap = await getDocs(collection(db, 'appUpdates'));
        console.log(`📰 Total Firebase updates found: ${updatesSnap.docs.length}`);
        
    updatesSnap.forEach(docSnap => {
      const data = docSnap.data();
      const title = data.title || '';
      const content = data.content || '';
      const description = data.description || '';
      
      // البحث في العنوان أو المحتوى أو الوصف
          if (title.toLowerCase().includes(searchText.toLowerCase()) || 
              content.toLowerCase().includes(searchText.toLowerCase()) || 
              description.toLowerCase().includes(searchText.toLowerCase())) {
        const updateType = data.type === 'article' ? 'article' : 'image_update';
            console.log(`✅ ADDING update to results: ${title || (data.type === 'article' ? 'مقال بدون عنوان' : 'صور بدون عنوان')}`);
            results.push({
              id: `firebase_${updateType}_${docSnap.id}`,
            type: updateType,
            label: title || (data.type === 'article' ? 'مقال بدون عنوان' : 'صور بدون عنوان'),
              data: { ...data, id: docSnap.id, type: updateType },
              source: 'firebase'
            });
          }
        });
        
        console.log(`🔥 === END FIREBASE SEARCH ===\n`);
      } catch (firebaseError) {
        console.error('❌ خطأ في البحث في Firebase:', firebaseError);
        console.error('❌ Error stack:', firebaseError.stack);
      }

      // إزالة التكرار بناءً على المحتوى (وليس الـ ID)
      console.log(`📊 Before deduplication: ${results.length} total results`);
      console.log(`📊 Results breakdown before deduplication:`, {
        mainCategories: results.filter(r => r.type === 'mainCategory').length,
        subCategories: results.filter(r => r.type === 'subCategory').length,
        subSubCategories: results.filter(r => r.type === 'subSubCategory').length,
        books: results.filter(r => r.type === 'book').length,
        videos: results.filter(r => r.type === 'video').length,
        audios: results.filter(r => r.type === 'audio').length,
        articles: results.filter(r => r.type === 'article').length,
        imageUpdates: results.filter(r => r.type === 'image_update').length
      });
      
      // إزالة التكرار وتحسين ترتيب النتائج
      const uniqueResults = results.filter((item, index, self) => {
        const isDuplicate = index !== self.findIndex(t => 
          t.label === item.label && 
          t.type === item.type && 
          t.data.mainCategory === item.data.mainCategory &&
          t.data.subCategory === item.data.subCategory
        );
        
        if (isDuplicate) {
          console.log(`🔄 Removing duplicate: ${item.label} (${item.type})`);
        }
        
        return !isDuplicate;
      });

      // ترتيب النتائج حسب الأولوية (الأكثر تطابقاً أولاً)
      const sortedResults = uniqueResults.sort((a, b) => {
        const searchTextLower = searchText.toLowerCase();
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        
        // حساب درجة التطابق لكل نتيجة
        const getMatchScore = (label, searchText, itemType) => {
          let score = 0;
          
          // تطابق كامل = أعلى درجة
          if (label === searchText) score += 1000;
          
          // يبدأ بالكلمة المبحوثة = درجة عالية
          else if (label.startsWith(searchText)) score += 500;
          
          // ينتهي بالكلمة المبحوثة = درجة متوسطة
          else if (label.endsWith(searchText)) score += 300;
          
          // يحتوي على الكلمة المبحوثة = درجة منخفضة
          else if (label.includes(searchText)) score += 100;
          
          // تطابق جزئي (جزء من الكلمة)
          const searchWords = searchText.split(' ').filter(word => word.length > 1);
          searchWords.forEach(word => {
            if (label.includes(word)) score += 50;
          });
          
          // أولوية الأقسام على المحتوى
          if (itemType === 'mainCategory' || itemType === 'subCategory' || itemType === 'subSubCategory') {
            score += 200;
          }
          
          return score;
        };
        
        const aScore = getMatchScore(aLabel, searchTextLower, a.type);
        const bScore = getMatchScore(bLabel, searchTextLower, b.type);
        
        // ترتيب تنازلي (الأعلى أولاً)
        return bScore - aScore;
      });

      console.log(`🔍 Search results: ${sortedResults.length} items found for "${text}"`);
      console.log(`📊 Results breakdown:`, {
        mainCategories: sortedResults.filter(r => r.type === 'mainCategory').length,
        subCategories: sortedResults.filter(r => r.type === 'subCategory').length,
        subSubCategories: sortedResults.filter(r => r.type === 'subSubCategory').length,
        books: sortedResults.filter(r => r.type === 'book').length,
        videos: sortedResults.filter(r => r.type === 'video').length,
        audios: sortedResults.filter(r => r.type === 'audio').length,
        articles: sortedResults.filter(r => r.type === 'article').length,
        imageUpdates: sortedResults.filter(r => r.type === 'image_update').length
      });
      
      // عرض تفاصيل النتائج النهائية مع درجة التطابق
      sortedResults.forEach((result, index) => {
        const searchTextLower = searchText.toLowerCase();
        const resultLabel = result.label.toLowerCase();
        let matchType = 'partial';
        
        if (resultLabel === searchTextLower) matchType = 'exact';
        else if (resultLabel.startsWith(searchTextLower)) matchType = 'starts_with';
        else if (resultLabel.endsWith(searchTextLower)) matchType = 'ends_with';
        else if (resultLabel.includes(searchTextLower)) matchType = 'contains';
        
        console.log(`📋 Result ${index + 1}: ${result.label} (${result.type}) - Source: ${result.source} - Match: ${matchType}`);
      });
      
      setSearchResults(sortedResults);
      
    } catch (error) {
      console.error('خطأ في البحث:', error);
      setSearchResults([]);
    } finally {
    setSearchLoading(false);
    }
  };

  // حذف عنصر (قسم أو محتوى أو مستجدة) - محدثة لتشمل Realm
  const handleDeleteSearchItem = async (item) => {
    const itemTypeName = item.type === 'mainCategory' ? 'القسم الرئيسي' :
                        item.type === 'subCategory' ? 'القسم الفرعي' :
                        item.type === 'subSubCategory' ? 'القسم الفرعي الثانوي' :
                        item.type === 'book' ? 'الكتاب' :
                        item.type === 'audio' ? 'الملف الصوتي' :
                        item.type === 'video' ? 'الفيديو' :
                        item.type === 'article' ? 'المقال' :
                        item.type === 'image_update' ? 'الصور' : 'العنصر';

    Alert.alert(
      'تأكيد الحذف',
      `هل أنت متأكد أنك تريد حذف ${itemTypeName}: "${item.label}"؟\n\nتحذير: هذا الإجراء لا يمكن التراجع عنه!`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف نهائي', style: 'destructive', onPress: async () => {
            try {
              setSearchLoading(true);
              
              // استخراج الـ ID الحقيقي
              const realId = item.id.replace('firebase_', '').replace('realm_', '');
              console.log(`🗑️ Deleting item: ${item.label} with realId: ${realId}`);
              
              // حذف من Firebase أولاً (لجميع العناصر)
              let firebaseDeleted = false;
              try {
                console.log(`\n🗑️ === FIREBASE DELETION DIAGNOSIS ===`);
                console.log(`🗑️ Starting Firebase deletion for: ${item.label} (Type: ${item.type})`);
                console.log(`🗑️ Real ID: ${realId}`);
                console.log(`🗑️ Item data:`, JSON.stringify(item.data, null, 2));
                
              if (item.type === 'mainCategory' || item.type === 'subCategory' || item.type === 'subSubCategory') {
                  console.log(`🗑️ Attempting to delete category from Firebase: ${item.label} (ID: ${realId})`);
                  
                  // حذف القسم من Firebase
                  const categoryRef = doc(db, 'categories', realId);
                  console.log(`🗑️ Category reference:`, categoryRef);
                  console.log(`🗑️ Category path: ${categoryRef.path}`);
                  
                  // التحقق من وجود المستند قبل الحذف
                  const docSnap = await getDoc(categoryRef);
                  if (docSnap.exists()) {
                    console.log(`✅ Document exists before deletion`);
                    console.log(`📄 Document data:`, docSnap.data());
                  } else {
                    console.log(`❌ Document does not exist! Cannot delete.`);
                  }
                  
                  await deleteDoc(categoryRef);
                  console.log(`✅ Successfully deleted category from Firebase: ${item.label} (ID: ${realId})`);
                  
                  // التحقق من الحذف
                  const docSnapAfter = await getDoc(categoryRef);
                  if (!docSnapAfter.exists()) {
                    console.log(`✅ Document successfully deleted (confirmed)`);
                  } else {
                    console.log(`❌ Document still exists after deletion!`);
                  }
                  
                  // إذا كان قسم رئيسي، حذف جميع الكتب المرتبطة
                  if (item.type === 'mainCategory') {
                    console.log(`🗑️ Deleting related books for main category: ${item.label}`);
                    const booksQuery = query(collection(db, 'books'), where('mainCategory', '==', item.label));
                    const booksSnap = await getDocs(booksQuery);
                    console.log(`📚 Found ${booksSnap.docs.length} related books to delete`);
                    
                    if (booksSnap.docs.length > 0) {
                      const deletePromises = booksSnap.docs.map(doc => {
                        console.log(`🗑️ Deleting book: ${doc.data().bookName} (ID: ${doc.id})`);
                        return deleteDoc(doc.ref);
                      });
                      await Promise.all(deletePromises);
                      console.log(`✅ Successfully deleted ${booksSnap.docs.length} related books from Firebase`);
                    }
                    
                    // حذف جميع الأقسام الفرعية المرتبطة
                    console.log(`🗑️ Deleting related subcategories for main category: ${item.label}`);
                    const subCategoriesQuery = query(collection(db, 'categories'), 
                      where('mainCategory', '==', item.label)
                    );
                    const subCategoriesSnap = await getDocs(subCategoriesQuery);
                    console.log(`📂 Found ${subCategoriesSnap.docs.length} related subcategories to delete`);
                    
                    if (subCategoriesSnap.docs.length > 0) {
                      const deletePromises = subCategoriesSnap.docs.map(doc => {
                        console.log(`🗑️ Deleting subcategory: ${doc.data().subCategory || doc.data().subSubCategory} (ID: ${doc.id})`);
                        return deleteDoc(doc.ref);
                      });
                      await Promise.all(deletePromises);
                      console.log(`✅ Successfully deleted ${subCategoriesSnap.docs.length} related subcategories from Firebase`);
                    }
                  }
                  
                  // إذا كان قسم فرعي، حذف جميع الكتب المرتبطة
                  if (item.type === 'subCategory') {
                    console.log(`🗑️ Deleting related books for sub category: ${item.label}`);
                    const mainCategoryName = item.data.mainCategory || '';
                    console.log(`🗑️ Main category name: ${mainCategoryName}`);
                    
                    const booksQuery = query(collection(db, 'books'), 
                      where('mainCategory', '==', mainCategoryName),
                      where('subCategory', '==', item.label)
                    );
                    const booksSnap = await getDocs(booksQuery);
                    console.log(`📚 Found ${booksSnap.docs.length} related books to delete`);
                    
                    if (booksSnap.docs.length > 0) {
                      const deletePromises = booksSnap.docs.map(doc => {
                        console.log(`🗑️ Deleting book: ${doc.data().bookName} (ID: ${doc.id})`);
                        return deleteDoc(doc.ref);
                      });
                      await Promise.all(deletePromises);
                      console.log(`✅ Successfully deleted ${booksSnap.docs.length} related books from Firebase`);
                    }
                    
                    // حذف جميع الأقسام الثانوية المرتبطة
                    console.log(`🗑️ Deleting related sub-subcategories for sub category: ${item.label}`);
                    const subSubCategoriesQuery = query(collection(db, 'categories'), 
                      where('mainCategory', '==', mainCategoryName),
                      where('subCategory', '==', item.label)
                    );
                    const subSubCategoriesSnap = await getDocs(subSubCategoriesQuery);
                    console.log(`📂 Found ${subSubCategoriesSnap.docs.length} related sub-subcategories to delete`);
                    
                    if (subSubCategoriesSnap.docs.length > 0) {
                      const deletePromises = subSubCategoriesSnap.docs.map(doc => {
                        console.log(`🗑️ Deleting sub-subcategory: ${doc.data().subSubCategory} (ID: ${doc.id})`);
                        return deleteDoc(doc.ref);
                      });
                      await Promise.all(deletePromises);
                      console.log(`✅ Successfully deleted ${subSubCategoriesSnap.docs.length} related sub-subcategories from Firebase`);
                    }
                  }
                  
                  // إذا كان قسم ثانوي، حذف جميع الكتب المرتبطة
                  if (item.type === 'subSubCategory') {
                    console.log(`🗑️ Deleting related books for sub-sub category: ${item.label}`);
                    const mainCategoryName = item.data.mainCategory || '';
                    const subCategoryName = item.data.subCategory || '';
                    console.log(`🗑️ Main category: ${mainCategoryName}, Sub category: ${subCategoryName}`);
                    
                    const booksQuery = query(collection(db, 'books'), 
                      where('mainCategory', '==', mainCategoryName),
                      where('subCategory', '==', subCategoryName),
                      where('subSubCategory', '==', item.label)
                    );
                    const booksSnap = await getDocs(booksQuery);
                    console.log(`📚 Found ${booksSnap.docs.length} related books to delete`);
                    
                    if (booksSnap.docs.length > 0) {
                      const deletePromises = booksSnap.docs.map(doc => {
                        console.log(`🗑️ Deleting book: ${doc.data().bookName} (ID: ${doc.id})`);
                        return deleteDoc(doc.ref);
                      });
                      await Promise.all(deletePromises);
                      console.log(`✅ Successfully deleted ${booksSnap.docs.length} related books from Firebase`);
                    }
                  }
                  
                  firebaseDeleted = true;
              } else if (item.type === 'article' || item.type === 'image_update') {
                  console.log(`🗑️ Attempting to delete update from Firebase: ${item.label} (ID: ${realId})`);
                  const updateRef = doc(db, 'appUpdates', realId);
                  console.log(`🗑️ Update reference:`, updateRef);
                  
                  // التحقق من وجود المستند قبل الحذف
                  const docSnap = await getDoc(updateRef);
                  if (docSnap.exists()) {
                    console.log(`✅ Update document exists before deletion`);
              } else {
                    console.log(`❌ Update document does not exist! Cannot delete.`);
                  }
                  
                  await deleteDoc(updateRef);
                  console.log(`✅ Successfully deleted from Firebase: ${item.label} (ID: ${realId})`);
                  firebaseDeleted = true;
                } else {
                  console.log(`🗑️ Attempting to delete book from Firebase: ${item.label} (ID: ${realId})`);
                  const bookRef = doc(db, 'books', realId);
                  console.log(`🗑️ Book reference:`, bookRef);
                  
                  // التحقق من وجود المستند قبل الحذف
                  const docSnap = await getDoc(bookRef);
                  if (docSnap.exists()) {
                    console.log(`✅ Book document exists before deletion`);
                  } else {
                    console.log(`❌ Book document does not exist! Cannot delete.`);
                  }
                  
                  await deleteDoc(bookRef);
                  console.log(`✅ Successfully deleted from Firebase: ${item.label} (ID: ${realId})`);
                  firebaseDeleted = true;
                }
                
                console.log(`✅ Firebase deletion completed successfully`);
                console.log(`🗑️ === END FIREBASE DELETION ===\n`);
              } catch (firebaseError) {
                console.error(`❌ Firebase deletion failed: ${firebaseError.message}`);
                console.error(`❌ Error details:`, firebaseError);
                console.error(`❌ Error stack:`, firebaseError.stack);
                console.error(`🗑️ === END FIREBASE DELETION WITH ERROR ===\n`);
              }
              
              // حذف من Realm المحلي
              let realmDeleted = false;
              try {
                const realm = dataService?.realm;
                if (realm) {
                  realm.write(() => {
                    if (item.type === 'mainCategory' || item.type === 'subCategory' || item.type === 'subSubCategory') {
                      // حذف الأقسام
                      const mainCategoryName = item.data.mainCategory || item.label;
                      
                      // حذف جميع الأقسام الفرعية المرتبطة
                      try {
                        // البحث عن القسم الرئيسي أولاً للحصول على ID
                        const mainCategory = realm.objects('Category').filtered('mainCategory == $0', mainCategoryName)[0];
                        if (mainCategory) {
                          const subCategories = realm.objects('Subcategory').filtered('categoryId == $0', mainCategory.id);
                          realm.delete(subCategories);
                          console.log(`🗑️ Deleted ${subCategories.length} subcategories from Realm`);
                        } else {
                          console.log(`⚠️ Main category not found in Realm: ${mainCategoryName}`);
                        }
                      } catch (subCategoryError) {
                        console.log('Subcategory deletion failed:', subCategoryError.message);
                      }
                      
                      // حذف جميع الكتب المرتبطة
                      const books = realm.objects('Book').filtered('mainCategory == $0', mainCategoryName);
                      realm.delete(books);
                      console.log(`🗑️ Deleted ${books.length} books from Realm`);
                      
                      // حذف القسم الرئيسي نفسه
                      const category = realm.objectForPrimaryKey('Category', realId);
                      if (category) {
                        realm.delete(category);
                        console.log(`🗑️ Deleted main category from Realm`);
                      } else {
                        console.log(`⚠️ Main category not found in Realm with ID: ${realId}`);
                      }
                    }
                    
                    // حذف القسم الفرعي
                    else if (item.type === 'subCategory') {
                      const mainCategoryName = item.data.mainCategory;
                      const subCategoryName = item.data.subCategory || item.label;
                      
                      // حذف جميع الكتب المرتبطة
                      const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1', 
                        mainCategoryName, subCategoryName);
                      realm.delete(books);
                      console.log(`🗑️ Deleted ${books.length} books from Realm for subcategory`);
                      
                      // حذف القسم الفرعي نفسه
                      const subCategory = realm.objectForPrimaryKey('Subcategory', realId);
                      if (subCategory) {
                        realm.delete(subCategory);
                        console.log(`🗑️ Deleted subcategory from Realm`);
                      } else {
                        console.log(`⚠️ Subcategory not found in Realm with ID: ${realId}`);
                      }
                    }
                    
                    // حذف القسم الثانوي (إذا كان موجوداً في schema)
                    else if (item.type === 'subSubCategory') {
                      try {
                        // التحقق من وجود SubSubcategory في schema
                        const subSubCategories = realm.objects('SubSubcategory');
                        if (subSubCategories) {
                          const mainCategoryName = item.data.mainCategory;
                          const subCategoryName = item.data.subCategory;
                          const subSubCategoryName = item.data.subSubCategory || item.label;
                          
                          const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1 AND subSubCategory == $2', 
                            mainCategoryName, subCategoryName, subSubCategoryName);
                          realm.delete(books);
                          console.log(`🗑️ Deleted ${books.length} books from Realm for sub-subcategory`);
                          
                          const subSubCategory = realm.objectForPrimaryKey('SubSubcategory', realId);
                          if (subSubCategory) {
                            realm.delete(subSubCategory);
                            console.log(`🗑️ Deleted sub-subcategory from Realm`);
                          } else {
                            console.log(`⚠️ Sub-subcategory not found in Realm with ID: ${realId}`);
                          }
                        }
                      } catch (schemaError) {
                        console.log('SubSubcategory not found in schema, skipping...');
                        // حذف الكتب المرتبطة فقط
                        const mainCategoryName = item.data.mainCategory;
                        const subCategoryName = item.data.subCategory;
                        const subSubCategoryName = item.data.subSubCategory || item.label;
                        
                        const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1 AND subSubCategory == $2', 
                          mainCategoryName, subCategoryName, subSubCategoryName);
                        realm.delete(books);
                        console.log(`🗑️ Deleted ${books.length} books from Realm for sub-subcategory (schema not found)`);
                      }
                    }
                  });
                }
              } catch (realmError) {
                console.error('Error deleting from Realm:', realmError);
              }
              
              // إزالة العنصر من النتائج
              const updatedResults = searchResults.filter(r => r.id !== item.id);
              setSearchResults(updatedResults);
              
              // تحديث فوري للواجهة
              if (firebaseDeleted || realmDeleted) {
                Alert.alert('تم الحذف', `تم حذف ${itemTypeName} نهائياً من ${firebaseDeleted ? 'Firebase' : ''}${firebaseDeleted && realmDeleted ? ' و' : ''}${realmDeleted ? 'Realm المحلي' : ''}`);
              
                // تحديث الإحصائيات في الخلفية
              setTimeout(() => {
                forceReload();
              }, 100);
              } else {
                Alert.alert('خطأ في الحذف', 'فشل في حذف العنصر من كلا المصدرين');
              }
            } catch (error) {
              console.error('خطأ في الحذف:', error);
              Alert.alert('خطأ', `فشل في حذف ${itemTypeName}: ${error.message}`);
            } finally {
              setSearchLoading(false);
            }
          }
        }
      ]
    );
  };

  // حذف قسم من Realm المحلي
  const deleteCategoryFromRealm = async (item) => {
    try {
      const realm = dataService?.realm;
      if (!realm) {
        console.warn('Realm not available for local deletion');
        return;
      }

      // استخراج الـ ID الحقيقي
      const realId = item.id.replace('firebase_', '').replace('realm_', '');

      realm.write(() => {
        // حذف القسم الرئيسي
        if (item.type === 'mainCategory') {
          const mainCategoryName = item.data.mainCategory || item.label;
          
          // حذف جميع الأقسام الفرعية المرتبطة
          try {
            // البحث عن القسم الرئيسي أولاً للحصول على ID
            const mainCategory = realm.objects('Category').filtered('mainCategory == $0', mainCategoryName)[0];
            if (mainCategory) {
              const subCategories = realm.objects('Subcategory').filtered('categoryId == $0', mainCategory.id);
              realm.delete(subCategories);
              console.log(`🗑️ Deleted ${subCategories.length} subcategories from Realm`);
            } else {
              console.log(`⚠️ Main category not found in Realm: ${mainCategoryName}`);
            }
          } catch (subCategoryError) {
            console.log('Subcategory deletion failed:', subCategoryError.message);
          }
          
          // حذف جميع الكتب المرتبطة
          const books = realm.objects('Book').filtered('mainCategory == $0', mainCategoryName);
          realm.delete(books);
          console.log(`🗑️ Deleted ${books.length} books from Realm`);
          
          // حذف القسم الرئيسي نفسه
          const category = realm.objectForPrimaryKey('Category', realId);
          if (category) {
            realm.delete(category);
            console.log(`🗑️ Deleted main category from Realm`);
          } else {
            console.log(`⚠️ Main category not found in Realm with ID: ${realId}`);
          }
        }
        
        // حذف القسم الفرعي
        else if (item.type === 'subCategory') {
          const mainCategoryName = item.data.mainCategory;
          const subCategoryName = item.data.subCategory || item.label;
          
          // حذف جميع الكتب المرتبطة
          const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1', 
            mainCategoryName, subCategoryName);
          realm.delete(books);
          console.log(`🗑️ Deleted ${books.length} books from Realm for subcategory`);
          
          // حذف القسم الفرعي نفسه
          const subCategory = realm.objectForPrimaryKey('Subcategory', realId);
          if (subCategory) {
            realm.delete(subCategory);
            console.log(`🗑️ Deleted subcategory from Realm`);
          } else {
            console.log(`⚠️ Subcategory not found in Realm with ID: ${realId}`);
          }
        }
        
        // حذف القسم الثانوي (إذا كان موجوداً في schema)
        else if (item.type === 'subSubCategory') {
          try {
            // التحقق من وجود SubSubcategory في schema
            const subSubCategories = realm.objects('SubSubcategory');
            if (subSubCategories) {
              const mainCategoryName = item.data.mainCategory;
              const subCategoryName = item.data.subCategory;
              const subSubCategoryName = item.data.subSubCategory || item.label;
              
              const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1 AND subSubCategory == $2', 
                mainCategoryName, subCategoryName, subSubCategoryName);
              realm.delete(books);
              console.log(`🗑️ Deleted ${books.length} books from Realm for sub-subcategory`);
              
              const subSubCategory = realm.objectForPrimaryKey('SubSubcategory', realId);
              if (subSubCategory) {
                realm.delete(subSubCategory);
                console.log(`🗑️ Deleted sub-subcategory from Realm`);
              } else {
                console.log(`⚠️ Sub-subcategory not found in Realm with ID: ${realId}`);
              }
            }
          } catch (schemaError) {
            console.log('SubSubcategory not found in schema, skipping...');
            // حذف الكتب المرتبطة فقط
            const mainCategoryName = item.data.mainCategory;
            const subCategoryName = item.data.subCategory;
            const subSubCategoryName = item.data.subSubCategory || item.label;
            
            const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1 AND subSubCategory == $2', 
              mainCategoryName, subCategoryName, subSubCategoryName);
            realm.delete(books);
            console.log(`🗑️ Deleted ${books.length} books from Realm for sub-subcategory (schema not found)`);
          }
        }
      });
      
      console.log(`✅ Category deleted from Realm: ${item.label}`);
    } catch (error) {
      console.error('Error deleting category from Realm:', error);
      // لا نرمي الخطأ لأن الحذف من Firebase نجح
    }
  };

  // حذف كتاب من Realm المحلي
  const deleteBookFromRealm = async (item) => {
    try {
      const realm = dataService?.realm;
      if (!realm) {
        console.warn('Realm not available for local deletion');
        return;
      }

      // استخراج الـ ID الحقيقي
      const realId = item.id.replace('firebase_', '').replace('realm_', '');

      realm.write(() => {
        // البحث عن الكتاب باستخدام ID أو اسم الكتاب
        let book = null;
        
        // محاولة البحث بالـ ID أولاً
        if (realId) {
          book = realm.objectForPrimaryKey('Book', realId);
        }
        
        // إذا لم يتم العثور عليه بالـ ID، ابحث بالاسم
        if (!book && item.data?.bookName) {
          const books = realm.objects('Book').filtered('bookName == $0', item.data.bookName);
          book = books[0];
        }
        
        // إذا لم يتم العثور عليه بالاسم، ابحث بالـ label
        if (!book && item.label) {
          const books = realm.objects('Book').filtered('bookName == $0', item.label);
          book = books[0];
        }
        
        if (book) {
          realm.delete(book);
          console.log(`✅ Book deleted from Realm: ${item.label}`);
        } else {
          console.log(`⚠️ Book not found in Realm: ${item.label}`);
        }
      });
    } catch (error) {
      console.error('Error deleting book from Realm:', error);
      // لا نرمي الخطأ لأن الحذف من Firebase نجح
    }
  };

  // تعديل عنصر (قسم أو محتوى أو مستجدة)
  const handleEditSearchItem = (item) => {
    const itemTypeName = item.type === 'mainCategory' ? 'القسم الرئيسي' :
                        item.type === 'subCategory' ? 'القسم الفرعي' :
                        item.type === 'subSubCategory' ? 'القسم الفرعي الثانوي' :
                        item.type === 'book' ? 'الكتاب' :
                        item.type === 'audio' ? 'الملف الصوتي' :
                        item.type === 'video' ? 'الفيديو' :
                        item.type === 'article' ? 'المقال' :
                        item.type === 'image_update' ? 'الصور' : 'العنصر';

    Alert.alert(
      'تأكيد التعديل',
      `هل أنت متأكد أنك تريد تعديل ${itemTypeName}: "${item.label}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تعديل', onPress: () => {
            setShowMainForm(false);
            setShowSubForm(false);
            setShowSubSubForm(false);
            setShowContentForm(false);
            setShowCategoryManagement(false);
            setShowUpdatesManagement(false);
            setShowSearch(false);
            
            if (item.type === 'mainCategory') {
              setEditCategory({ ...item.data, type: 'mainCategory' });
              setEditCategoryType('main');
              setShowMainForm(true);
            } else if (item.type === 'subCategory') {
              setEditCategory({ ...item.data, type: 'subCategory' });
              setEditCategoryType('sub');
              setShowSubForm(true);
            } else if (item.type === 'subSubCategory') {
              setEditCategory({ ...item.data, type: 'subSubCategory' });
              setEditCategoryType('subsub');
              setShowSubSubForm(true);
            } else if (item.type === 'article' || item.type === 'image_update') {
              // تحديد نوع المستجدة للتعديل
              setUpdatesType(item.data.type === 'article' ? 'article' : 'image');
              setEditUpdate(item.data);
              setShowUpdatesManagement(true);
            } else {
              setEditContent(item.data);
              setShowContentForm(true);
            }
          }
        }
      ]
    );
  };

  // تم إزالة زر وشاشة البحث من لوحة التحكم بناءً على الطلب

  // معالجة التعديل من صفحة البحث
  const handleEditFromSearch = (item) => {
    if (item.type === 'mainCategory') {
      setEditCategory({ ...item.data, type: 'mainCategory' });
      setEditCategoryType('main');
      setShowMainForm(true);
    } else if (item.type === 'subCategory') {
      setEditCategory({ ...item.data, type: 'subCategory' });
      setEditCategoryType('sub');
      setShowSubForm(true);
    } else if (item.type === 'subSubCategory') {
      setEditCategory({ ...item.data, type: 'subSubCategory' });
      setEditCategoryType('subsub');
      setShowSubSubForm(true);
    } else if (item.type === 'article' || item.type === 'image_update') {
      setUpdatesType(item.data.type === 'article' ? 'article' : 'image');
      setEditUpdate(item.data);
      setShowUpdatesManagement(true);
    } else {
      setEditContent(item.data);
      setShowContentForm(true);
    }
  };

  // معالجة الحذف من صفحة البحث
  const handleDeleteFromSearch = async (item) => {
    try {
      // استخراج الـ ID الحقيقي
      const realId = item.id.replace('firebase_', '').replace('realm_', '');
      console.log(`🗑️ Deleting item from search: ${item.label} with realId: ${realId}`);
      
      // حذف من Firebase أولاً (لجميع العناصر)
      let firebaseDeleted = false;
    try {
      if (item.type === 'mainCategory' || item.type === 'subCategory' || item.type === 'subSubCategory') {
          await deleteDoc(doc(db, 'categories', realId));
          console.log(`✅ Deleted from Firebase: ${item.label} (ID: ${realId})`);
          firebaseDeleted = true;
      } else if (item.type === 'article' || item.type === 'image_update') {
          await deleteDoc(doc(db, 'appUpdates', realId));
          console.log(`✅ Deleted from Firebase: ${item.label} (ID: ${realId})`);
          firebaseDeleted = true;
      } else {
          await deleteDoc(doc(db, 'books', realId));
          console.log(`✅ Deleted from Firebase: ${item.label} (ID: ${realId})`);
          firebaseDeleted = true;
        }
      } catch (firebaseError) {
        console.log(`⚠️ Firebase deletion failed: ${firebaseError.message}`);
        // إذا فشل الحذف من Firebase، نحاول حذف العناصر المرتبطة
        if (item.type === 'mainCategory') {
          try {
            // حذف جميع الكتب المرتبطة من Firebase
            const booksQuery = query(collection(db, 'books'), where('mainCategory', '==', item.label));
            const booksSnap = await getDocs(booksQuery);
            const deletePromises = booksSnap.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            console.log(`✅ Deleted ${booksSnap.docs.length} related books from Firebase`);
            firebaseDeleted = true;
          } catch (relatedError) {
            console.log(`⚠️ Failed to delete related books: ${relatedError.message}`);
          }
        }
      }
      
      // حذف من Realm المحلي
      let realmDeleted = false;
      try {
        const realm = dataService?.realm;
        if (realm) {
          realm.write(() => {
            if (item.type === 'mainCategory' || item.type === 'subCategory' || item.type === 'subSubCategory') {
              // حذف الأقسام
              const mainCategoryName = item.data.mainCategory || item.label;
              
              if (item.type === 'mainCategory') {
                // حذف جميع الأقسام الفرعية المرتبطة
                const subCategories = realm.objects('Subcategory').filtered('mainCategory == $0', mainCategoryName);
                realm.delete(subCategories);
                
                // حذف جميع الكتب المرتبطة
                const books = realm.objects('Book').filtered('mainCategory == $0', mainCategoryName);
                realm.delete(books);
                
                // حذف القسم الرئيسي نفسه
                const category = realm.objectForPrimaryKey('Category', realId);
                if (category) {
                  realm.delete(category);
                }
              } else if (item.type === 'subCategory') {
                const mainCategoryName = item.data.mainCategory;
                const subCategoryName = item.data.subCategory || item.label;
                
                // حذف جميع الكتب المرتبطة
                const books = realm.objects('Book').filtered('mainCategory == $0 AND subCategory == $1', 
                  mainCategoryName, subCategoryName);
                realm.delete(books);
                
                // حذف القسم الفرعي نفسه
                const subCategory = realm.objectForPrimaryKey('Subcategory', realId);
                if (subCategory) {
                  realm.delete(subCategory);
                }
              }
              realmDeleted = true;
            } else if (item.type !== 'article' && item.type !== 'image_update') {
              // حذف الكتب
              let book = realm.objectForPrimaryKey('Book', realId);
              if (!book && item.data?.bookName) {
                const books = realm.objects('Book').filtered('bookName == $0', item.data.bookName);
                book = books[0];
              }
              if (!book && item.label) {
                const books = realm.objects('Book').filtered('bookName == $0', item.label);
                book = books[0];
              }
              
              if (book) {
                realm.delete(book);
                console.log(`✅ Book deleted from Realm: ${item.label}`);
                realmDeleted = true;
              } else {
                console.log(`⚠️ Book not found in Realm: ${item.label}`);
              }
            }
          });
        }
      } catch (realmError) {
        console.error('Error deleting from Realm:', realmError);
      }
      
      // تحديث فوري للواجهة
      if (firebaseDeleted || realmDeleted) {
      setTimeout(() => {
        forceReload();
      }, 100);
      return true;
      } else {
        console.error('Failed to delete from both sources');
        return false;
      }
    } catch (error) {
      console.error('خطأ في الحذف:', error);
      return false;
    }
  };

  // تسجيل الجهاز الحالي - محذوفة
  // const registerDevice = async () => {
  //   try {
  //     const deviceId = await AsyncStorage.getItem('deviceId');
  //     if (!deviceId) {
  //       console.log('No device ID found');
  //       return;
  //     }

  //     await setDoc(doc(db, 'devices', deviceId), {
  //       deviceId,
  //       platform: Platform.OS,
  //       lastActive: serverTimestamp(),
  //       appVersion: '1.0.0',
  //       installDate: serverTimestamp(),
  //       isInstalled: true
  //     }, { merge: true });

  //   } catch (err) {
  //     console.error('Error registering device:', err);
  //   }
  // };

  // دالة تنظيف الأقسام المكررة - محذوفة
  // const handleCleanupDuplicateCategories = async () => {
  //   try {
  //     console.log('🧹 Admin triggered category cleanup');
  //     const dataService = await import('../services/dataService');
  //     await dataService.default.cleanupDuplicateCategories();
  //     Alert.alert('نجح', 'تم تنظيف الأقسام المكررة بنجاح!');
  //   } catch (error) {
  //     console.error('❌ Category cleanup failed:', error);
  //     Alert.alert('خطأ', 'فشل تنظيف الأقسام');
  //   }
  // };

  // إزالة فحص التحميل لأننا لا نحتاجه بعد الآن

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header مع أزرار الخروج */}
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.exitButton} onPress={handleExitDashboard}>
          <Text style={styles.exitButtonText}>← خروج</Text>
        </TouchableOpacity>
        
        <Text style={styles.title}>لوحة الإدارة</Text>
        
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </View>
      
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setError(null)}>
            <Text style={styles.retryButtonText}>إغلاق</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* الأزرار مرتبة في صفوف */}
      {(!showMainForm && !showSubForm && !showSubSubForm && !showContentForm && !showCategoryManagement && !showUpdatesManagement && !showUrlContentForm) && (
        <View style={styles.buttonsContainer}>
          {/* الصف الأول: زران */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
              setShowCategoryManagement(!showCategoryManagement);
              setShowMainForm(false);
            setShowSubForm(false);
              setShowSubSubForm(false);
            setShowContentForm(false);
            }}>
              <Text style={styles.btnText}>إدارة الأقسام</Text>
        </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
            setShowContentForm(!showContentForm);
            setShowMainForm(false);
            setShowSubForm(false);
              setShowSubSubForm(false);
              setShowCategoryManagement(false);
            }}>
              <Text style={styles.btnText}>إضافة المحتوى</Text>
        </TouchableOpacity>
      </View>

          {/* الصف الثاني: زران */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShowAdmins}>
              <Text style={styles.btnText}>عرض المشرفين</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
              setShowUpdatesManagement(!showUpdatesManagement);
              setShowMainForm(false);
              setShowSubForm(false);
              setShowSubSubForm(false);
              setShowContentForm(false);
              setShowCategoryManagement(false);
              setShowUrlContentForm(false);
            }}>
              <Text style={styles.btnText}>إدارة المستجدات</Text>
            </TouchableOpacity>
          </View>

          {/* الصف الثالث: زر واحد */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
              setShowUrlContentForm(!showUrlContentForm);
              setShowMainForm(false);
              setShowSubForm(false);
              setShowSubSubForm(false);
              setShowContentForm(false);
              setShowCategoryManagement(false);
              setShowUpdatesManagement(false);
            }}>
              <Text style={styles.btnText}>إضافة محتوى بالرابط</Text>
            </TouchableOpacity>
          </View>

          {/* تمت إزالة زر التعديل والحذف / البحث بناءً على طلبك */}

          {/* الصف الخامس: زر تنظيف الأقسام المكررة - محذوف */}
          {/* <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.wideBtn]} onPress={handleCleanupDuplicateCategories}>
              <Text style={styles.btnText}>🧹 تنظيف الأقسام المكررة</Text>
            </TouchableOpacity>
          </View> */}
        </View>
      )}

      {/* قائمة إدارة الأقسام */}
      {showCategoryManagement && (
        <View style={styles.categoryManagementContainer}>
          <Text style={styles.categoryManagementTitle}>إدارة الأقسام</Text>
          <View style={styles.categoryButtonsContainer}>
            <TouchableOpacity style={styles.categoryBtn} onPress={() => {
              setShowMainForm(true);
              setShowSubForm(false);
              setShowSubSubForm(false);
              setShowCategoryManagement(false);
            }}>
              <Text style={styles.categoryBtnText}>إنشاء قسم رئيسي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.categoryBtn} onPress={() => {
              setShowSubForm(true);
              setShowMainForm(false);
              setShowSubSubForm(false);
              setShowCategoryManagement(false);
            }}>
              <Text style={styles.categoryBtnText}>إنشاء قسم فرعي</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.categoryBtn} onPress={() => {
              setShowSubSubForm(true);
              setShowMainForm(false);
              setShowSubForm(false);
              setShowCategoryManagement(false);
            }}>
              <Text style={styles.categoryBtnText}>إنشاء قسم فرعي ثانوي</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* قائمة إدارة المستجدات المحدثة */}
      {showUpdatesManagement && (
        <View style={styles.updatesManagementContainer}>
          <Text style={styles.updatesManagementTitle}>📱 إدارة المستجدات</Text>
          
          {/* أزرار اختيار نوع المستجدة */}
          <View style={styles.updatesTypeContainer}>
            <TouchableOpacity
              style={[styles.updatesTabBtn, updatesType === 'image' && styles.updatesTabBtnActive]}
              onPress={() => setUpdatesType('image')}
            >
              <Text style={[styles.updatesTabBtnText, updatesType === 'image' && styles.updatesTabBtnTextActive]}>
                📷 نشر صورة
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.updatesTabBtn, updatesType === 'article' && styles.updatesTabBtnActive]}
              onPress={() => setUpdatesType('article')}
            >
              <Text style={[styles.updatesTabBtnText, updatesType === 'article' && styles.updatesTabBtnTextActive]}>
                ✍️ كتابة مقال
              </Text>
            </TouchableOpacity>
          </View>

          {/* عرض النموذج المناسب */}
          <UpdatesManagementForm 
            type={updatesType}
            onClose={() => {
              setShowUpdatesManagement(false);
              setEditUpdate(null);
            }}
            onSuccess={() => {
              setShowUpdatesManagement(false);
              setEditUpdate(null);
              Alert.alert('نجح', editUpdate ? 
                (updatesType === 'image' ? 'تم تحديث الصور بنجاح!' : 'تم تحديث المقال بنجاح!') :
                (updatesType === 'image' ? 'تم نشر الصور بنجاح!' : 'تم نشر المقال بنجاح!')
              );
            }}
            editData={editUpdate}
          />
        </View>
      )}

      {/* نموذج إضافة المحتوى عبر الرابط */}
      {showUrlContentForm && (
        <View style={styles.urlContentFormContainer}>
          <Text style={styles.urlContentFormTitle}>🔗 إضافة محتوى عبر الرابط</Text>
          <UrlContentForm 
            onClose={() => {
              setShowUrlContentForm(false);
            }}
            onSuccess={() => {
              setShowUrlContentForm(false);
              Alert.alert('نجح', 'تم إضافة المحتوى عبر الرابط بنجاح!');
            }}
          />
        </View>
      )}

      {/* أزرار الإغلاق/التراجع */}
      {(showMainForm || showSubForm || showSubSubForm || showContentForm || showCategoryManagement || showUpdatesManagement || showUrlContentForm) && (
        <View style={styles.closeButtonContainer}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => {
            setShowMainForm(false);
            setShowSubForm(false);
            setShowSubSubForm(false);
            setShowContentForm(false);
            setShowCategoryManagement(false);
            setShowUpdatesManagement(false);
            setShowUrlContentForm(false);
            setEditCategory(null);
            setEditCategoryType(null);
            setEditContent(null);
            setEditUpdate(null);
          }}>
            <Text style={styles.closeBtnText}>✕ إغلاق</Text>
          </TouchableOpacity>
        </View>
      )}

      {showMainForm && <CategoryForm type="main" onCategoryAdded={handleFormClosed} onStatsChanged={forceReload} editCategory={editCategoryType==='main'?editCategory:null} />}
      {showSubForm && <CategoryForm type="sub" onCategoryAdded={handleFormClosed} onStatsChanged={forceReload} editCategory={editCategoryType==='sub'?editCategory:null} />}
      {showSubSubForm && <CategoryForm type="subsub" onCategoryAdded={handleFormClosed} onStatsChanged={forceReload} editCategory={editCategoryType==='subsub'?editCategory:null} />}
      
      {/* نموذج إضافة الملفات المحلية (BookForm) - للملفات المختارة من داخل التطبيق أو المشتركة من تطبيقات خارجية */}
      {showContentForm && <ContentForm onBookAdded={handleFormClosed} onStatsChanged={forceReload} editContent={editContent} contentType={contentType} />}

      <Modal visible={showAdmins} transparent animationType="slide">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center'}}>
          <View style={{backgroundColor:'#fff',padding:24,borderRadius:12,width:320,maxHeight:'80%'}}>
            <Text style={{fontSize:20,fontWeight:'bold',marginBottom:12}}>قائمة المشرفين</Text>
            {loadingAdmins ? <Text>جاري التحميل...</Text> : (
              admins.map((admin, idx) => (
                <View key={admin.id} style={{flexDirection:'row',alignItems:'center',marginBottom:8}}>
                  <Text style={{flex:1,fontSize:16}}>
                    {admin.username}
                  </Text>
                  {currentAdmin && (
                    <TouchableOpacity onPress={()=>handleBanAdmin(admin.id)} style={{backgroundColor:'#d32f2f',padding:6,borderRadius:6}}>
                      <Text style={{color:'#fff'}}>حظر</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
            <Button title="إغلاق" onPress={()=>setShowAdmins(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f6fcfa',
    minHeight: '100%',
  },
  centerContent: {
    justifyContent: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#197278',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#d32f2f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  buttonsContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 6,
    minWidth: 140,
    alignItems: 'center',
    elevation: 2,
  },
  wideBtn: {
    minWidth: 280,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#135d61',
  },
  closeButtonContainer: {
    alignItems: 'center',
    marginTop: 18,
  },
  closeBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 6,
    minWidth: 140,
    alignItems: 'center',
    elevation: 2,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  categoryManagementContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  categoryManagementTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#197278',
    textAlign: 'center',
  },
  categoryButtonsContainer: {
    alignItems: 'center',
  },
  categoryBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 6,
    minWidth: 200,
    alignItems: 'center',
    elevation: 2,
  },
  categoryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  // New styles for UpdatesManagementForm
  updatesFormContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  updatesFormTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#197278',
    textAlign: 'center',
  },
  imagePickerContainer: {
    marginBottom: 12,
  },
  imagePickerLabel: {
    fontSize: 14,
    color: '#197278',
    marginBottom: 8,
    fontWeight: '600',
  },
  imagePickerBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    elevation: 2,
  },
  imagePickerBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  selectedImagesContainer: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  selectedImageItem: {
    position: 'relative',
    marginRight: 8,
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  selectedImageThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  removeImageText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  descriptionContainer: {
    marginBottom: 12,
  },
  descriptionLabel: {
    fontSize: 14,
    color: '#197278',
    marginBottom: 8,
    fontWeight: '600',
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#b2dfdb',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    textAlign: 'right',
    minHeight: 80,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  updatesFormActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  publishBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 140,
    alignItems: 'center',
    elevation: 2,
  },
  publishBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  publishBtnDisabled: {
    backgroundColor: '#a5d6a7',
    opacity: 0.7,
  },
  cancelBtn: {
    backgroundColor: '#d32f2f',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 140,
    alignItems: 'center',
    elevation: 2,
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  exitButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  exitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    color: '#197278',
    marginBottom: 8,
    fontWeight: '600',
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#b2dfdb',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    textAlign: 'right',
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  articleContainer: {
    marginBottom: 12,
  },
  articleLabel: {
    fontSize: 14,
    color: '#197278',
    marginBottom: 8,
    fontWeight: '600',
  },
  articleInput: {
    borderWidth: 1,
    borderColor: '#b2dfdb',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    textAlign: 'right',
    minHeight: 100,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  // New styles for UpdatesManagementContainer
  updatesManagementContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  updatesManagementTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#197278',
    textAlign: 'center',
  },
  updatesTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  updatesTabBtn: {
    backgroundColor: '#e0f2f1',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#b2dfdb',
  },
  updatesTabBtnActive: {
    backgroundColor: '#197278',
    borderColor: '#197278',
  },
  updatesTabBtnText: {
    color: '#197278',
    fontWeight: '600',
    fontSize: 14,
  },
  updatesTabBtnTextActive: {
    color: '#fff',
  },
  addMoreImagesBtn: {
    backgroundColor: '#197278',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    elevation: 2,
    justifyContent: 'center',
    minHeight: 80,
    minWidth: 80,
  },
  addMoreImagesText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  // New styles for UrlContentForm
  urlContentFormContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  urlContentFormTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#197278',
    textAlign: 'center',
  },
  disabledBtn: {
    backgroundColor: '#a5d6a7',
    opacity: 0.7,
  },
}); 