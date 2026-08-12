import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useAudio } from '../AudioContext';

export default function GlobalAudioBar({ 
  darkMode = false, 
  audioList = [], 
  currentIndex = 0, 
  onNext = null, 
  onPrevious = null 
}) {
  const { 
    isPlaying, 
    currentTrackInfo, 
    togglePlayback, 
    stopSound,
    getCurrentSound,
    playSound
  } = useAudio();

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isSeeking, setIsSeeking] = useState(false);

  // التحقق من وجود ملفات تالية/سابقة
  const hasNext = audioList.length > 1 && currentIndex < audioList.length - 1;
  const hasPrevious = audioList.length > 1 && currentIndex > 0;

  // دالة تشغيل التالي
  const handleNext = async () => {
    if (!hasNext || !onNext) return;
    
    console.log('🎵 Playing next track...');
    try {
      // إيقاف الصوت الحالي أولاً لمنع التداخل
      await stopSound();
      
      // انتظار قصير للتأكد من التوقف التام
      setTimeout(() => {
        onNext();
      }, 100);
    } catch (error) {
      console.error('❌ Error playing next track:', error);
    }
  };

  // دالة تشغيل السابق
  const handlePrevious = async () => {
    if (!hasPrevious || !onPrevious) return;
    
    console.log('🎵 Playing previous track...');
    try {
      // إيقاف الصوت الحالي أولاً لمنع التداخل
      await stopSound();
      
      // انتظار قصير للتأكد من التوقف التام
      setTimeout(() => {
        onPrevious();
      }, 100);
    } catch (error) {
      console.error('❌ Error playing previous track:', error);
    }
  };

  // مراقبة تقدم الصوت
  useEffect(() => {
    let isMounted = true;
    
    const updateProgress = (status) => {
      if (!isMounted || isSeeking) return;
      if (status.isLoaded) {
        setPosition(status.positionMillis || 0);
        setDuration(status.durationMillis || 1);
      }
    };

    const sound = getCurrentSound();
    if (sound) {
      sound.setOnPlaybackStatusUpdate(updateProgress);
    }

    return () => {
      isMounted = false;
      if (sound) {
        sound.setOnPlaybackStatusUpdate(null);
      }
    };
  }, [getCurrentSound, isSeeking]);

  // دالة التنقل الفوري
  const handleSeek = async (value) => {
    const sound = getCurrentSound();
    if (sound) {
      await sound.setPositionAsync(value);
      setPosition(value);
    }
  };

  // دالة التقديم السريع (10 ثواني)
  const seekForward = async () => {
    const sound = getCurrentSound();
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          const newPosition = Math.min(
            (status.positionMillis || 0) + 10000, 
            status.durationMillis || 0
          );
          await sound.setPositionAsync(newPosition);
          console.log('⏩ Seeked forward 10 seconds');
        }
      } catch (error) {
        console.error('❌ Error seeking forward:', error);
      }
    }
  };

  // دالة التأخير السريع (10 ثواني)
  const seekBackward = async () => {
    const sound = getCurrentSound();
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          const newPosition = Math.max((status.positionMillis || 0) - 10000, 0);
          await sound.setPositionAsync(newPosition);
          console.log('⏪ Seeked backward 10 seconds');
        }
      } catch (error) {
        console.error('❌ Error seeking backward:', error);
      }
    }
  };

  // تنسيق الوقت
  const formatTime = (millis) => {
    const totalSeconds = Math.floor((millis || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // إخفاء الشريط إذا لم يكن هناك تشغيل حالي
  if (!currentTrackInfo) {
    return null;
  }

  return (
    <View style={[styles.container, darkMode && styles.containerDark]}>
      {/* معلومات المسار */}
      <View style={styles.trackInfo}>
        <MaterialIcons 
          name="audiotrack" 
          size={20} 
          color={darkMode ? '#90caf9' : '#197278'} 
        />
        <Text 
          style={[styles.trackName, darkMode && styles.trackNameDark]}
          numberOfLines={1}
        >
          {currentTrackInfo.name}
        </Text>
      </View>
      
      {/* شريط التقدم */}
      <View style={styles.progressSection}>
        <Text style={[styles.timeText, darkMode && styles.timeTextDark]}>
          {formatTime(position)}
        </Text>
        
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration}
          value={position}
          onValueChange={(value) => {
            setIsSeeking(true);
            setPosition(value);
          }}
          onSlidingStart={() => setIsSeeking(true)}
          onSlidingComplete={(value) => {
            setIsSeeking(false);
            handleSeek(value);
          }}
          minimumTrackTintColor={darkMode ? '#90caf9' : '#197278'}
          maximumTrackTintColor={darkMode ? '#666' : '#ddd'}
          thumbTintColor={darkMode ? '#90caf9' : '#197278'}
        />
        
        <Text style={[styles.timeText, darkMode && styles.timeTextDark]}>
          {formatTime(duration)}
        </Text>
      </View>
      
      {/* أزرار التحكم */}
      <View style={styles.controls}>
        <TouchableOpacity 
          onPress={handlePrevious}
          disabled={!hasPrevious}
          style={[
            styles.controlButton, 
            darkMode && styles.controlButtonDark,
            !hasPrevious && styles.controlButtonDisabled
          ]}
        >
          <MaterialIcons 
            name="skip-previous" 
            size={20} 
            color={!hasPrevious ? '#ccc' : (darkMode ? '#90caf9' : '#197278')} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={seekBackward}
          style={[styles.controlButton, styles.seekButton, darkMode && styles.controlButtonDark]}
        >
          <MaterialIcons 
            name="replay-10" 
            size={18} 
            color={darkMode ? '#90caf9' : '#197278'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={togglePlayback}
          style={[styles.controlButton, styles.playButton, darkMode && styles.controlButtonDark]}
        >
          <MaterialIcons 
            name={isPlaying ? 'pause' : 'play-arrow'} 
            size={24} 
            color={darkMode ? '#90caf9' : '#197278'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={seekForward}
          style={[styles.controlButton, styles.seekButton, darkMode && styles.controlButtonDark]}
        >
          <MaterialIcons 
            name="forward-10" 
            size={18} 
            color={darkMode ? '#90caf9' : '#197278'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={handleNext}
          disabled={!hasNext}
          style={[
            styles.controlButton, 
            darkMode && styles.controlButtonDark,
            !hasNext && styles.controlButtonDisabled
          ]}
        >
          <MaterialIcons 
            name="skip-next" 
            size={20} 
            color={!hasNext ? '#ccc' : (darkMode ? '#90caf9' : '#197278')} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={stopSound}
          style={[styles.controlButton, darkMode && styles.controlButtonDark]}
        >
          <MaterialIcons 
            name="stop" 
            size={20} 
            color={darkMode ? '#90caf9' : '#197278'} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#e0f2f1',
    borderTopWidth: 1,
    borderTopColor: '#b2dfdb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  containerDark: {
    backgroundColor: '#333',
    borderTopColor: '#444',
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackName: {
    marginLeft: 8,
    fontSize: 16,
    color: '#197278',
    fontWeight: '500',
    flex: 1,
  },
  trackNameDark: {
    color: '#90caf9',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  slider: {
    flex: 1,
    marginHorizontal: 10,
    height: 30,
  },
  timeText: {
    fontSize: 12,
    color: '#555',
    minWidth: 40,
    textAlign: 'center',
  },
  timeTextDark: {
    color: '#bbb',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around', // Changed to space-around for better distribution
  },
  controlButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 114, 120, 0.1)',
  },
  controlButtonDark: {
    backgroundColor: 'rgba(144, 202, 249, 0.1)',
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  playButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 114, 120, 0.1)',
  },
  seekButton: {
    padding: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(25, 114, 120, 0.05)',
  },
}); 