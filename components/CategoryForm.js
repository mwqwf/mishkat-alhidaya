import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { getFirestore, collection, addDoc, getDocs, query, doc, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { db, storage } from '../config/firebase';
import { ref, deleteObject } from 'firebase/storage';
import sha1 from 'js-sha1';
import { useData } from '../context/DataContext';
import eventEmitter from '../utils/EventEmitter';

const dbFirestore = getFirestore();

export default function CategoryForm({ type, onCategoryAdded, onStatsChanged, editCategory }) {
  const { refreshStats, refreshCategories, forceSyncNewData } = useData();
  const [mainCategory, setMainCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (editCategory) {
      setEditMode(true);
      setEditingCategory(editCategory);
      if (type === 'main') {
        setMainCategory(editCategory.mainCategory);
      } else if (type === 'sub') {
        setMainCategory(editCategory.mainCategory);
        setSubCategory(editCategory.subCategory);
      } else {
        setMainCategory(editCategory.mainCategory);
        setSubCategory(editCategory.subCategory);
        setSubSubCategory(editCategory.subSubCategory);
      }
    }
  }, [editCategory, type]);

  const fetchCategories = async () => {
    const q = query(collection(dbFirestore, 'categories'));
    const querySnapshot = await getDocs(q);
    const cats = [];
    querySnapshot.forEach((doc) => {
      cats.push({ id: doc.id, ...doc.data() });
    });
    setCategories(cats);
  };

  const handleAddCategory = async () => {
    // التحقق من الحقول المطلوبة
    if ((type === 'main' && !mainCategory) || (type === 'sub' && (!mainCategory || !subCategory)) || (type === 'subsub' && (!mainCategory || !subCategory || !subSubCategory))) {
      if (editMode && editingCategory) {
        // في وضع التعديل، استخدم القيم الحالية إذا كانت الحقول فارغة
        const updatedMain = mainCategory || editingCategory.mainCategory;
        const updatedSub = subCategory || editingCategory.subCategory;
        const updatedSubSub = subSubCategory || editingCategory.subSubCategory || '';
        
        // تحديث الحقول في الواجهة
        setMainCategory(updatedMain);
        setSubCategory(updatedSub);
        setSubSubCategory(updatedSubSub);
        
        // تحديث القسم في قاعدة البيانات
        await handleUpdateCategory({
          mainCategory: updatedMain,
          subCategory: updatedSub,
          subSubCategory: updatedSubSub
        });
        return;
      } else {
        Alert.alert('خطأ', 'يرجى تعبئة جميع الحقول الإلزامية');
        return;
      }
    }
    
    setLoading(true);
    try {
      if (editMode && editingCategory) {
        // في وضع التعديل، تحديث القسم الحالي فقط
        await handleUpdateCategory();
        Alert.alert('تم التحديث', 'تم تحديث القسم بنجاح!');
      } else {
        // في وضع الإضافة، فحص عدم تكرار القسم
        const existingCategory = categories.find(cat => {
          if (type === 'main') {
            return cat.mainCategory === mainCategory && !cat.subCategory;
          } else if (type === 'sub') {
            return cat.mainCategory === mainCategory && cat.subCategory === subCategory && !cat.subSubCategory;
          } else {
            return cat.mainCategory === mainCategory && cat.subCategory === subCategory && cat.subSubCategory === subSubCategory;
          }
        });
        
        if (existingCategory) {
          Alert.alert('خطأ', 'هذا القسم موجود بالفعل!');
          setLoading(false);
          return;
        }
        
        // إنشاء قسم جديد
        if (type === 'main') {
          await addDoc(collection(dbFirestore, 'categories'), {
            mainCategory,
            createdAt: new Date(),
          });
        } else if (type === 'sub') {
          await addDoc(collection(dbFirestore, 'categories'), {
            mainCategory,
            subCategory,
            createdAt: new Date(),
          });
        } else if (type === 'subsub') {
          await addDoc(collection(dbFirestore, 'categories'), {
            mainCategory,
            subCategory,
            subSubCategory,
            createdAt: new Date(),
          });
        }
        Alert.alert('تمت الإضافة', 'تمت إضافة القسم بنجاح!');
      }
      
      eventEmitter.emit('forceRefresh', { timestamp: Date.now() });
      await refreshCategories?.(); // تحديث الأقسام من المصدر فوراً
      
      // مزامنة فورية مع قاعدة البيانات المحلية
      try {
        console.log('📁 CategoryForm: triggering immediate local sync after category addition');
        if (forceSyncNewData) {
          await forceSyncNewData();
          console.log('📁 CategoryForm: local sync completed successfully');
        }
      } catch (syncError) {
        console.error('📁 CategoryForm: local sync failed:', syncError);
        // لا نعرض خطأ للمستخدم لأن المزامنة قد تكون مؤجلة
      }
      
      resetForm();
      if (onCategoryAdded) onCategoryAdded();
      refreshStats(); // Update stats after adding a category
    } catch (error) {
      console.error('Error in handleAddCategory:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء ' + (editMode ? 'تحديث' : 'إضافة') + ' القسم');
    }
    setLoading(false);
  };

  const handleUpdateCategory = async (overrideObj) => {
    try {
      const categoryRef = doc(dbFirestore, 'categories', editingCategory.id);
      let updateData;
      
      if (overrideObj) {
        updateData = type === 'main'
          ? { mainCategory: overrideObj.mainCategory }
          : type === 'sub'
          ? { mainCategory: overrideObj.mainCategory, subCategory: overrideObj.subCategory }
          : { mainCategory: overrideObj.mainCategory, subCategory: overrideObj.subCategory, subSubCategory: overrideObj.subSubCategory };
      } else {
        updateData = type === 'main'
          ? { mainCategory }
          : type === 'sub'
          ? { mainCategory, subCategory }
          : { mainCategory, subCategory, subSubCategory };
      }
      
      // فحص عدم وجود قسم آخر بنفس الاسم الجديد (إلا إذا كان نفس القسم)
      const existingCategory = categories.find(cat => {
        if (cat.id === editingCategory.id) return false; // تجاهل القسم الحالي
        
        if (type === 'main') {
          return cat.mainCategory === updateData.mainCategory && !cat.subCategory;
        } else if (type === 'sub') {
          return cat.mainCategory === updateData.mainCategory && cat.subCategory === updateData.subCategory && !cat.subSubCategory;
        } else {
          return cat.mainCategory === updateData.mainCategory && cat.subCategory === updateData.subCategory && cat.subSubCategory === updateData.subSubCategory;
        }
      });
      
      if (existingCategory) {
        Alert.alert('خطأ', 'هذا القسم موجود بالفعل! يرجى اختيار اسم مختلف.');
        return;
      }
      
      // تحديث القسم في قاعدة البيانات
      await updateDoc(categoryRef, updateData);
      
      // تحديث جميع المحتوى المرتبط بالقسم القديم
      if (type === 'main' && editingCategory.mainCategory !== updateData.mainCategory) {
        // تحديث جميع الكتب المرتبطة بالقسم الرئيسي القديم
        const booksQuery = query(
          collection(dbFirestore, 'books'),
          where('mainCategory', '==', editingCategory.mainCategory)
        );
        const booksSnapshot = await getDocs(booksQuery);
        const bookUpdatePromises = booksSnapshot.docs.map(docSnap => 
          updateDoc(docSnap.ref, { mainCategory: updateData.mainCategory })
        );
        await Promise.all(bookUpdatePromises);
        console.log(`📁 CategoryForm: Updated ${booksSnapshot.docs.length} books for main category change`);
        
        // تحديث جميع الأقسام الفرعية والثانوية المرتبطة بالقسم الرئيسي القديم
        const subCategoriesQuery = query(
          collection(dbFirestore, 'categories'),
          where('mainCategory', '==', editingCategory.mainCategory)
        );
        const subCategoriesSnapshot = await getDocs(subCategoriesQuery);
        const updatePromises = subCategoriesSnapshot.docs
          .filter(docSnap => docSnap.id !== editingCategory.id) // لا تحدث القسم الحالي
          .map(docSnap => updateDoc(docSnap.ref, { mainCategory: updateData.mainCategory }));
        await Promise.all(updatePromises);
        console.log(`📁 CategoryForm: Updated ${updatePromises.length} subcategories for main category change`);
        
      } else if (type === 'sub' && (editingCategory.mainCategory !== updateData.mainCategory || editingCategory.subCategory !== updateData.subCategory)) {
        // تحديث جميع الكتب المرتبطة بالقسم الفرعي القديم
        const booksQuery = query(
          collection(dbFirestore, 'books'),
          where('mainCategory', '==', editingCategory.mainCategory),
          where('subCategory', '==', editingCategory.subCategory)
        );
        const booksSnapshot = await getDocs(booksQuery);
        const bookUpdatePromises = booksSnapshot.docs.map(docSnap => 
          updateDoc(docSnap.ref, { 
            mainCategory: updateData.mainCategory,
            subCategory: updateData.subCategory 
          })
        );
        await Promise.all(bookUpdatePromises);
        console.log(`📁 CategoryForm: Updated ${booksSnapshot.docs.length} books for sub category change`);
        
        // تحديث جميع الأقسام الفرعية الثانوية المرتبطة بالقسم الفرعي القديم
        const subSubCategoriesQuery = query(
          collection(dbFirestore, 'categories'),
          where('mainCategory', '==', editingCategory.mainCategory),
          where('subCategory', '==', editingCategory.subCategory)
        );
        const subSubCategoriesSnapshot = await getDocs(subSubCategoriesQuery);
        const updatePromises = subSubCategoriesSnapshot.docs
          .filter(docSnap => docSnap.id !== editingCategory.id) // لا تحدث القسم الحالي
          .map(docSnap => updateDoc(docSnap.ref, { 
            mainCategory: updateData.mainCategory,
            subCategory: updateData.subCategory 
          }));
        await Promise.all(updatePromises);
        console.log(`📁 CategoryForm: Updated ${updatePromises.length} sub-subcategories for sub category change`);
        
      } else if (type === 'subsub' && (editingCategory.mainCategory !== updateData.mainCategory || editingCategory.subCategory !== updateData.subCategory || editingCategory.subSubCategory !== updateData.subSubCategory)) {
        // تحديث جميع الكتب المرتبطة بالقسم الفرعي الثانوي القديم
        const booksQuery = query(
          collection(dbFirestore, 'books'),
          where('mainCategory', '==', editingCategory.mainCategory),
          where('subCategory', '==', editingCategory.subCategory),
          where('subSubCategory', '==', editingCategory.subSubCategory)
        );
        const booksSnapshot = await getDocs(booksQuery);
        const bookUpdatePromises = booksSnapshot.docs.map(docSnap => 
          updateDoc(docSnap.ref, { 
            mainCategory: updateData.mainCategory,
            subCategory: updateData.subCategory,
            subSubCategory: updateData.subSubCategory
          })
        );
        await Promise.all(bookUpdatePromises);
        console.log(`📁 CategoryForm: Updated ${booksSnapshot.docs.length} books for sub-sub category change`);
      }
      
      Alert.alert('تم التحديث', 'تم تحديث القسم وجميع المحتوى المرتبط به بنجاح!');
      eventEmitter.emit('forceRefresh', { timestamp: Date.now() });
      setEditMode(false);
      setEditingCategory(null);
      await refreshCategories?.(); // تحديث الأقسام من المصدر فوراً
      
      // مزامنة فورية مع قاعدة البيانات المحلية
      try {
        console.log('📁 CategoryForm: triggering immediate local sync after category update');
        if (forceSyncNewData) {
          await forceSyncNewData();
          console.log('📁 CategoryForm: local sync completed successfully after update');
        }
      } catch (syncError) {
        console.error('📁 CategoryForm: local sync failed after update:', syncError);
        // لا نعرض خطأ للمستخدم لأن المزامنة قد تكون مؤجلة
      }
      
      refreshStats(); // Update stats after updating a category
    } catch (error) {
      console.error('Error in handleUpdateCategory:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحديث القسم');
    }
  };

  const handleDeleteCategory = async (category) => {
    // تأكد من وجود id للقسم
    let categoryId = category.id;
    if (!categoryId) {
      // ابحث عن القسم في الحالة المحلية
      const found = categories.find(cat =>
        cat.mainCategory === category.mainCategory &&
        (category.subCategory ? cat.subCategory === category.subCategory : !cat.subCategory) &&
        (category.subSubCategory ? cat.subSubCategory === category.subSubCategory : !cat.subSubCategory)
      );
      if (found) {
        categoryId = found.id;
      }
    }
    if (!categoryId) {
      Alert.alert('خطأ', 'تعذر تحديد القسم بشكل صحيح (id مفقود)، يرجى إعادة تحميل الصفحة أو التواصل مع الدعم.');
      return;
    }
    Alert.alert(
      'تأكيد الحذف',
      'هل أنت متأكد من حذف هذا القسم؟ سيتم حذف جميع الأقسام الفرعية والكتب المرتبطة به من Firebase و Realm المحلي.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // حذف من Firebase أولاً
              // حذف الأقسام الفرعية أولاً
              const subCategoriesQuery = query(
                collection(dbFirestore, 'categories'),
                where('mainCategory', '==', category.mainCategory)
              );
              const subCategoriesSnapshot = await getDocs(subCategoriesQuery);
              const deletePromises = [];
              subCategoriesSnapshot.forEach((docSnap) => {
                deletePromises.push(deleteDoc(docSnap.ref));
              });
              
              // حذف الكتب المرتبطة
              const booksQuery = query(
                collection(dbFirestore, 'books'),
                where('mainCategory', '==', category.mainCategory)
              );
              const booksSnapshot = await getDocs(booksQuery);
              for (const docSnap of booksSnapshot.docs) {
                deletePromises.push(deleteDoc(docSnap.ref));
              }
              
              // حذف القسم الرئيسي نفسه
              deletePromises.push(deleteDoc(doc(dbFirestore, 'categories', categoryId)));
              await Promise.all(deletePromises);
              
              // حذف من Realm المحلي
              try {
                const { useData } = await import('../context/DataContext');
                const { dataService } = useData();
                
                if (dataService?.realm) {
                  const realm = dataService.realm;
                  realm.write(() => {
                    // حذف جميع الأقسام الفرعية والثانوية المرتبطة
                    const subCategories = realm.objects('Subcategory').filtered('mainCategory == $0', category.mainCategory);
                    realm.delete(subCategories);
                    
                    const subSubCategories = realm.objects('SubSubcategory').filtered('mainCategory == $0', category.mainCategory);
                    realm.delete(subSubCategories);
                    
                    // حذف جميع الكتب المرتبطة
                    const books = realm.objects('Book').filtered('mainCategory == $0', category.mainCategory);
                    realm.delete(books);
                    
                    // حذف القسم الرئيسي نفسه
                    const categoryObj = realm.objectForPrimaryKey('Category', categoryId);
                    if (categoryObj) {
                      realm.delete(categoryObj);
                    }
                  });
                  console.log('✅ Category deleted from Realm:', category.mainCategory);
                }
              } catch (realmError) {
                console.error('Error deleting from Realm:', realmError);
                // لا نعرض خطأ للمستخدم لأن الحذف من Firebase نجح
              }
              
              await refreshCategories?.(); // تحديث الأقسام من المصدر فوراً
              
              // مزامنة فورية مع قاعدة البيانات المحلية
              try {
                console.log('📁 CategoryForm: triggering immediate local sync after category deletion');
                if (forceSyncNewData) {
                  await forceSyncNewData();
                  console.log('📁 CategoryForm: local sync completed successfully after deletion');
                }
              } catch (syncError) {
                console.error('📁 CategoryForm: local sync failed after deletion:', syncError);
                // لا نعرض خطأ للمستخدم لأن المزامنة قد تكون مؤجلة
              }
              
              refreshStats(); // Update stats after deleting a category
              Alert.alert('تم الحذف', 'تم حذف القسم وجميع محتوياته بنجاح من Firebase و Realm المحلي');
              eventEmitter.emit('forceRefresh', { timestamp: Date.now() });
            } catch (error) {
              console.error('Error deleting category:', error);
              Alert.alert('خطأ', 'حدث خطأ أثناء حذف القسم');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEdit = (category) => {
    setEditMode(true);
    setEditingCategory(category);
    if (type === 'main') {
      setMainCategory(category.mainCategory);
    } else if (type === 'sub') {
      setMainCategory(category.mainCategory);
      setSubCategory(category.subCategory);
    } else {
      setMainCategory(category.mainCategory);
      setSubCategory(category.subCategory);
      setSubSubCategory(category.subSubCategory);
    }
  };

  const resetForm = () => {
    setMainCategory('');
    setSubCategory('');
    setSubSubCategory('');
    setEditMode(false);
    setEditingCategory(null);
    fetchCategories(); // إعادة تحميل الأقسام للتأكد من التحديث
  };

  const subCategories = mainCategory
    ? [...new Set(categories.filter(cat => cat.mainCategory === mainCategory && cat.subCategory && !cat.subSubCategory).map(cat => cat.subCategory))]
    : [];

  const filteredCategories = categories.filter(cat => {
    if (type === 'main') return !cat.subCategory;
    if (type === 'sub') return cat.subCategory && !cat.subSubCategory;
    return cat.subSubCategory;
  });

  // جلب الأقسام الرئيسية المتاحة
  const mainCategories = [...new Set(categories.map(cat => cat.mainCategory))];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formBox}>
        <Text style={styles.formTitle}>
          {type === 'main' ? 'إنشاء قسم رئيسي' : 
           type === 'sub' ? 'إنشاء قسم فرعي' : 
           'إنشاء قسم فرعي ثانوي'}
        </Text>
        
        {type === 'main' && (
          <>
            <Text style={styles.label}>اسم القسم الرئيسي *</Text>
            <View style={styles.iconAboveInput}>
              <MaterialIcons name="category" size={32} color="#197278" />
            </View>
            <TextInput
              style={[styles.input, styles.mainInput]}
              value={mainCategory}
              onChangeText={setMainCategory}
              placeholder="أدخل اسم القسم الرئيسي"
              textAlign="right"
            />
          </>
        )}

        {type === 'sub' && (
          <>
            <Text style={styles.label}>اختر القسم الرئيسي *</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={mainCategory} onValueChange={setMainCategory} style={styles.picker}>
                <Picker.Item label="اختر القسم الرئيسي" value="" />
                {mainCategories.map((cat, idx) => (
                  <Picker.Item key={idx} label={cat} value={cat} />
                ))}
              </Picker>
            </View>
            
            <Text style={styles.label}>اسم القسم الفرعي *</Text>
            <TextInput
              style={styles.input}
              value={subCategory}
              onChangeText={setSubCategory}
              placeholder="أدخل اسم القسم الفرعي"
              textAlign="right"
              editable={!!mainCategory}
            />
          </>
        )}

        {type === 'subsub' && (
          <>
            <Text style={styles.label}>اختر القسم الرئيسي *</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={mainCategory} onValueChange={(value) => {
                setMainCategory(value);
                setSubCategory(''); // إعادة تعيين القسم الفرعي عند تغيير الرئيسي
              }} style={styles.picker}>
                <Picker.Item label="اختر القسم الرئيسي" value="" />
                {mainCategories.map((cat, idx) => (
                  <Picker.Item key={idx} label={cat} value={cat} />
                ))}
              </Picker>
            </View>
            
            <Text style={styles.label}>اختر القسم الفرعي *</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={subCategory} onValueChange={setSubCategory} style={styles.picker} enabled={!!mainCategory}>
                <Picker.Item label="اختر القسم الفرعي" value="" />
                {subCategories.map((cat, idx) => (
                  <Picker.Item key={idx} label={cat} value={cat} />
                ))}
              </Picker>
            </View>
            
            <Text style={styles.label}>اسم القسم الفرعي الثانوي *</Text>
            <TextInput
              style={styles.input}
              value={subSubCategory}
              onChangeText={setSubSubCategory}
              placeholder="أدخل اسم القسم الفرعي الثانوي"
              textAlign="right"
              editable={!!mainCategory && !!subCategory}
            />
          </>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.submitBtn, loading && styles.disabledBtn]} 
            onPress={handleAddCategory} 
            disabled={loading} 
          >
            <Text style={styles.submitBtnText}>
              {loading ? "جاري المعالجة..." : editMode ? "تحديث القسم" : "إضافة القسم"}
            </Text>
          </TouchableOpacity>
          {editMode && (
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>إلغاء التحرير</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginVertical: 16,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    elevation: 2,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#197278',
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  mainInput: {
    borderWidth: 2,
    borderColor: '#197278',
    backgroundColor: '#e0f2f1',
    fontWeight: 'bold',
    fontSize: 20,
    marginBottom: 20,
    marginTop: 4,
    paddingVertical: 14,
  },
  iconAboveInput: {
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#197278',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#197278',
    padding: 12,
    borderRadius: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  disabledBtn: {
    backgroundColor: '#ccc',
  },
  cancelBtn: {
    backgroundColor: '#888',
    padding: 12,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
});
