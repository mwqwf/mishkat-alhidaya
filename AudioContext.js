import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { setGlobalMedia, unloadGlobalMedia } from './utils/globalMedia';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const soundRef = useRef(null);
  const [currentUri, setCurrentUri] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackInfo, setCurrentTrackInfo] = useState(null);

  // إعداد وضع الصوت للتشغيل في الخلفية
  useEffect(() => {
    const setupBackgroundAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('🎵 Background audio mode configured');
      } catch (error) {
        console.error('❌ Failed to setup background audio:', error);
      }
    };

    setupBackgroundAudio();
  }, []);

  const stopAndUnload = async () => {
    await unloadGlobalMedia();
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
      } catch (e) {
        console.log('Stop error (safe to ignore):', e);
      }
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.log('Unload error (safe to ignore):', e);
      }
      soundRef.current = null;
      setIsPlaying(false);
      setCurrentUri(null);
      setCurrentTrackInfo(null);
      console.log('🎵 Audio stopped and unloaded');
    }
  };

  const playSound = async (uri, trackInfo = null) => {
    try {
      // إيقاف أي صوت يعمل حالياً أولاً
      if (soundRef.current) {
        console.log('🎵 Stopping current audio before playing new one');
        await stopAndUnload();
      }

      // منع تشغيل نفس الملف مرة أخرى
      if (uri === currentUri && isPlaying) {
        console.log('🎵 Same audio already playing, skipping');
        return soundRef.current;
      }

      console.log('🎵 Creating new audio instance:', trackInfo?.name || uri);
      
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          isLooping: false,
          progressUpdateIntervalMillis: 500,
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
      setCurrentUri(uri);
      setCurrentTrackInfo(trackInfo);
      await setGlobalMedia(sound, 'audio');

      // مراقبة حالة التشغيل
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          console.log('🎵 Audio finished playing');
          stopAndUnload();
        }
        if (status.error) {
          console.error('❌ Audio playback error:', status.error);
          stopAndUnload();
        }
      });

      console.log('✅ Audio started playing successfully');
      return sound;
    } catch (error) {
      console.error('❌ Failed to play audio:', error);
      await stopAndUnload();
      throw error;
    }
  };

  const pauseSound = async () => {
    if (soundRef.current && isPlaying) {
      try {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        console.log('⏸️ Audio paused');
      } catch (error) {
        console.error('❌ Failed to pause audio:', error);
      }
    }
  };

  const resumeSound = async () => {
    if (soundRef.current && !isPlaying) {
      try {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        console.log('▶️ Audio resumed');
      } catch (error) {
        console.error('❌ Failed to resume audio:', error);
      }
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      await pauseSound();
    } else {
      await resumeSound();
    }
  };

  const stopSound = async () => {
    console.log('🎵 Manually stopping audio');
    await stopAndUnload();
  };

  // دالة لإيقاف الصوت عند تشغيل وسائط أخرى (مثل الفيديو أو صوت آخر)
  const handleMediaStart = async () => {
    if (soundRef.current && isPlaying) {
      console.log('🎵 Stopping current audio for new media');
      await stopAndUnload();
    }
  };

  // دالة لإرجاع كائن الصوت الحالي
  const getCurrentSound = () => soundRef.current;

  // دالة للحصول على معلومات المسار الحالي
  const getCurrentTrackInfo = () => currentTrackInfo;

  // تنظيف عند إلغاء تحميل المكون
  useEffect(() => {
    return () => {
      console.log('🎵 AudioProvider unmounting, cleaning up');
      stopAndUnload();
    };
  }, []);

  return (
    <AudioContext.Provider value={{ 
      playSound, 
      stopSound, 
      pauseSound,
      resumeSound,
      togglePlayback,
      isPlaying, 
      currentUri, 
      currentTrackInfo,
      handleMediaStart, 
      getCurrentSound,
      getCurrentTrackInfo
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
} 