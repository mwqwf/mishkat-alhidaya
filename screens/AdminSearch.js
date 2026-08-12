import React, { useState, useEffect, useContext } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  Alert,
  ActivityIndicator,
  SafeAreaView 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, getDocs, deleteDoc, doc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import AppSettingsContext from '../AppSettingsContext';
import dataService from '../services/dataService';

export default function AdminSearch({ navigation, route }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { onEdit, onDelete } = route.params || {};

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // البحث المباشر في Firebase و Realm (محدث)
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
            console.log(`   MainCategory matches search: ${mainCategory.toLowerCase().includes(searchText)}`);
            
            if (mainCategory && mainCategory.toLowerCase().includes(searchText)) {
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
              console.log(`   SubCategory matches search: ${data.subCategory.toLowerCase().includes(searchText)}`);
              
              if (data.subCategory.toLowerCase().includes(searchText)) {
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
              console.log(`   SubSubCategory matches search: ${data.subSubCategory.toLowerCase().includes(searchText)}`);
              
              if (data.subSubCategory.toLowerCase().includes(searchText)) {
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

  // الحصول على اسم نوع العنصر
  const getItemTypeName = (type) => {
    switch (type) {
      case 'mainCategory': return 'قسم رئيسي';
      case 'subCategory': return 'قسم فرعي';
      case 'subSubCategory': return 'قسم فرعي ثانوي';
      case 'book': return 'كتاب';
      case 'audio': return 'صوت';
      case 'video': return 'فيديو';
      case 'article': return 'مقال';
      case 'image_update': return 'صور';
      default: return 'عنصر';
    }
  };

  // الحصول على أيقونة نوع العنصر
  const getItemIcon = (type) => {
    switch (type) {
      case 'mainCategory':
      case 'subCategory':
      case 'subSubCategory':
        return 'folder';
      case 'book': return 'book';
      case 'audio': return 'audiotrack';
      case 'video': return 'videocam';
      case 'article': return 'article';
      case 'image_update': return 'image';
      default: return 'help';
    }
  };

  // الحصول على لون نوع العنصر
  const getItemColor = (type) => {
    switch (type) {
      case 'mainCategory': return '#2196F3';
      case 'subCategory': return '#4CAF50';
      case 'subSubCategory': return '#FF9800';
      case 'book': return '#9C27B0';
      case 'audio': return '#F44336';
      case 'video': return '#FF5722';
      case 'article': return '#607D8B';
      case 'image_update': return '#197278';
      default: return '#757575';
    }
  };

  // تم إزالة منطق التعديل والحذف القديم - تم استبداله بنظام جديد

  // عرض عنصر في القائمة
  const renderItem = ({ item }) => (
    <View style={[
      styles.itemCard,
      { backgroundColor: darkMode ? '#2c2c2c' : '#ffffff' }
    ]}>
      <View style={styles.itemHeader}>
        <MaterialIcons 
          name={getItemIcon(item.type)} 
          size={24} 
          color={getItemColor(item.type)} 
        />
        <View style={styles.itemInfo}>
          <Text style={[
            styles.itemTitle,
            { 
              color: darkMode ? '#ffffff' : '#333333',
              fontSize: fontSize + 1
            }
          ]}>
            {item.label}
          </Text>
          <View style={styles.itemMeta}>
          <Text style={[
            styles.itemType,
            { 
              color: getItemColor(item.type),
              fontSize: fontSize - 2
            }
          ]}>
            {getItemTypeName(item.type)}
          </Text>
            <Text style={[
              styles.itemSource,
              { 
                color: item.source === 'firebase' ? '#4caf50' : '#ff9800',
                fontSize: fontSize - 3,
                marginLeft: 8
              }
            ]}>
              {item.source === 'firebase' ? '🌐 Firebase' : '📱 Realm'}
            </Text>
          </View>
        </View>
      </View>
      
      {/* تم إزالة أزرار التعديل والحذف - تم استبدالها بنظام جديد */}
    </View>
  );

  // عرض حالة فارغة
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons 
        name="search-off" 
        size={80} 
        color={darkMode ? '#555' : '#ddd'} 
      />
      <Text style={[
        styles.emptyTitle,
        { 
          color: darkMode ? '#ffffff' : '#333333',
          fontSize: fontSize + 2
        }
      ]}>
        {searchText ? 'لا توجد نتائج' : 'ابدأ البحث'}
      </Text>
      <Text style={[
        styles.emptySubtitle,
        { 
          color: darkMode ? '#888' : '#666',
          fontSize: fontSize - 1
        }
      ]}>
        {searchText ? 'جرب كلمات بحث أخرى' : 'اكتب في حقل البحث للعثور على العناصر'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5' }
    ]}>
      {/* Header */}
      <View style={[
        styles.header,
        { backgroundColor: darkMode ? '#2c2c2c' : '#ffffff' }
      ]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#197278" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={[
            styles.headerTitle,
            { 
              color: darkMode ? '#ffffff' : '#333333',
              fontSize: fontSize + 4
            }
          ]}>
            البحث والتعديل
          </Text>
          <Text style={[
            styles.headerSubtitle,
            { 
              color: darkMode ? '#ccc' : '#666',
              fontSize: fontSize - 1
            }
          ]}>
            {searchResults.length} عنصر متاح
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[
        styles.searchContainer,
        { backgroundColor: darkMode ? '#2c2c2c' : '#ffffff' }
      ]}>
        <MaterialIcons name="search" size={24} color="#197278" />
        <TextInput
          style={[
            styles.searchInput,
            { 
              color: darkMode ? '#ffffff' : '#333333',
              fontSize: fontSize
            }
          ]}
          placeholder="ابحث في الأقسام والمحتوى والمستجدات..."
          placeholderTextColor={darkMode ? '#888' : '#999'}
          value={searchText}
          onChangeText={handleSearch}
          textAlign="right"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <MaterialIcons name="clear" size={24} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        <Text style={[
          styles.resultsTitle,
          { 
            color: darkMode ? '#ffffff' : '#333333',
            fontSize: fontSize + 1
          }
        ]}>
          {searchLoading ? 'جاري البحث...' : 
           searchText ? `نتائج البحث (${searchResults.length})` : 
           `جميع العناصر (${searchResults.length})`}
        </Text>
        
        <FlatList
          data={searchResults}
          keyExtractor={(item) => `${item.type}_${item.id}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={[
            styles.listContainer,
            searchResults.length === 0 && styles.emptyListContainer
          ]}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 114, 120, 0.1)',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 15,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  headerSubtitle: {
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 10,
    textAlign: 'right',
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 15,
  },
  resultsTitle: {
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'right',
  },
  listContainer: {
    paddingBottom: 20,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemCard: {
    marginBottom: 12,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  itemTitle: {
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 2,
  },
  itemType: {
    fontWeight: '600',
    textAlign: 'right',
  },
  itemSource: {
    fontWeight: '600',
    textAlign: 'right',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  // تم حذف أزرار التعديل والحذف القديمة - تم استبدالها بنظام AdminActionHandler الجديد
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    marginTop: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
}); 