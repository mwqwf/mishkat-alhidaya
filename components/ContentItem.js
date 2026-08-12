import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { isYouTubeUrl } from '../utils/youtubeHelper';

export default function ContentItem({ item, darkMode, fontSize, navigation }) {
  const handlePress = () => {
    if (item.contentType === 'video') {
      const serializableContent = {
        ...item,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
        contentUrl: item.bookUrl
      };
      navigation.navigate('VideoPlayer', { content: serializableContent });
    } else if (item.contentType === 'audio') {
      const audioList = navigation.getState?.()?.routes?.find(r => r.name === 'RecentlyAdded')?.params?.audioList || [item];
      const currentIndex = audioList.findIndex(a => a.id === item.id) || 0;
      const serializableContent = {
        ...item,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
        contentUrl: item.bookUrl
      };
      const serializableAudioList = audioList.map(a => ({
        ...a,
        createdAt: a.createdAt ? a.createdAt.toISOString() : null,
        updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
        contentUrl: a.bookUrl
      }));
      navigation.navigate('AudioPlayer', {
        content: serializableContent,
        audioList: serializableAudioList,
        currentIndex,
      });
    } else {
      if (!item.bookUrl) {
        Alert.alert('خطأ', 'لا يوجد رابط صالح لهذا الكتاب.');
        return;
      }
      // تحويل الكائب إلى صيغة قابلة للتسلسل
      const serializableBook = {
        ...item,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null
      };
      navigation.navigate('BookReader', { book: serializableBook });
    }
  };

  const getIcon = () => {
    switch (item.contentType) {
      case 'video':
        // إذا كان الفيديو من يوتيوب، استخدم أيقونة مختلفة
        if (isYouTubeUrl(item.bookUrl)) {
          return <MaterialIcons name="youtube-searched-for" size={24} color={darkMode ? '#ff0000' : '#ff0000'} />;
        }
        return <MaterialIcons name="video-library" size={24} color={darkMode ? '#90caf9' : '#197278'} />;
      case 'audio':
        return <MaterialIcons name="audiotrack" size={24} color={darkMode ? '#90caf9' : '#197278'} />;
      default:
        return <MaterialIcons name="menu-book" size={24} color={darkMode ? '#90caf9' : '#197278'} />;
    }
  };

  const cardStyle = [
    styles.card,
    {
      backgroundColor: darkMode ? '#333' : '#e0f2f1',
      borderColor: darkMode ? '#444' : '#b2dfdb',
      marginBottom: 8,
    }
  ];

  return (
    <View style={cardStyle}>
      <TouchableOpacity style={styles.cardContent} onPress={handlePress}>
      <View style={styles.iconContainer}>
        {getIcon()}
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: darkMode ? '#fff' : '#29434e', fontSize: fontSize + 2 }]} numberOfLines={2}>
          {item.bookName}
        </Text>
        <View style={styles.categoryContainer}>
          <Text style={[styles.category, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
            {item.mainCategory}
          </Text>
          {item.subCategory && (
            <>
              <Text style={[styles.separator, { color: darkMode ? '#aaa' : '#666' }]}> • </Text>
              <Text style={[styles.category, { color: darkMode ? '#aaa' : '#666', fontSize: fontSize - 2 }]}>
                {item.subCategory}
              </Text>
            </>
          )}
        </View>
        {item.createdAt && (
          <Text style={[styles.date, { color: darkMode ? '#888' : '#888', fontSize: fontSize - 4 }]}>
              {typeof item.createdAt === 'string' ? 
                new Date(item.createdAt).toLocaleDateString('ar-SA') : 
                item.createdAt.toLocaleDateString('ar-SA')
              }
          </Text>
        )}
        {/* إظهار علامة يوتيوب إذا كان الفيديو من يوتيوب */}
        {item.contentType === 'video' && isYouTubeUrl(item.bookUrl) && (
          <Text style={[styles.youtubeBadge, { color: darkMode ? '#ff0000' : '#ff0000', fontSize: fontSize - 4 }]}>
            YouTube
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={darkMode ? '#aaa' : '#888'} />
    </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#e0f2f1',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#b2dfdb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginLeft: 12,
  },
  textContainer: {
    flex: 1,
    marginLeft: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#29434e',
    marginBottom: 4,
    textAlign: 'right',
    lineHeight: 22,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    justifyContent: 'flex-end',
  },
  category: {
    fontSize: 14,
    color: '#666',
  },
  separator: {
    fontSize: 14,
    color: '#666',
  },
  date: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
    marginTop: 2,
  },
  youtubeBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: 2,
  },
}); 