import React, { useState, useContext } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  Modal, 
  TextInput,
  ActivityIndicator 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { collection, deleteDoc, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import dataService from '../services/dataService';

export default function AdminActionHandler({ 
  item, 
  itemType, 
  onSuccess, 
  onCancel,
  children 
}) {
  const { isAdmin } = useContext(AppSettingsContext);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  // إذا لم يكن المستخدم مشرف، لا تظهر أي شيء
  if (!isAdmin) {
    return children;
  }

  const handleLongPress = () => {
    console.log('👆 Long press detected');
    if (!isAdmin) {
      console.log('❌ User is not admin, ignoring long press');
      return;
    }
    
    console.log('✅ Admin long press - opening modal');
    setNewName(item.label || item.bookName || item.mainCategory || item.subCategory || item.subSubCategory || '');
    setShowModal(true);
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleDelete = () => {
    Alert.alert(
      'تأكيد الحذف النهائي',
      `هل أنت متأكد أنك تريد حذف "${item.label || item.bookName || item.mainCategory || item.subCategory || item.subSubCategory}" نهائياً؟\n\n⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه أبداً!`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { 
          text: 'حذف نهائي', 
          style: 'destructive',
          onPress: performDelete
        }
      ]
    );
  };

  const performDelete = async () => {
    setLoading(true);
    try {
             console.log(`🗑️ Starting permanent deletion for: ${item.label || item.bookName}`);
       
       // لا نحتاج لإنشاء الأقسام قبل الحذف - نحذف مباشرة
      
      // حذف من Firebase - تحسين التعامل مع الـ IDs
      if (item.source === 'firebase' || !item.source) {
        try {
          if (itemType === 'book' || itemType === 'content') {
            // البحث عن الكتاب في Firebase بالاسم
            const booksQuery = query(collection(db, 'books'), where('bookName', '==', item.bookName || item.label));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const deletePromises = booksSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
            }
          } else if (itemType === 'mainCategory') {
            // البحث عن القسم الرئيسي في Firebase
            const categoriesQuery = query(collection(db, 'categories'), where('mainCategory', '==', item.mainCategory.trim()));
            const categoriesSnap = await getDocs(categoriesQuery);
            if (!categoriesSnap.empty) {
              const deletePromises = categoriesSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
              console.log(`🗑️ Deleted ${categoriesSnap.docs.length} categories from Firebase for main category: ${item.mainCategory}`);
            }
            
            // حذف جميع الكتب المرتبطة
            const booksQuery = query(collection(db, 'books'), where('mainCategory', '==', item.mainCategory.trim()));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const deletePromises = booksSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
              console.log(`🗑️ Deleted ${booksSnap.docs.length} books from Firebase for main category: ${item.mainCategory}`);
            }
            
                         // إذا لم نجد أي شيء في Firebase، هذا طبيعي - نتابع مع Realm
             if (categoriesSnap.empty && booksSnap.empty) {
               console.log(`🗑️ No data found in Firebase for main category: ${item.mainCategory} - this is normal, continuing with Realm deletion`);
             }
          } else if (itemType === 'subCategory') {
            // البحث عن القسم الفرعي في Firebase
            const categoriesQuery = query(collection(db, 'categories'), where('subCategory', '==', item.subCategory));
            const categoriesSnap = await getDocs(categoriesQuery);
            if (!categoriesSnap.empty) {
              const deletePromises = categoriesSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
            }
            
            // حذف جميع الكتب المرتبطة
            const booksQuery = query(collection(db, 'books'), where('subCategory', '==', item.subCategory));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const deletePromises = booksSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
            }
          } else if (itemType === 'subSubCategory') {
            // البحث عن القسم الفرعي الثانوي في Firebase
            const categoriesQuery = query(collection(db, 'categories'), where('subSubCategory', '==', item.subSubCategory));
            const categoriesSnap = await getDocs(categoriesQuery);
            if (!categoriesSnap.empty) {
              const deletePromises = categoriesSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
            }
            
            // حذف جميع الكتب المرتبطة
            const booksQuery = query(collection(db, 'books'), where('subSubCategory', '==', item.subSubCategory));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const deletePromises = booksSnap.docs.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);
            }
          }
        } catch (firebaseError) {
          console.warn('⚠️ Firebase deletion failed, continuing with Realm:', firebaseError);
        }
      }

      // حذف نهائي من Realm المحلي
      if (item.source === 'realm' || !item.source) {
        if (dataService?.realm) {
          const realm = dataService.realm;
          
          if (itemType === 'book' || itemType === 'content') {
            console.log(`🔍 Searching for book in Realm: "${item.bookName || item.label}"`);
            console.log(`🔍 Item data:`, JSON.stringify(item, null, 2));
            
            // البحث عن الكتاب بالاسم أو ID
            let book = null;
            if (item.data?.id) {
              book = realm.objectForPrimaryKey('Book', item.data.id);
              console.log(`🔍 Searched by ID: ${item.data.id} - Found: ${book ? 'Yes' : 'No'}`);
            }
            if (!book && (item.bookName || item.label)) {
              const books = realm.objects('Book').filtered('bookName == $0', (item.bookName || item.label).trim());
              book = books[0];
              console.log(`🔍 Searched by name: "${(item.bookName || item.label).trim()}" - Found: ${book ? 'Yes' : 'No'}`);
            }
            
            if (book) {
              realm.write(() => {
                realm.delete(book);
              });
              console.log(`🗑️ Deleted book from Realm: ${item.bookName || item.label}`);
            } else {
              console.log(`⚠️ Book not found in Realm: ${item.bookName || item.label}`);
            }
          } else if (itemType === 'mainCategory') {
            console.log(`🔍 Searching for main category in Realm: "${item.mainCategory}"`);
            console.log(`🔍 Item data:`, JSON.stringify(item, null, 2));
            
            // حذف جميع الكتب المرتبطة نهائياً
            const relatedBooks = realm.objects('Book').filtered('mainCategory == $0', item.mainCategory.trim());
            const relatedCategories = realm.objects('Category').filtered('mainCategory == $0', item.mainCategory.trim());
            
            console.log(`📚 Found ${relatedBooks.length} related books`);
            console.log(`📂 Found ${relatedCategories.length} related categories`);
            
            realm.write(() => {
              // حذف كل كتاب على حدة
              relatedBooks.forEach(book => {
                realm.delete(book);
              });
              // حذف كل فئة على حدة
              relatedCategories.forEach(cat => {
                realm.delete(cat);
              });
            });
            console.log(`🗑️ Deleted ${relatedBooks.length} books and ${relatedCategories.length} categories from Realm for main category: ${item.mainCategory}`);
          } else if (itemType === 'subCategory') {
            // حذف جميع الكتب المرتبطة نهائياً
            const relatedBooks = realm.objects('Book').filtered('subCategory == $0', item.subCategory.trim());
            
            console.log(`📚 Found ${relatedBooks.length} related books for sub category: ${item.subCategory}`);
            
            realm.write(() => {
              // حذف كل كتاب على حدة
              relatedBooks.forEach(book => {
                realm.delete(book);
              });
            });
            console.log(`🗑️ Deleted ${relatedBooks.length} books from Realm for sub category: ${item.subCategory}`);
          } else if (itemType === 'subSubCategory') {
            // حذف جميع الكتب المرتبطة نهائياً
            const relatedBooks = realm.objects('Book').filtered('subSubCategory == $0', item.subSubCategory.trim());
            
            console.log(`📚 Found ${relatedBooks.length} related books for sub-sub category: ${item.subSubCategory}`);
            
            realm.write(() => {
              // حذف كل كتاب على حدة
              relatedBooks.forEach(book => {
                realm.delete(book);
              });
            });
            console.log(`🗑️ Deleted ${relatedBooks.length} books from Realm for sub-sub category: ${item.subSubCategory}`);
          }
        }
      }

      console.log('✅ Deletion completed successfully');
      Alert.alert('نجح الحذف', 'تم حذف العنصر نهائياً بنجاح');
      onSuccess && onSuccess();
      
    } catch (error) {
      console.error('❌ Error during deletion:', error);
      Alert.alert('خطأ', 'فشل في حذف العنصر');
    } finally {
      setLoading(false);
      setShowModal(false);
    }
  };

  const performEdit = async () => {
    if (!newName.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم صحيح');
      return;
    }

    setLoading(true);
    try {
             console.log(`✏️ Starting edit for: ${item.label || item.bookName} -> ${newName}`);
       
       // لا نحتاج لإنشاء الأقسام قبل التعديل - نعدل مباشرة
      
      // تحديث في Firebase - تحسين التعامل مع الـ IDs
      if (item.source === 'firebase' || !item.source) {
        try {
          if (itemType === 'book' || itemType === 'content') {
            // البحث عن الكتاب في Firebase بالاسم
            const booksQuery = query(collection(db, 'books'), where('bookName', '==', item.bookName || item.label));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const updatePromises = booksSnap.docs.map(doc => updateDoc(doc.ref, { bookName: newName }));
              await Promise.all(updatePromises);
            }
          } else if (itemType === 'mainCategory') {
            // البحث عن القسم الرئيسي في Firebase
            const categoriesQuery = query(collection(db, 'categories'), where('mainCategory', '==', item.mainCategory.trim()));
            const categoriesSnap = await getDocs(categoriesQuery);
            if (!categoriesSnap.empty) {
              const updatePromises = categoriesSnap.docs.map(doc => updateDoc(doc.ref, { mainCategory: newName.trim() }));
              await Promise.all(updatePromises);
              console.log(`✏️ Updated ${categoriesSnap.docs.length} categories in Firebase for main category: ${item.mainCategory} -> ${newName}`);
            }
            
            // تحديث جميع الكتب المرتبطة
            const booksQuery = query(collection(db, 'books'), where('mainCategory', '==', item.mainCategory.trim()));
            const booksSnap = await getDocs(booksQuery);
            if (!booksSnap.empty) {
              const updatePromises = booksSnap.docs.map(doc => updateDoc(doc.ref, { mainCategory: newName.trim() }));
              await Promise.all(updatePromises);
              console.log(`✏️ Updated ${booksSnap.docs.length} books in Firebase for main category: ${item.mainCategory} -> ${newName}`);
            }
            
                         // إذا لم نجد أي شيء في Firebase، هذا طبيعي - نتابع مع Realm
             if (categoriesSnap.empty && booksSnap.empty) {
               console.log(`✏️ No data found in Firebase for main category: ${item.mainCategory} - this is normal, continuing with Realm update`);
             }
                      } else if (itemType === 'subCategory') {
              // البحث عن القسم الفرعي في Firebase
              const categoriesQuery = query(collection(db, 'categories'), where('subCategory', '==', item.subCategory.trim()));
              const categoriesSnap = await getDocs(categoriesQuery);
              if (!categoriesSnap.empty) {
                const updatePromises = categoriesSnap.docs.map(doc => updateDoc(doc.ref, { subCategory: newName.trim() }));
                await Promise.all(updatePromises);
                console.log(`✏️ Updated ${categoriesSnap.docs.length} categories in Firebase for sub category: ${item.subCategory} -> ${newName}`);
              }
              
              // تحديث جميع الكتب المرتبطة
              const booksQuery = query(collection(db, 'books'), where('subCategory', '==', item.subCategory.trim()));
              const booksSnap = await getDocs(booksQuery);
              if (!booksSnap.empty) {
                const updatePromises = booksSnap.docs.map(doc => updateDoc(doc.ref, { subCategory: newName.trim() }));
                await Promise.all(updatePromises);
                console.log(`✏️ Updated ${booksSnap.docs.length} books in Firebase for sub category: ${item.subCategory} -> ${newName}`);
              }
                      } else if (itemType === 'subSubCategory') {
              // البحث عن القسم الفرعي الثانوي في Firebase
              const categoriesQuery = query(collection(db, 'categories'), where('subSubCategory', '==', item.subSubCategory.trim()));
              const categoriesSnap = await getDocs(categoriesQuery);
              if (!categoriesSnap.empty) {
                const updatePromises = categoriesSnap.docs.map(doc => updateDoc(doc.ref, { subSubCategory: newName.trim() }));
                await Promise.all(updatePromises);
                console.log(`✏️ Updated ${categoriesSnap.docs.length} categories in Firebase for sub-sub category: ${item.subSubCategory} -> ${newName}`);
              }
              
              // تحديث جميع الكتب المرتبطة
              const booksQuery = query(collection(db, 'books'), where('subSubCategory', '==', item.subSubCategory.trim()));
              const booksSnap = await getDocs(booksQuery);
              if (!booksSnap.empty) {
                const updatePromises = booksSnap.docs.map(doc => updateDoc(doc.ref, { subSubCategory: newName.trim() }));
                await Promise.all(updatePromises);
                console.log(`✏️ Updated ${booksSnap.docs.length} books in Firebase for sub-sub category: ${item.subSubCategory} -> ${newName}`);
              }
          }
        } catch (firebaseError) {
          console.warn('⚠️ Firebase update failed, continuing with Realm:', firebaseError);
        }
      }

      // تحديث في Realm المحلي
      if (item.source === 'realm' || !item.source) {
        if (dataService?.realm) {
          const realm = dataService.realm;
          
          if (itemType === 'book' || itemType === 'content') {
            console.log(`🔍 Searching for book to edit in Realm: "${item.bookName || item.label}"`);
            
            // البحث عن الكتاب بالاسم أو ID
            let book = null;
            if (item.data?.id) {
              book = realm.objectForPrimaryKey('Book', item.data.id);
              console.log(`🔍 Searched by ID: ${item.data.id} - Found: ${book ? 'Yes' : 'No'}`);
            }
            if (!book && (item.bookName || item.label)) {
              const books = realm.objects('Book').filtered('bookName == $0', (item.bookName || item.label).trim());
              book = books[0];
              console.log(`🔍 Searched by name: "${(item.bookName || item.label).trim()}" - Found: ${book ? 'Yes' : 'No'}`);
            }
            
            if (book) {
              realm.write(() => {
                book.bookName = newName.trim();
              });
              console.log(`✏️ Updated book name in Realm: ${item.bookName || item.label} -> ${newName}`);
            } else {
              console.log(`⚠️ Book not found in Realm for editing: ${item.bookName || item.label}`);
            }
          } else if (itemType === 'mainCategory') {
            console.log(`🔍 Searching for main category to edit in Realm: "${item.mainCategory}"`);
            
            const relatedBooks = realm.objects('Book').filtered('mainCategory == $0', item.mainCategory.trim());
            const relatedCategories = realm.objects('Category').filtered('mainCategory == $0', item.mainCategory.trim());
            
            console.log(`📚 Found ${relatedBooks.length} related books to update`);
            console.log(`📂 Found ${relatedCategories.length} related categories to update`);
            
            realm.write(() => {
              relatedBooks.forEach(book => { 
                book.mainCategory = newName.trim(); 
                console.log(`✏️ Updated book: ${book.bookName} mainCategory -> ${newName}`);
              });
              relatedCategories.forEach(cat => { 
                cat.mainCategory = newName.trim(); 
                console.log(`✏️ Updated category mainCategory -> ${newName}`);
              });
            });
            console.log(`✏️ Updated ${relatedBooks.length} books and ${relatedCategories.length} categories in Realm for main category: ${item.mainCategory} -> ${newName}`);
          } else if (itemType === 'subCategory') {
            const relatedBooks = realm.objects('Book').filtered('subCategory == $0', item.subCategory.trim());
            console.log(`📚 Found ${relatedBooks.length} related books to update for sub category: ${item.subCategory}`);
            
            realm.write(() => {
              relatedBooks.forEach(book => { 
                book.subCategory = newName.trim(); 
                console.log(`✏️ Updated book: ${book.bookName} subCategory -> ${newName}`);
              });
            });
            console.log(`✏️ Updated ${relatedBooks.length} books in Realm for sub category: ${item.subCategory} -> ${newName}`);
          } else if (itemType === 'subSubCategory') {
            const relatedBooks = realm.objects('Book').filtered('subSubCategory == $0', item.subSubCategory.trim());
            console.log(`📚 Found ${relatedBooks.length} related books to update for sub-sub category: ${item.subSubCategory}`);
            
            realm.write(() => {
              relatedBooks.forEach(book => { 
                book.subSubCategory = newName.trim(); 
                console.log(`✏️ Updated book: ${book.bookName} subSubCategory -> ${newName}`);
              });
            });
            console.log(`✏️ Updated ${relatedBooks.length} books in Realm for sub-sub category: ${item.subSubCategory} -> ${newName}`);
          }
        }
      }

      console.log('✅ Edit completed successfully');
      Alert.alert('نجح التعديل', 'تم تحديث الاسم بنجاح');
      onSuccess && onSuccess();
      
    } catch (error) {
      console.error('❌ Error during edit:', error);
      Alert.alert('خطأ', 'فشل في تحديث الاسم');
    } finally {
      setLoading(false);
      setShowModal(false);
      setEditMode(false);
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setEditMode(false);
    setNewName('');
    onCancel && onCancel();
  };

  // إضافة onLongPress إلى children مباشرة بدلاً من تغليفها بـ TouchableOpacity
  const childrenWithLongPress = React.cloneElement(children, {
    onLongPress: handleLongPress,
    delayLongPress: 500, // تأخير 500 مللي ثانية للضغط المطول
    onPressIn: () => {
      // إضافة تشخيص للضغط
      console.log('👆 Press detected on admin item');
    },
    onPress: (event) => {
      // الحفاظ على السلوك الأصلي للضغط العادي
      if (children.props.onPress) {
        children.props.onPress(event);
      }
    },
    activeOpacity: children.props.activeOpacity || 0.7,
    style: children.props.style,
    key: children.key,
    disabled: children.props.disabled,
    testID: children.props.testID,
    accessibilityLabel: children.props.accessibilityLabel,
    accessibilityRole: children.props.accessibilityRole,
    accessibilityHint: children.props.accessibilityHint,
    accessibilityState: children.props.accessibilityState,
    accessibilityActions: children.props.accessibilityActions,
    accessibilityViewIsModal: children.props.accessibilityViewIsModal,
    accessibilityLiveRegion: children.props.accessibilityLiveRegion,
    accessibilityElementsHidden: children.props.accessibilityElementsHidden,
    accessibilityIgnoresInvertColors: children.props.accessibilityIgnoresInvertColors,
    accessibilityImportantForAccessibility: children.props.accessibilityImportantForAccessibility,
    accessibilityTraits: children.props.accessibilityTraits,
    accessibilityComponentType: children.props.accessibilityComponentType,
    accessibilityValue: children.props.accessibilityValue,
    accessibilityLanguage: children.props.accessibilityLanguage,
    accessibilityViewIsModal: children.props.accessibilityViewIsModal,
    accessibilityLiveRegion: children.props.accessibilityLiveRegion,
    accessibilityElementsHidden: children.props.accessibilityElementsHidden,
    accessibilityIgnoresInvertColors: children.props.accessibilityIgnoresInvertColors,
    accessibilityImportantForAccessibility: children.props.accessibilityImportantForAccessibility,
    accessibilityTraits: children.props.accessibilityTraits,
    accessibilityComponentType: children.props.accessibilityComponentType,
    accessibilityValue: children.props.accessibilityValue,
    accessibilityLanguage: children.props.accessibilityLanguage,
    accessibilityViewIsModal: children.props.accessibilityViewIsModal,
    accessibilityLiveRegion: children.props.accessibilityLiveRegion,
    accessibilityElementsHidden: children.props.accessibilityElementsHidden,
    accessibilityIgnoresInvertColors: children.props.accessibilityIgnoresInvertColors,
    accessibilityImportantForAccessibility: children.props.accessibilityImportantForAccessibility,
    accessibilityTraits: children.props.accessibilityTraits,
    accessibilityComponentType: children.props.accessibilityComponentType,
    accessibilityValue: children.props.accessibilityValue,
    accessibilityLanguage: children.props.accessibilityLanguage,
    accessibilityViewIsModal: children.props.accessibilityViewIsModal,
    accessibilityLiveRegion: children.props.accessibilityLiveRegion,
    accessibilityElementsHidden: children.props.accessibilityElementsHidden,
    accessibilityIgnoresInvertColors: children.props.accessibilityIgnoresInvertColors,
    accessibilityImportantForAccessibility: children.props.accessibilityImportantForAccessibility,
    accessibilityTraits: children.props.accessibilityTraits,
    accessibilityComponentType: children.props.accessibilityComponentType,
    accessibilityValue: children.props.accessibilityValue,
    accessibilityLanguage: children.props.accessibilityLanguage,
    accessibilityViewIsModal: children.props.accessibilityViewIsModal,
    accessibilityLiveRegion: children.props.accessibilityLiveRegion
  });

  return (
    <>
      {childrenWithLongPress}

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editMode ? 'تعديل الاسم' : 'إدارة العنصر'}
            </Text>
            
            {editMode ? (
              <View style={styles.editContainer}>
                <Text style={styles.editLabel}>الاسم الجديد:</Text>
                <TextInput
                  style={styles.textInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="أدخل الاسم الجديد"
                  autoFocus={true}
                />
              </View>
            ) : (
              <Text style={styles.modalText}>
                {item.label || item.bookName || item.mainCategory || item.subCategory || item.subSubCategory}
              </Text>
            )}

            <View style={styles.buttonContainer}>
              {editMode ? (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={performEdit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="save" size={20} color="#fff" />
                        <Text style={styles.buttonText}>حفظ</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => setEditMode(false)}
                    disabled={loading}
                  >
                    <MaterialIcons name="arrow-back" size={20} color="#fff" />
                    <Text style={styles.buttonText}>رجوع</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.editButton]}
                    onPress={handleEdit}
                  >
                    <MaterialIcons name="edit" size={20} color="#fff" />
                    <Text style={styles.buttonText}>تعديل</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.button, styles.deleteButton]}
                    onPress={handleDelete}
                  >
                    <MaterialIcons name="delete" size={20} color="#fff" />
                    <Text style={styles.buttonText}>حذف</Text>
                  </TouchableOpacity>
                </>
              )}
              
              <TouchableOpacity
                style={[styles.button, styles.closeButton]}
                onPress={handleCancel}
                disabled={loading}
              >
                <MaterialIcons name="close" size={20} color="#fff" />
                <Text style={styles.buttonText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    minWidth: 300,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#333',
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  editContainer: {
    marginBottom: 20,
  },
  editLabel: {
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#2196F3',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#FF9800',
  },
  closeButton: {
    backgroundColor: '#9E9E9E',
  },
  buttonText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
