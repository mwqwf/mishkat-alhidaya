import React, { useState } from 'react';
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

const CreateMainCategoryScreen = ({ navigation }) => {
  const [categoryTitle, setCategoryTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const createMainCategory = async () => {
    if (!categoryTitle.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال عنوان القسم الرئيسي');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('📁 Creating main category:', categoryTitle.trim());
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Alert.alert(
        '✅ تم الإنشاء بنجاح',
        `تم إنشاء القسم الرئيسي: ${categoryTitle.trim()}`,
        [{ text: 'موافق', onPress: () => navigation.navigate('AdminDashboard') }]
      );
      
    } catch (error) {
      console.error('Error creating main category:', error);
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
            <Text style={styles.title}>إنشاء قسم رئيسي</Text>
            <Text style={styles.subtitle}>إضافة قسم رئيسي جديد للتطبيق</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>بيانات القسم الرئيسي</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>عنوان القسم الرئيسي</Text>
            <TextInput
              style={styles.textInput}
              value={categoryTitle}
              onChangeText={setCategoryTitle}
              placeholder="مثال: الفقه، السيرة، التفسير..."
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity 
            style={[styles.createButton, (!categoryTitle.trim() || isLoading) && styles.createButtonDisabled]}
            onPress={createMainCategory}
            disabled={!categoryTitle.trim() || isLoading}
          >
            <Text style={styles.createButtonText}>
              {isLoading ? 'جاري الإنشاء...' : 'إنشاء القسم الرئيسي'}
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
    backgroundColor: '#4CAF50',
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
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    fontFamily: 'Cairo-Regular',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#4CAF50',
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

export default CreateMainCategoryScreen; 