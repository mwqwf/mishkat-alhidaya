import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, 'admins'), 
        where('username', '==', username.trim()),
        where('password', '==', password.trim())
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const adminDoc = querySnapshot.docs[0];
        const adminData = {
          id: adminDoc.id,
          username: adminDoc.data().username,
          owner: adminDoc.data().owner || false
        };
        
        await AsyncStorage.setItem('adminData', JSON.stringify(adminData));
        
        Alert.alert('نجح تسجيل الدخول', `مرحباً ${adminData.username}`, [
          { text: 'موافق', onPress: () => navigation.navigate('AdminDashboard') }
        ]);
      } else {
        Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('خطأ', 'فشل في تسجيل الدخول. تحقق من الاتصال بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('خطأ', 'يرجى ملء جميع الحقول');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('خطأ', 'كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }

    if (password.length < 6) {
      Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    try {
      // التحقق من عدم وجود المستخدم مسبقاً
      const existingQuery = query(
        collection(db, 'admins'), 
        where('username', '==', username.trim())
      );
      
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        Alert.alert('خطأ', 'اسم المستخدم موجود مسبقاً. يرجى اختيار اسم آخر.');
        setLoading(false);
        return;
      }

      // إنشاء حساب جديد
      const newAdmin = {
        username: username.trim(),
        password: password.trim(),
        owner: false, // المستخدم الجديد ليس مالك النظام
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'admins'), newAdmin);
      
      const adminData = {
        id: docRef.id,
        username: newAdmin.username,
        owner: newAdmin.owner
      };
      
      await AsyncStorage.setItem('adminData', JSON.stringify(adminData));
      
      Alert.alert('تم إنشاء الحساب', `تم إنشاء حساب ${adminData.username} بنجاح`, [
        { text: 'موافق', onPress: () => navigation.navigate('AdminDashboard') }
      ]);
    } catch (error) {
      console.error('Register error:', error);
      Alert.alert('خطأ', 'فشل في إنشاء الحساب. تحقق من الاتصال بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <MaterialIcons name="admin-panel-settings" size={80} color="#197278" />
          <Text style={styles.title}>لوحة إدارة مشكاة الهداية</Text>
          <Text style={styles.subtitle}>
            {isRegister ? 'إنشاء حساب مشرف جديد' : 'تسجيل دخول المشرفين'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <MaterialIcons name="person" size={20} color="#197278" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="اسم المستخدم"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#197278" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {isRegister && (
            <View style={styles.inputContainer}>
              <MaterialIcons name="lock-outline" size={20} color="#197278" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="تأكيد كلمة المرور"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.disabledButton]} 
            onPress={isRegister ? handleRegister : handleLogin}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'جاري المعالجة...' : (isRegister ? 'إنشاء حساب' : 'تسجيل الدخول')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.switchButton} 
            onPress={() => {
              setIsRegister(!isRegister);
              setConfirmPassword('');
            }}
          >
            <Text style={styles.switchButtonText}>
              {isRegister 
                ? 'لديك حساب؟ تسجيل الدخول' 
                : 'ليس لديك حساب؟ إنشاء حساب جديد'
              }
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={20} color="#666" />
            <Text style={styles.backButtonText}>العودة للرئيسية</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6fcfa',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#197278',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  submitButton: {
    backgroundColor: '#197278',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: '#999',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchButtonText: {
    color: '#197278',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    marginLeft: 4,
  },
}); 