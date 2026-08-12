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

const CreateSubCategoryScreen = ({ navigation }) => {
  const { categories } = useData();
  const [categoryTitle, setCategoryTitle] = useState('');
  const [selectedMainCategory, setSelectedMainCategory] = useState(null);
  const [showMainCategoryDropdown, setShowMainCategoryDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter main categories (assuming categories array contains all categories)
  const mainCategories = categories.filter(cat => !cat.parentId) || [];

  const createSubCategory = async () => {
    if (!categoryTitle.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال عنوان القسم الفرعي');
      return;
    }

    if (!selectedMainCategory) {
      Alert.alert('خطأ', 'يرجى اختيار القسم الرئيسي');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('📁 Creating sub category:', {
        title: categoryTitle.trim(),
        parentCategory: selectedMainCategory.title
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Alert.alert(
        '✅ تم الإنشاء بنجاح',
        `تم إنشاء القسم الفرعي: ${categoryTitle.trim()}\nداخل القسم الرئيسي: ${selectedMainCategory.title}`,
        [{ text: 'موافق', onPress: () => navigation.navigate('AdminDashboard') }]
      );
      
    } catch (error) {
      console.error('Error creating sub category:', error);
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
            <Text style={styles.title}>إنشاء قسم فرعي</Text>
            <Text style={styles.subtitle}>إضافة قسم فرعي داخل قسم رئيسي</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>بيانات القسم الفرعي</Text>
          
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

          {/* Sub Category Title */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>عنوان القسم الفرعي</Text>
            <TextInput
              style={styles.textInput}
              value={categoryTitle}
              onChangeText={setCategoryTitle}
              placeholder="مثال: كتب الفقه، أحاديث السيرة..."
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity 
            style={[
              styles.createButton, 
              (!categoryTitle.trim() || !selectedMainCategory || isLoading) && styles.createButtonDisabled
            ]}
            onPress={createSubCategory}
            disabled={!categoryTitle.trim() || !selectedMainCategory || isLoading}
          >
            <Text style={styles.createButtonText}>
              {isLoading ? 'جاري الإنشاء...' : 'إنشاء القسم الفرعي'}
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
    backgroundColor: '#FFC107',
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
    borderColor: '#FFC107',
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
    borderColor: '#FFC107',
    borderRadius: 12,
    padding: 15,
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
    backgroundColor: '#FFC107',
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

export default CreateSubCategoryScreen; 