import React, { useEffect, useRef, useState, useContext } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform, Dimensions, Alert, BackHandler } from 'react-native';
import { Video } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGlobalMedia, setGlobalMedia } from '../utils/globalMedia';
import AppSettingsContext from '../AppSettingsContext';
import { useAudio } from '../AudioContext';
import NetInfo from '@react-native-community/netinfo';
import { isYouTubeUrl } from '../utils/youtubeHelper';
import YouTubeVideoPlayer from '../components/YouTubeVideoPlayer';

export default function VideoPlayerScreen({ route, navigation }) {
  const { content, videoList = [], currentIndex = 0 } = route.params;
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [trackIndex, setTrackIndex] = useState(currentIndex);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { autoDownload } = useContext(AppSettingsContext);
  const { handleMediaStart } = useAudio();
  const [offline, setOffline] = useState(false);

  // التحقق من أن الفيديو من يوتيوب
  const isYouTubeVideo = isYouTubeUrl(content?.bookUrl || content?.contentUrl);

  useEffect(() => {
    // إذا كان الفيديو من يوتيوب، لا نحتاج للتحميل التلقائي
    if (isYouTubeVideo) {
      setIsLoading(false);
      return;
    }

    setIsPlaying(false);
    setIsLoading(true);
    setPosition(0);
    setDuration(0);
    checkIfDownloaded();
    
    // إيقاف أي صوت يعمل حالياً
    handleMediaStart();
    
    if (autoDownload === 'on') {
      const checkAndAutoDownload = async () => {
        const uri = videoList[trackIndex]?.contentUrl || content.contentUrl;
        const fileName = sanitizeFileName(content.bookName || (uri && uri.split('/').pop().split('?')[0]));
        const fileUri = FileSystem.documentDirectory + fileName;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
          handleDownload();
        } else {
        }
      };
      checkAndAutoDownload();
    }
  }, [trackIndex, autoDownload, isYouTubeVideo]);

  useEffect(() => {
    const checkNet = async () => {
      const state = await NetInfo.fetch();
      setOffline(!state.isConnected);
    };
    checkNet();
  }, []);

  // إذا كان الفيديو من يوتيوب، استخدم مكون YouTubeVideoPlayer
  if (isYouTubeVideo) {
    navigation.replace('YouTubeVideoPlayer', { content });
    return null;
  }

  const handlePlaybackStatusUpdate = (status) => {
    setIsPlaying(status.isPlaying);
    setDuration(status.durationMillis || 0);
    if (!isSeeking) setPosition(status.positionMillis || 0);
    setIsLoading(!status.isLoaded);
    if (status.didJustFinish && !status.isLooping) {
      handleNext();
    }
  };

  const handlePlayPause = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await handleMediaStart();
      await setGlobalMedia(videoRef.current, 'video');
      await videoRef.current.playAsync();
    }
  };

  const handleSeek = async (value) => {
    if (!videoRef.current) return;
    setIsSeeking(false);
    await videoRef.current.setPositionAsync(safeNumber(value));
    setPosition(safeNumber(value));
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekComplete = (value) => {
    setIsSeeking(false);
    handleSeek(value);
  };

  const seekBy = async (ms) => {
    let newPos = position + ms;
    if (newPos < 0) newPos = 0;
    if (newPos > duration) newPos = duration;
    await handleSeek(newPos);
  };

  const handleNext = () => {
    if (trackIndex < videoList.length - 1) {
      navigation.replace('VideoPlayer', {
        content: videoList[trackIndex + 1],
        videoList,
        currentIndex: trackIndex + 1,
      });
    } else {
      navigation.replace('VideoPlayer', {
        content: videoList[0],
        videoList,
        currentIndex: 0,
      });
    }
  };

  const handlePrev = () => {
    if (trackIndex > 0) {
      navigation.replace('VideoPlayer', {
        content: videoList[trackIndex - 1],
        videoList,
        currentIndex: trackIndex - 1,
      });
    } else {
      navigation.replace('VideoPlayer', {
        content: videoList[videoList.length - 1],
        videoList,
        currentIndex: videoList.length - 1,
      });
    }
  };

  const formatTime = (millis) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const checkIfDownloaded = async () => {
    const uri = videoList[trackIndex]?.contentUrl || content.contentUrl;
    const fileName = sanitizeFileName(content.bookName || (uri && uri.split('/').pop().split('?')[0]));
    const fileUri = FileSystem.documentDirectory + fileName;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    setIsDownloaded(fileInfo.exists);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const uri = (videoList[trackIndex] && videoList[trackIndex].contentUrl) || (content && content.contentUrl);
      if (!uri) {
        Alert.alert('خطأ', 'لا يوجد رابط للفيديو.');
        setDownloading(false);
        return;
      }
      const fileName = sanitizeFileName(content.bookName || (uri && uri.split('/').pop().split('?')[0]));
      const fileUri = FileSystem.documentDirectory + fileName;
      const downloadResumable = FileSystem.createDownloadResumable(
        uri,
        fileUri,
        {},
        (progress) => {
          setDownloadProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
        }
      );
      const { uri: localUri } = await downloadResumable.downloadAsync();
      setDownloading(false);
      setDownloadProgress(0);
      await AsyncStorage.setItem('downloaded_' + fileName, 'true');
      setIsDownloaded(true);
      Alert.alert('تم التحميل', 'تم تحميل الفيديو بنجاح! يمكنك الآن مشاركته أو فتحه.');
      await Sharing.shareAsync(localUri);
    } catch (e) {
      setDownloading(false);
      setDownloadProgress(0);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل الفيديو.');
    }
  };

  const handleShare = async () => {
    try {
      const uri = (videoList[trackIndex] && videoList[trackIndex].contentUrl) || (content && content.contentUrl);
      if (!uri) {
        Alert.alert('خطأ', 'لا يوجد رابط للفيديو.');
        return;
      }
      const fileName = sanitizeFileName(content.bookName || (uri && uri.split('/').pop().split('?')[0]));
      const fileUri = FileSystem.documentDirectory + fileName;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('تنبيه', 'يجب تحميل الفيديو أولاً قبل مشاركته.');
      }
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء المشاركة.');
    }
  };

  const handleUndoDownload = async () => {
    try {
      const uri = (videoList[trackIndex] && videoList[trackIndex].contentUrl) || (content && content.contentUrl);
      if (!uri) {
        Alert.alert('خطأ', 'لا يوجد رابط للفيديو.');
        return;
      }
      const fileName = sanitizeFileName(content.bookName || (uri && uri.split('/').pop().split('?')[0]));
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      await AsyncStorage.removeItem('downloaded_' + fileName);
      setIsDownloaded(false);
      Alert.alert('تم التراجع', 'تم حذف الفيديو من الجهاز.');
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء التراجع عن التحميل.');
    }
  };

  const currentTrack = videoList[trackIndex] || content;

  // دالة لتحويل أي قيمة إلى رقم آمن
  const safeNumber = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  function sanitizeFileName(name) {
    return (name || '').replace(/[^\w\d\-_\.]/g, '_');
  }

  return (
    <View style={styles.container}>
      {/* زر الخروج */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentTrack?.bookName || 'مشغل الفيديو'}
        </Text>
        <View style={styles.headerActions}>
          
        </View>
      </View>
      
      {offline && (
        <View style={{backgroundColor:'#ffc107',padding:6}}>
          <Text style={{color:'#333',textAlign:'center'}}>أنت الآن في وضع عدم الاتصال</Text>
        </View>
      )}
      
      <Video
        ref={videoRef}
        source={{ uri: (currentTrack && currentTrack.contentUrl) ? currentTrack.contentUrl : '' }}
        style={styles.video}
        resizeMode="contain"
        shouldPlay={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        isLooping={false}
      />
      
      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={handlePrev} disabled={videoList.length <= 1} style={styles.iconButton}>
          <MaterialIcons name="skip-previous" size={36} color={videoList.length <= 1 ? '#ccc' : '#197278'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => seekBy(-10000)} style={styles.iconButton}>
          <MaterialIcons name="replay-10" size={32} color="#197278" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} disabled={isLoading}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={40} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => seekBy(10000)} style={styles.iconButton}>
          <MaterialIcons name="forward-10" size={32} color="#197278" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} disabled={videoList.length <= 1} style={styles.iconButton}>
          <MaterialIcons name="skip-next" size={36} color={videoList.length <= 1 ? '#ccc' : '#197278'} />
        </TouchableOpacity>
      </View>
      
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={safeNumber(duration)}
        value={safeNumber(isSeeking ? seekValue : position)}
        onValueChange={value => {
          setSeekValue(safeNumber(value));
          if (!isSeeking) setIsSeeking(true);
        }}
        onSlidingStart={() => setIsSeeking(true)}
        onSlidingComplete={value => {
          setIsSeeking(false);
          setPosition(safeNumber(value));
          handleSeek(safeNumber(value));
        }}
        minimumTrackTintColor="#197278"
        maximumTrackTintColor="#b2dfdb"
        thumbTintColor="#197278"
        disabled={safeNumber(duration) === 0}
      />
      
      <Text style={styles.time}>{formatTime(safeNumber(position))} / {formatTime(safeNumber(duration))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').width * 9 / 16,
    backgroundColor: '#000',
    marginTop: 32,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  playButton: {
    backgroundColor: '#197278',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    marginHorizontal: 8,
  },
  iconButton: {
    padding: 8,
  },
  slider: {
    width: '80%',
    height: 40,
    marginTop: 8,
    marginBottom: 8,
  },
  time: {
    fontSize: 16,
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
  },
  downloadRowBottom: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 20,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
}); 