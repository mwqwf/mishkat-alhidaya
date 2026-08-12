import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { isYouTubeUrl, processYouTubeUrl, createYouTubeEmbedUrl } from '../utils/youtubeHelper';

export default function YouTubeVideoPlayer({ route, navigation }) {
  const { content } = route.params;
  const [isYouTube, setIsYouTube] = useState(false);
  const [youtubeInfo, setYoutubeInfo] = useState(null);
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    checkIfYouTube();
  }, [content]);

  const checkIfYouTube = () => {
    if (!content || !content.bookUrl) return;

    const url = content.bookUrl;
    if (isYouTubeUrl(url)) {
      setIsYouTube(true);
      const info = processYouTubeUrl(url);
      setYoutubeInfo(info);
    } else {
      setIsYouTube(false);
      setYoutubeInfo(null);
    }
  };

  const handleOpenInYouTube = () => {
    if (youtubeInfo && youtubeInfo.originalUrl) {
      Linking.openURL(youtubeInfo.originalUrl);
    }
  };

  const handleOpenInBrowser = () => {
    if (youtubeInfo && youtubeInfo.originalUrl) {
      Linking.openURL(youtubeInfo.originalUrl);
    }
  };

  const handleShare = () => {
    if (youtubeInfo && youtubeInfo.originalUrl) {
      // يمكن إضافة منطق المشاركة هنا
      Alert.alert('مشاركة', 'رابط الفيديو:\n' + youtubeInfo.originalUrl);
    }
  };

  const reloadWebView = () => {
    setWebViewKey(prev => prev + 1);
  };

  if (!isYouTube || !youtubeInfo) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={48} color="#f44336" />
        <Text style={styles.errorText}>هذا الفيديو غير متوافق مع التطبيق</Text>
        <Text style={styles.errorSubtext}>يرجى فتحه في متصفح الويب</Text>
        <TouchableOpacity style={styles.openButton} onPress={handleOpenInBrowser}>
          <Text style={styles.openButtonText}>فتح في المتصفح</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const embedUrl = createYouTubeEmbedUrl(youtubeInfo.videoId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {content?.bookName || 'فيديو يوتيوب'}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <MaterialIcons name="share" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenInYouTube}>
            <MaterialIcons name="open-in-new" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* YouTube Video Player */}
      <View style={styles.videoContainer}>
        <WebView
          key={webViewKey}
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body {
                      margin: 0;
                      padding: 0;
                      background: #000;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      height: 100vh;
                    }
                    .video-container {
                      width: 100%;
                      height: 100%;
                      position: relative;
                    }
                    iframe {
                      width: 100%;
                      height: 100%;
                      border: none;
                    }
                    .fallback {
                      color: white;
                      text-align: center;
                      padding: 20px;
                      font-family: Arial, sans-serif;
                    }
                  </style>
                </head>
                <body>
                  <div class="video-container">
                    <iframe
                      src="${embedUrl}?autoplay=1&rel=0&modestbranding=1&showinfo=0"
                      frameborder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen
                    ></iframe>
                  </div>
                </body>
              </html>
            `
          }}
          style={styles.webView}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent);
          }}
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={reloadWebView}>
          <MaterialIcons name="refresh" size={24} color="#197278" />
          <Text style={styles.controlText}>إعادة تحميل</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleOpenInYouTube}>
          <MaterialIcons name="youtube-searched-for" size={24} color="#ff0000" />
          <Text style={styles.controlText}>فتح في يوتيوب</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={handleShare}>
          <MaterialIcons name="share" size={24} color="#197278" />
          <Text style={styles.controlText}>مشاركة</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>{content?.bookName || 'فيديو يوتيوب'}</Text>
        {content?.mainCategory && (
          <Text style={styles.infoCategory}>{content.mainCategory}</Text>
        )}
        <Text style={styles.infoText}>
          هذا الفيديو من يوتيوب ويتم تشغيله عبر متصفح الويب المدمج
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 40,
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
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  controlButton: {
    alignItems: 'center',
    padding: 8,
  },
  controlText: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
  },
  infoContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'right',
  },
  infoCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'right',
  },
  infoText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
    lineHeight: 18,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  openButton: {
    backgroundColor: '#197278',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  openButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 