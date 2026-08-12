import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const CategoryManagementScreen = ({ navigation }) => {
  const navigateToCreateCategory = (type) => {
    const screens = {
      main: 'CreateMainCategory',
      sub: 'CreateSubCategory', 
      subsub: 'CreateSubSubCategory'
    };
    navigation.navigate(screens[type]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>إدارة الأقسام</Text>
            <Text style={styles.subtitle}>إنشاء وتنظيم أقسام المحتوى</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Introduction */}
        <View style={styles.introContainer}>
          <View style={styles.introIcon}>
            <Ionicons name="folder-open" size={40} color="#6C5CE7" />
          </View>
          <Text style={styles.introTitle}>نظام إدارة الأقسام</Text>
          <Text style={styles.introText}>
            يمكنك من هنا إنشاء الأقسام الرئيسية والفرعية والفرعية الثانوية لتنظيم محتوى التطبيق
          </Text>
        </View>

        {/* Category Creation Options */}
        <View style={styles.optionsContainer}>
          <Text style={styles.sectionTitle}>خيارات إنشاء الأقسام</Text>
          
          {/* Main Categories */}
          <TouchableOpacity 
            style={[styles.categoryOption, { backgroundColor: '#4CAF50' }]}
            onPress={() => navigateToCreateCategory('main')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="folder" size={30} color="white" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>الأقسام الرئيسية</Text>
                <Text style={styles.optionDescription}>إنشاء أقسام رئيسية جديدة</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="white" />
          </TouchableOpacity>

          {/* Sub Categories */}
          <TouchableOpacity 
            style={[styles.categoryOption, { backgroundColor: '#FFC107' }]}
            onPress={() => navigateToCreateCategory('sub')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="folder-open" size={30} color="white" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>الأقسام الفرعية</Text>
                <Text style={styles.optionDescription}>إنشاء أقسام فرعية داخل الأقسام الرئيسية</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="white" />
          </TouchableOpacity>

          {/* Sub-Sub Categories */}
          <TouchableOpacity 
            style={[styles.categoryOption, { backgroundColor: '#9C27B0' }]}
            onPress={() => navigateToCreateCategory('subsub')}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="file-tray-stacked" size={30} color="white" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>الأقسام الفرعية الثانوية</Text>
                <Text style={styles.optionDescription}>إنشاء أقسام فرعية ثانوية داخل الأقسام الفرعية</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="white" />
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
    backgroundColor: '#6C5CE7',
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
  introContainer: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 25,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  introIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F2F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  introTitle: {
    fontSize: 20,
    fontFamily: 'Cairo-Bold',
    color: '#333',
    marginBottom: 10,
  },
  introText: {
    fontSize: 15,
    fontFamily: 'Cairo-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  optionsContainer: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Cairo-Bold',
    color: '#333',
    marginBottom: 15,
  },
  categoryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontFamily: 'Cairo-Bold',
    color: 'white',
    marginBottom: 5,
  },
  optionDescription: {
    fontSize: 13,
    fontFamily: 'Cairo-Regular',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  statsContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 80) / 3,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontFamily: 'Cairo-Bold',
    color: 'white',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Cairo-Regular',
    color: 'white',
  },
});

export default CategoryManagementScreen; 