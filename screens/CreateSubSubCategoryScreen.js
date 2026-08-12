import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';

const CreateSubSubCategoryScreen = ({ navigation }) => {
  const { categories } = useData();
  const [categoryTitle, setCategoryTitle] = useState('');
  const [selectedMainCategory, setSelectedMainCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [showMainCategoryDropdown, setShowMainCategoryDropdown] = useState(false);
  const [showSubCategoryDropdown, setShowSubCategoryDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter main categories
  const mainCategories = categories.filter(cat => !cat.parentId) || [];
  
  // Filter sub categories based on selected main category
  const subCategories = selectedMainCategory 
    ? categories.filter(cat => cat.parentId === selectedMainCategory.id) || []
    : [];

  // Reset sub category when main category changes
  useEffect(() => {
    if (selectedMainCategory) {
      setSelectedSubCategory(null);
    }
  }, [selectedMainCategory]);

  const createSubSubCategory = async () => {
    if (!categoryTitle.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال عنوان القسم الفرعي الثانوي');
      return;
    }

    if (!selectedMainCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الرئيسي');
      return;
    }

    if (!selectedSubCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الفرعي');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('📁 Creating sub-sub category:', {
        title: categoryTitle.trim(),
        mainCategory: selectedMainCategory.title,
        subCategory: selectedSubCategory.title
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Alert.alert(
        '✅ تم الإنشاء بنجاح',
        `تم إنشاء القسم الفرعي الثانوي: ${categoryTitle.trim()}\nداخل القسم الفرعي: ${selectedSubCategory.title}\nداخل القسم الرئيسي: ${selectedMainCategory.title}`,
        [{ text: 'موافق', onPress: () => navigation.navigate('AdminDashboard') }]
      );
      
    } catch (error) {
      console.error('Error creating sub-sub category:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء إنشاء القسم');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>إنشاء قسم فرعي ثانوي</Text>
            <Text style={styles.subtitle}>إضافة قسم فرعي ثانوي داخل قسم فرعي</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>بيانات القسم الفرعي الثانوي</Text>
          
          {/* Main Category Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>القسم الرئيسي</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowMainCategoryDropdown(!showMainCategoryDropdown)}
            >
              <Text style={[styles.dropdownText, !selectedMainCategory && styles.placeholderText]}>
                {selectedMainCategory ? selectedMainCategory.title : 'اختر القسم الرئيسي'}
              </Text>
              <Ionicons 
                name={showMainCategoryDropdown ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
            
            {showMainCategoryDropdown && (
              <View style={styles.dropdownList}>
                {mainCategories.length > 0 ? (
                  mainCategories.map((category, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedMainCategory(category);
                        setShowMainCategoryDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{category.title}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.dropdownItem}>
                    <Text style={[styles.dropdownItemText, { color: '#999' }]}>
                      لا توجد أقسام رئيسية
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Sub Category Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>القسم الفرعي</Text>
            <TouchableOpacity
              style={[styles.dropdownButton, !selectedMainCategory && styles.disabledDropdown]}
              onPress={() => {
                if (selectedMainCategory) {
                  setShowSubCategoryDropdown(!showSubCategoryDropdown);
                }
              }}
              disabled={!selectedMainCategory}
            >
              <Text style={[
                styles.dropdownText, 
                !selectedSubCategory && styles.placeholderText,
                !selectedMainCategory && styles.disabledText
              ]}>
                {!selectedMainCategory 
                  ? 'اختر القسم الرئيسي أولاً'
                  : selectedSubCategory 
                    ? selectedSubCategory.title 
                    : 'اختر القسم الفرعي'
                }
              </Text>
              <Ionicons 
                name={showSubCategoryDropdown ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={selectedMainCategory ? "#666" : "#ccc"} 
              />
            </TouchableOpacity>
            
            {showSubCategoryDropdown && selectedMainCategory && (
              <View style={styles.dropdownList}>
                {subCategories.length > 0 ? (
                  subCategories.map((category, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedSubCategory(category);
                        setShowSubCategoryDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{category.title}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.dropdownItem}>
                    <Text style={[styles.dropdownItemText, { color: '#999' }]}>
                      لا توجد أقسام فرعية في هذا القسم الرئيسي
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Sub-Sub Category Title */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>عنوان القسم الفرعي الثانوي</Text>
            <TextInput
              style={styles.textInput}
              value={categoryTitle}
              onChangeText={setCategoryTitle}
              placeholder="مثال: كتب الطهارة، أحاديث الغزوات..."
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity 
            style={[
              styles.createButton, 
              (!categoryTitle.trim() || !selectedMainCategory || !selectedSubCategory || isLoading) && styles.createButtonDisabled
            ]}
            onPress={createSubSubCategory}
            disabled={!categoryTitle.trim() || !selectedMainCategory || !selectedSubCategory || isLoading}
          >
            <Text style={styles.createButtonText}>
              {isLoading ? 'جاري الإنشاء...' : 'إنشاء القسم الفرعي الثانوي'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 30,
    paddingHorizontal: 20,
    backgroundColor: '#9C27B0',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Cairo-Bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Cairo-Regular',
    color: 'rgba(255,255,255,0.9)',
  },
  content: {
    padding: 20,
  },
  formContainer: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formTitle: {
    fontSize: 18,
    fontFamily: 'Cairo-Bold',
    color: '#333',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Cairo-SemiBold',
    color: '#555',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#9C27B0',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    fontFamily: 'Cairo-Regular',
    color: '#333',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#9C27B0',
    borderRadius: 12,
    padding: 15,
  },
  disabledDropdown: {
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Cairo-Regular',
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
  disabledText: {
    color: '#ccc',
  },
  dropdownList: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F9F9F9',
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dropdownItemText: {
    fontSize: 15,
    fontFamily: 'Cairo-Regular',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#9C27B0',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#CCC',
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Cairo-SemiBold',
  },
});

export default CreateSubSubCategoryScreen; 