import React, { useEffect, useRef, useState, useContext } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppSettingsContext from '../AppSettingsContext';
import { useAudio } from '../AudioContext';
import NetInfo from '@react-native-community/netinfo';

export default function AudioPlayerScreen({ route, navigation }) {
  const { content, audioList = [], currentIndex = 0 } = route.params;
  const { playSound, stopSound, isPlaying, currentUri, getCurrentSound } = useAudio();
  const [trackIndex, setTrackIndex] = useState(Number(currentIndex));
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const prevUri = useRef();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [offline, setOffline] = useState(false);

  const currentTrack = audioList[trackIndex] || content;

  useEffect(() => {
    let isMounted = true;
    const updateStatus = (status) => {
      if (!isMounted) return;
      if (status.isLoaded) {
        setPosition(status.positionMillis || 0);
        setDuration(status.durationMillis || 1);
      }
    };
    if (getCurrentSound()) {
      getCurrentSound().setOnPlaybackStatusUpdate(updateStatus);
    }
    return () => {
      isMounted = false;
      if (getCurrentSound()) {
        getCurrentSound().setOnPlaybackStatusUpdate(null);
      }
    };
  }, [getCurrentSound]);

  useEffect(() => {
    if (currentTrack.bookUrl && currentTrack.bookUrl !== prevUri.current) {
      playSound(currentTrack.bookUrl);
      prevUri.current = currentTrack.bookUrl;
    }
    checkIfDownloaded();
  }, [currentTrack.bookUrl]);

  useEffect(() => {
    const checkNet = async () => {
      const state = await NetInfo.fetch();
      setOffline(!state.isConnected);
    };
    checkNet();
  }, []);

  const checkIfDownloaded = async () => {
    const uri = currentTrack.bookUrl;
    const fileName = sanitizeFileName(currentTrack.bookName || uri.split('/').pop().split('?')[0]);
    const fileUri = FileSystem.documentDirectory + fileName;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    setIsDownloaded(fileInfo.exists);
  };

  const handleNext = () => {
    if (trackIndex < audioList.length - 1) setTrackIndex(trackIndex + 1);
    else setTrackIndex(0);
  };
  const handlePrev = () => {
    if (trackIndex > 0) setTrackIndex(trackIndex - 1);
    else setTrackIndex(audioList.length - 1);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const uri = currentTrack.bookUrl;
      const fileName = sanitizeFileName(currentTrack.bookName || uri.split('/').pop().split('?')[0]);
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
      Alert.alert('تم التحميل', 'تم تحميل الملف بنجاح! يمكنك الآن مشاركته أو فتحه.');
      await Sharing.shareAsync(localUri);
    } catch (e) {
      setDownloading(false);
      setDownloadProgress(0);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل الملف.');
    }
  };

  const handleShare = async () => {
    try {
      const uri = currentTrack.bookUrl;
      const fileName = sanitizeFileName(currentTrack.bookName || uri.split('/').pop().split('?')[0]);
      const fileUri = FileSystem.documentDirectory + fileName;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('تنبيه', 'يجب تحميل الملف أولاً قبل مشاركته.');
      }
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء المشاركة.');
    }
  };

  const handleUndoDownload = async () => {
    try {
      const uri = currentTrack.bookUrl;
      const fileName = sanitizeFileName(currentTrack.bookName || uri.split('/').pop().split('?')[0]);
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      await AsyncStorage.removeItem('downloaded_' + fileName);
      setIsDownloaded(false);
      Alert.alert('تم التراجع', 'تم حذف الملف من الجهاز.');
    } catch (e) {
      Alert.alert('خطأ', 'حدث خطأ أثناء التراجع عن التحميل.');
    }
  };

  const formatTime = millis => {
    const totalSeconds = Math.floor((millis || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const seekBy = async (ms) => {
    const sound = getCurrentSound();
    if (sound) {
      const status = await sound.getStatusAsync();
      let newPos = (status.positionMillis || 0) + ms;
      if (newPos < 0) newPos = 0;
      if (newPos > status.durationMillis) newPos = status.durationMillis;
      await sound.setPositionAsync(newPos);
    }
  };

  const renderDownloadShareUndo = () => null; // إزالة أزرار التحميل من هنا

  function sanitizeFileName(name) {
    return (name || '').replace(/[^\w\d\-_\.]/g, '_');
  }

  return (
    <View style={styles.container}>
      {/* زر الخروج والـ header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={28} color="#197278" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          مشغل الصوت
        </Text>
        <View style={styles.headerActions}>
          {/* Removed DownloadShareButton */}
        </View>
      </View>
      
      {offline && (
        <View style={{backgroundColor:'#ffc107',padding:6}}>
          <Text style={{color:'#333',textAlign:'center'}}>أنت الآن في وضع عدم الاتصال</Text>
        </View>
      )}
      
      <Text style={styles.title}>{currentTrack.bookName || 'تشغيل الصوت'}</Text>
      
      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={handlePrev} disabled={audioList.length <= 1} style={styles.iconButton}>
          <MaterialIcons name="skip-previous" size={36} color={audioList.length <= 1 ? '#ccc' : '#197278'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => seekBy(-10000)}>
          <MaterialIcons name="replay-10" size={32} color="#197278" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={() => {
          if (isPlaying) stopSound();
          else playSound(currentTrack.bookUrl);
        }}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={40} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => seekBy(10000)}>
          <MaterialIcons name="forward-10" size={32} color="#197278" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} disabled={audioList.length <= 1} style={styles.iconButton}>
          <MaterialIcons name="skip-next" size={36} color={audioList.length <= 1 ? '#ccc' : '#197278'} />
        </TouchableOpacity>
      </View>
      
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration}
        value={position}
        onSlidingComplete={async (value) => {
          const sound = getCurrentSound();
          if (sound) {
            await sound.setPositionAsync(value);
          }
        }}
        minimumTrackTintColor="#197278"
        maximumTrackTintColor="#eee"
        thumbTintColor="#197278"
      />
      
      <Text style={styles.time}>{formatTime(position)} / {formatTime(duration)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    width: '100%',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#197278',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#197278',
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    color: '#29434e',
    marginTop: 8,
    textAlign: 'center',
  },
  downloadRowBottom: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16,
    padding: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
}); 