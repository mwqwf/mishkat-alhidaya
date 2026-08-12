import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
  Keyboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { useData } from '../context/DataContext';

const { width, height } = Dimensions.get('window');

const SORT_OPTIONS = [
  { key: 'relevance', label: 'الأكثر تطابقاً', icon: 'sort' },
  { key: 'name', label: 'الاسم', icon: 'sort-by-alpha' },
  { key: 'date', label: 'التاريخ', icon: 'schedule' },
  { key: 'type', label: 'النوع', icon: 'category' },
];

const CONTENT_TYPES = {
  book: { label: 'كتاب', icon: 'menu-book', color: '#4caf50' },
  video: { label: 'فيديو', icon: 'play-circle-filled', color: '#f44336' },
  audio: { label: 'صوتي', icon: 'audiotrack', color: '#ff9800' },
  category: { label: 'قسم رئيسي', icon: 'folder', color: '#2196f3' },
  subcategory: { label: 'قسم فرعي', icon: 'folder-open', color: '#9c27b0' },
  subsubcategory: { label: 'قسم ثانوي', icon: 'folder-special', color: '#795548' },
};

export default function GlobalSearch({ visible, onClose, navigation }) {
  const { darkMode, fontSize } = useContext(AppSettingsContext);
  const { globalSearch } = useData();
  
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const searchInputRef = useRef(null);

  // حساب درجة التطابق
  const calculateRelevance = (item, searchTerms) => {
    const text = item.searchableText || '';
    const title = item.title.toLowerCase();
    let score = 0;

    searchTerms.forEach(term => {
      // التطابق التام في العنوان يحصل على أعلى درجة
      if (title === term) score += 100;
      else if (title.startsWith(term)) score += 80;
      else if (title.includes(term)) score += 60;
      
      // التطابق في النص القابل للبحث
      if (text.includes(term)) score += 30;
      
      // تطابق جزئي
      const termChars = term.split('');
      let partialMatch = 0;
      termChars.forEach(char => {
        if (text.includes(char)) partialMatch += 1;
      });
      score += (partialMatch / termChars.length) * 10;
    });

    return score;
  };

  // تنفيذ البحث باستخدام globalSearch من DataContext
  const performSearch = async (text) => {
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    
    try {
      // استخدام البحث الشامل من DataContext
      const results = await globalSearch(text);
      
      // إضافة درجات التطابق للنتائج إذا لم تكن موجودة
      const processedResults = results.map(item => ({
        ...item,
        relevance: item.relevance || calculateRelevance(item, text.toLowerCase().trim().split(/\s+/)),
      }));

      // ترتيب النتائج
      const sorted = sortResults(processedResults, sortBy);
      setSearchResults(sorted);
    } catch (error) {
      console.error('Error performing search:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ترتيب النتائج
  const sortResults = (results, sortType) => {
    const sortedResults = [...results];
    
    switch (sortType) {
      case 'relevance':
        return sortedResults.sort((a, b) => b.relevance - a.relevance);
      case 'name':
        return sortedResults.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
      case 'date':
        return sortedResults.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'type':
        return sortedResults.sort((a, b) => a.type.localeCompare(b.type));
      default:
        return sortedResults;
    }
  };

  // البحث عند تغيير النص
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchText);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchText, sortBy]);

  // إعادة ترتيب النتائج عند تغيير طريقة الترتيب
  useEffect(() => {
    if (searchResults.length > 0) {
      const sorted = sortResults(searchResults, sortBy);
      setSearchResults(sorted);
    }
  }, [sortBy]);

  // التركيز على حقل البحث عند الفتح
  useEffect(() => {
    if (visible && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [visible]);

  // التنقل إلى العنصر المحدد
  const handleItemPress = (item) => {
    Keyboard.dismiss();
    onClose();
    
    switch (item.type) {
      case 'category':
        // التنقل داخل نفس المكدس
        navigation.navigate('SubCategories', { mainCategory: item.data.mainCategory });
        break;
      case 'subcategory':
        // التنقل داخل نفس المكدس
        navigation.navigate('SubSubCategories', { 
          mainCategory: item.data.mainCategory,
          subCategory: item.data.subCategory 
        });
        break;
      case 'subsubcategory':
        // التنقل داخل نفس المكدس
        navigation.navigate('Content', { 
          mainCategory: item.data.mainCategory,
          subCategory: item.data.subCategory,
          subSubCategory: item.data.subSubCategory
        });
        break;
      case 'book':
      case 'video':
      case 'audio':
        // التنقل المباشر للمحتوى مع تمييز العنصر
        navigation.navigate('Content', { 
          mainCategory: item.data.mainCategory,
          subCategory: item.data.subCategory,
          subSubCategory: item.data.subSubCategory,
          highlightItem: item.data.id
        });
        break;
    }
  };

  // عرض عنصر النتيجة
  const renderSearchResult = ({ item }) => {
    const contentTypeInfo = CONTENT_TYPES[item.type] || CONTENT_TYPES.book;
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: darkMode ? '#333' : '#fff' }]}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.resultIcon}>
          <MaterialIcons 
            name={contentTypeInfo.icon} 
            size={24} 
            color={contentTypeInfo.color} 
          />
        </View>
        
        <View style={styles.resultContent}>
          <Text style={[styles.resultTitle, { 
            color: darkMode ? '#fff' : '#000',
            fontSize: fontSize + 2 
          }]}>
            {item.title}
          </Text>
          <Text style={[styles.resultSubtitle, { 
            color: darkMode ? '#bbb' : '#666',
            fontSize: fontSize - 2 
          }]}>
            {item.subtitle}
          </Text>
          <View style={styles.resultMeta}>
            <Text style={[styles.resultType, { 
              backgroundColor: contentTypeInfo.color + '20',
              color: contentTypeInfo.color,
              fontSize: fontSize - 4
            }]}>
              {contentTypeInfo.label}
            </Text>
            {sortBy === 'relevance' && (
              <Text style={[styles.relevanceScore, { 
                color: darkMode ? '#888' : '#999',
                fontSize: fontSize - 4
              }]}>
                تطابق: {Math.round(item.relevance)}%
              </Text>
            )}
          </View>
        </View>
        
        <MaterialIcons 
          name="chevron-right" 
          size={24} 
          color={darkMode ? '#666' : '#ccc'} 
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={[styles.container, { backgroundColor: darkMode ? '#222' : '#f5f5f5' }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: darkMode ? '#1e3c72' : '#197278' }]}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <Text style={[styles.headerTitle, { fontSize: fontSize + 4 }]}>
            البحث الشامل
          </Text>
          
          <TouchableOpacity 
            style={styles.sortButton} 
            onPress={() => setShowSortMenu(!showSortMenu)}
          >
            <MaterialIcons name="sort" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={[styles.searchContainer, { backgroundColor: darkMode ? '#333' : '#fff' }]}>
          <MaterialIcons name="search" size={24} color={darkMode ? '#666' : '#999'} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { 
              color: darkMode ? '#fff' : '#000',
              fontSize: fontSize
            }]}
            placeholder="ابحث في جميع المحتويات..."
            placeholderTextColor={darkMode ? '#666' : '#999'}
            value={searchText}
            onChangeText={setSearchText}
            textAlign="right"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <MaterialIcons name="clear" size={24} color={darkMode ? '#666' : '#999'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort Menu */}
        {showSortMenu && (
          <View style={[styles.sortMenu, { backgroundColor: darkMode ? '#333' : '#fff' }]}>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortOption, sortBy === option.key && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy(option.key);
                  setShowSortMenu(false);
                }}
              >
                <MaterialIcons name={option.icon} size={20} color={
                  sortBy === option.key ? '#197278' : (darkMode ? '#666' : '#999')
                } />
                <Text style={[styles.sortOptionText, { 
                  color: sortBy === option.key ? '#197278' : (darkMode ? '#fff' : '#000'),
                  fontSize: fontSize - 2
                }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Results */}
        <View style={styles.resultsContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={darkMode ? '#90caf9' : '#197278'} />
              <Text style={[styles.loadingText, { 
                color: darkMode ? '#90caf9' : '#197278',
                fontSize: fontSize
              }]}>
                جاري البحث...
              </Text>
            </View>
          ) : searchText && searchResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={64} color={darkMode ? '#555' : '#ccc'} />
              <Text style={[styles.emptyText, { 
                color: darkMode ? '#555' : '#999',
                fontSize: fontSize + 2
              }]}>
                لا توجد نتائج للبحث
              </Text>
              <Text style={[styles.emptySubtext, { 
                color: darkMode ? '#777' : '#666',
                fontSize: fontSize - 2
              }]}>
                جرب تغيير كلمات البحث أو استخدم كلمات أوسع
              </Text>
            </View>
          ) : searchResults.length > 0 ? (
            <>
              <Text style={[styles.resultsCount, { 
                color: darkMode ? '#90caf9' : '#197278',
                fontSize: fontSize - 2
              }]}>
                {searchResults.length} نتيجة للبحث عن "{searchText}"
              </Text>
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                style={styles.resultsList}
              />
            </>
          ) : (
            <View style={styles.instructionsContainer}>
              <MaterialIcons name="search" size={64} color={darkMode ? '#555' : '#ccc'} />
              <Text style={[styles.instructionsTitle, { 
                color: darkMode ? '#fff' : '#000',
                fontSize: fontSize + 2
              }]}>
                ابحث في جميع المحتويات
              </Text>
              <Text style={[styles.instructionsText, { 
                color: darkMode ? '#bbb' : '#666',
                fontSize: fontSize - 2
              }]}>
                يمكنك البحث في الأقسام الرئيسية والفرعية والثانوية وجميع المحتويات (كتب، فيديوهات، ملفات صوتية)
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 44,
    backgroundColor: '#197278',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  sortButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  sortMenu: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sortOptionActive: {
    backgroundColor: '#f0f8ff',
  },
  sortOptionText: {
    marginLeft: 12,
    fontSize: 14,
    textAlign: 'right',
    flex: 1,
  },
  resultsContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  resultsCount: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 8,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  resultIcon: {
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 4,
  },
  resultSubtitle: {
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 6,
  },
  resultMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultType: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  relevanceScore: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: 'bold',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  instructionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  instructionsTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: 'bold',
  },
  instructionsText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
}); 