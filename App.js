import React, { useEffect, useState, useContext } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RealmProvider } from '@realm/react';
import { Book, Category, AppStats, SyncStatus, ContentUsage } from './database/realmConfig';
import SettingsDrawer from './components/SettingsDrawer';
import HomeScreen from './screens/HomeScreen';
import AdminDashboard from './screens/AdminDashboard';
import AdminSearch from './screens/AdminSearch';
import LoginScreen from './screens/LoginScreen';
import BooksScreen from './screens/BooksScreen';
import SubCategoriesScreen from './screens/SubCategoriesScreen';
import SubSubCategoriesScreen from './screens/SubSubCategoriesScreen';
import BookReaderScreen from './screens/BookReaderScreen';
import BookPdfViewer from "./screens/BookPdfViewer";
import VideoPlayerScreen from './screens/VideoPlayerScreen';
import AudioPlayerScreen from './screens/AudioPlayerScreen';
import StatsScreen from './screens/StatsScreen';
import { registerForPushNotificationsAsync } from './utils/notifications';
import { LogBox } from 'react-native';
import { AudioProvider } from './AudioContext';
import RecentlyAddedScreen from './screens/RecentlyAddedScreen';
import PopularContentScreen from './screens/PopularContentScreen';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AppSettingsContext from './AppSettingsContext';
import { Audio } from 'expo-av';
import * as Linking from 'expo-linking';
import BookForm from './components/BookForm';
import ShareMenu from 'react-native-share-menu';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { DataProvider } from './context/DataContext';
import Subcategory from './database/models/Subcategory';
import YouTubeVideoPlayer from './components/YouTubeVideoPlayer';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

function MainStack({ setPendingSharedFile, setSharedItem, pendingSharedFile }) {
  console.log('MainStack: rendering with pendingSharedFile:', {
    hasPendingSharedFile: !!pendingSharedFile,
    pendingSharedFileData: pendingSharedFile
  });
  
  return (
    <Stack.Navigator 
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="SubCategories" component={SubCategoriesScreen} />
      <Stack.Screen name="SubSubCategories" component={SubSubCategoriesScreen} />
      <Stack.Screen name="Content" component={BooksScreen} />
        <Stack.Screen name="BookPdfViewer" component={BookPdfViewer} />
      <Stack.Screen name="BookReader" component={BookReaderScreen} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} />
      <Stack.Screen name="YouTubeVideoPlayer" component={YouTubeVideoPlayer} />
      <Stack.Screen name="AudioPlayer" component={AudioPlayerScreen} />
      <Stack.Screen name="StatsScreen" component={StatsScreen} />
      <Stack.Screen name="LoginScreen" component={LoginScreen} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      <Stack.Screen name="AddContent">
        {props => <AddContentScreen {...props} sharedFile={pendingSharedFile} setPendingSharedFile={setPendingSharedFile} setSharedItem={setSharedItem} />}
      </Stack.Screen>
      <Stack.Screen name="AdminSearch" component={AdminSearch} />
    </Stack.Navigator>
  );
}

function MainTabs({ pendingSharedFile, setPendingSharedFile, setSharedItem }) {
  console.log('MainTabs: rendering with pendingSharedFile:', {
    hasPendingSharedFile: !!pendingSharedFile,
    pendingSharedFileData: pendingSharedFile
  });
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'الرئيسية') {
            return <Ionicons name="home-outline" size={size} color={color} />;
          } else if (route.name === 'المضافة مؤخراً') {
            return <Ionicons name="time-outline" size={size} color={color} />;
          } else if (route.name === 'مستجدات التطبيق') {
            return <Ionicons name="notifications-outline" size={size} color={color} />;
          }
        },
        tabBarActiveTintColor: '#197278',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: { backgroundColor: '#fff' },
        tabBarLabelStyle: { fontWeight: 'bold', fontSize: 14 },
      })}
    >
      <Tab.Screen name="الرئيسية">
        {props => <MainStack {...props} pendingSharedFile={pendingSharedFile} setPendingSharedFile={setPendingSharedFile} setSharedItem={setSharedItem} />}
      </Tab.Screen>
      <Tab.Screen name="المضافة مؤخراً" component={RecentlyAddedScreen} />
      <Tab.Screen name="مستجدات التطبيق" component={PopularContentScreen} />
    </Tab.Navigator>
  );
}

const AddContentScreen = (props) => {
  // تحسين الوصول إلى sharedFile - فحص كلا المصدرين
  const sharedFile = props.sharedFile || props.route?.params?.sharedFile;
  const navigation = props.navigation;
  const setPendingSharedFile = props.setPendingSharedFile;
  const setSharedItem = props.setSharedItem;
  const { isAdmin } = useContext(AppSettingsContext);

  console.log('AddContentScreen: mounted', { 
    sharedFile, 
    isAdmin,
    hasSharedFile: !!sharedFile,
    sharedFileUri: sharedFile?.uri,
    sharedFileName: sharedFile?.name,
    propsSharedFile: props.sharedFile,
    routeParamsSharedFile: props.route?.params?.sharedFile
  });

  // إزالة useEffect المسبب للمشاكل - سيتم التعامل معه في BookForm
  console.log('AddContentScreen: checking conditions', { isAdmin, hasSharedFile: !!sharedFile });

  if (isAdmin === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#197278' }}>
          جاري التحقق من الصلاحيات...
        </Text>
      </View>
    );
  }

  // تنظيف كل الحالة عند الإغلاق
  const handleClose = () => {
    console.log('AddContentScreen: handleClose called');
    // إضافة تأخير آمن لمنع كراش Reanimated
    setTimeout(() => {
      if (setPendingSharedFile) setPendingSharedFile(null);
      if (setSharedItem) setSharedItem(null);
      AsyncStorage.removeItem('pendingSharedFile').then(() => {
        console.log('AddContentScreen: pendingSharedFile removed from AsyncStorage');
      }).catch(error => {
        console.error('AddContentScreen: Error removing pendingSharedFile:', error);
      });
      navigation.goBack();
    }, 100);
  };

  // حماية إضافية - إذا لم يكن هناك sharedFile وليس المستخدم مشرف، أظهر رسالة خطأ
  if (!sharedFile && !isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d32f2f', textAlign: 'center', marginHorizontal: 20 }}>
          لا يمكن الوصول إلى هذه الصفحة. يجب أن تكون مشرفاً أو أن يكون هناك ملف مشترك.
        </Text>
        <TouchableOpacity 
          style={{ marginTop: 20, padding: 10, backgroundColor: '#197278', borderRadius: 5 }}
          onPress={handleClose}
        >
          <Text style={{ color: 'white', fontSize: 16 }}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    // نموذج إضافة الملفات المشتركة من تطبيقات خارجية (BookForm)
    <BookForm 
      sharedFile={sharedFile} 
      onBookAdded={() => navigation.navigate('المحتوى')} 
      onClose={handleClose} 
    />
  );
};

function AppContent() {
  const [darkMode, setDarkMode] = useState(false);
  const [autoDownload, setAutoDownload] = useState('off');
  const [fontSize, setFontSize] = useState(16);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sharedFile, setSharedFile] = useState(null);
  const [pendingSharedFile, setPendingSharedFile] = useState(null);
  const [navReady, setNavReady] = useState(false);
  const navigationRef = React.useRef();
  const [sharedItem, setSharedItem] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [adminCheckComplete, setAdminCheckComplete] = useState(false);
  const shareMenuInitialized = React.useRef(false);
  const isAdminRef = React.useRef(null);
  const shareMenuListenerRef = React.useRef(null);
  const [lastHandledUri, setLastHandledUri] = useState(null); // حماية ضد استقبال نفس الملف
  const [asyncStorageChecked, setAsyncStorageChecked] = useState(false); // منع التكرار
  const [drawerInitialRoute, setDrawerInitialRoute] = useState('المحتوى');
  const [drawerInitialRouteSet, setDrawerInitialRouteSet] = useState(false);

  // تحديث الـ ref عند تغيير isAdmin
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // تم نقل إعداد الصوت إلى AudioContext

  useEffect(() => {
    (async () => {
      try {
        const dm = await AsyncStorage.getItem('darkMode');
        const ad = await AsyncStorage.getItem('autoDownload');
        const fs = await AsyncStorage.getItem('fontSize');
        if (dm !== null) setDarkMode(dm === 'true');
        if (ad !== null) setAutoDownload(ad);
        if (fs !== null) setFontSize(Number(fs));
        setSettingsLoaded(true);
        console.log('Settings loaded successfully');
      } catch (error) {
        console.error('Error loading settings:', error);
        setSettingsLoaded(true); // تعيين true حتى في حالة الخطأ
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const adminData = await AsyncStorage.getItem('adminData');
      const isAdminUser = !!adminData;
      setIsAdmin(isAdminUser);
      setAdminCheckComplete(true);
      console.log('Admin check complete:', isAdminUser);
    })();

    // إضافة مستمع لتحديث حالة المشرف عند تغيير البيانات
    const checkAdminStatusInterval = setInterval(async () => {
      const adminData = await AsyncStorage.getItem('adminData');
      const isAdminUser = !!adminData;
      if (isAdminUser !== isAdminRef.current) {
        setIsAdmin(isAdminUser);
        console.log('Admin status updated:', isAdminUser);
      }
    }, 1000);

    return () => clearInterval(checkAdminStatusInterval);
  }, []);

  // تحميل pendingSharedFile من AsyncStorage عند بدء التطبيق
  useEffect(() => {
    (async () => {
      if (!adminCheckComplete || asyncStorageChecked) return;
      
      try {
        const storedData = await AsyncStorage.getItem('pendingSharedFile');
        console.log('AppContent: checking AsyncStorage for pendingSharedFile:', {
          hasStoredData: !!storedData,
          storedDataLength: storedData?.length
        });
        
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          console.log('AppContent: parsed pendingSharedFile from AsyncStorage:', parsedData);
          
          // فحص إضافي - لا تحمل الملف إذا كان هناك ملف معلق بالفعل
          if (pendingSharedFile) {
            console.log('تم تجاهل تحميل الملف من AsyncStorage لأنه معلق بالفعل');
            setAsyncStorageChecked(true);
            return;
          }
          setPendingSharedFile(parsedData);
          // إضافة تأخير آمن لمنع كراش Reanimated
          setTimeout(() => {
            setDrawerInitialRoute('AddContent');
          }, 100);
          console.log('Loaded pendingSharedFile from AsyncStorage:', parsedData);
        }
        setAsyncStorageChecked(true);
      } catch (error) {
        console.error('Error loading pendingSharedFile from AsyncStorage:', error);
        setAsyncStorageChecked(true);
      }
    })();
  }, [adminCheckComplete, asyncStorageChecked, pendingSharedFile]);

  useEffect(() => {
    (async () => {
      if (!adminCheckComplete) return;
      
      const url = await Linking.getInitialURL();
      console.log('Linking.getInitialURL() =', url);
      if (url && url.startsWith('file://')) {
        const fileUri = decodeURIComponent(url.replace('file://', ''));
        const fileObj = { uri: url, name: fileUri.split('/').pop() };
        console.log('InitialURL: isAdmin =', isAdmin);
        if (isAdmin) {
          setPendingSharedFile(fileObj);
          // إضافة تأخير آمن لمنع كراش Reanimated
          setTimeout(() => {
            setDrawerInitialRoute('AddContent');
          }, 100);
          console.log('Set initialRoute=AddContent, pendingSharedFile =', fileObj);
        } else {
          setDrawerInitialRoute('المحتوى');
          console.log('Set initialRoute=المحتوى (not admin)');
        }
      } else {
        // لا تحمل الملفات القديمة من AsyncStorage تلقائياً
        // سيتم التعامل معها في useEffect منفصل
        setDrawerInitialRoute('المحتوى');
        console.log('Set initialRoute=المحتوى (no url)');
      }
      setNavReady(true);
    })();
  }, [adminCheckComplete, isAdmin]); // إزالة pendingSharedFile من dependencies

  useEffect(() => {
    const handleUrl = async (event) => {
      console.log('handleUrl event:', event);
      if (event.url) {
        const fileUri = decodeURIComponent(event.url.replace('file://', ''));
        const fileObj = { uri: event.url, name: fileUri.split('/').pop() };
        console.log('handleUrl: isAdmin =', isAdmin);
        if (isAdmin) {
          if (navigationRef.current) {
            console.log('Navigating to AddContent from handleUrl, fileObj =', fileObj);
            // إضافة تأخير آمن لمنع كراش Reanimated
            setTimeout(() => {
              try {
                if (navigationRef.current) {
                  navigationRef.current.navigate('AddContent', { sharedFile: fileObj });
                }
              } catch (error) {
                console.error('Error navigating to AddContent from handleUrl:', error);
                // محاولة ثانية بعد تأخير أطول
                setTimeout(() => {
                  try {
                    if (navigationRef.current) {
                      navigationRef.current.navigate('AddContent', { sharedFile: fileObj });
                    }
                  } catch (retryError) {
                    console.error('Retry navigation from handleUrl failed:', retryError);
                  }
                }, 500);
              }
            }, 200);
          } else {
            setPendingSharedFile(fileObj);
            // إضافة تأخير آمن لمنع كراش Reanimated
            setTimeout(() => {
              setDrawerInitialRoute('AddContent');
            }, 100);
            console.log('Set initialRoute=AddContent, pendingSharedFile =', fileObj);
          }
        } else {
          if (navigationRef.current) {
            console.log('Navigating to المحتوى from handleUrl (not admin)');
            try {
              if (navigationRef.current) {
                navigationRef.current.navigate('المحتوى');
              }
            } catch (error) {
              console.error('Error navigating to المحتوى from handleUrl:', error);
            }
          } else {
            setDrawerInitialRoute('المحتوى');
            console.log('Set initialRoute=المحتوى (not admin)');
          }
        }
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [isAdmin]);

  useEffect(() => {
    if (!adminCheckComplete || shareMenuInitialized.current) return;
    
    console.log('Setting up ShareMenu (combined)...');
    console.log('Current admin status during ShareMenu setup:', isAdmin);
    shareMenuInitialized.current = true;
    
    const handleShareItem = (item, source) => {
      console.log(`ShareMenu.${source} called with:`, item);
      if (!item) {
        console.log(`No ${source} share item found`);
        return;
      }
      
      console.log('Received shared item from EXTERNAL app:', item);
      console.log('Item data:', item.data);
      console.log('Item mimeType:', item.mimeType);
      console.log('Item filename:', item.filename);
      
      // التحقق من AsyncStorage مباشرة بدلاً من استخدام isAdminRef
      AsyncStorage.getItem('adminData').then(adminData => {
        const currentIsAdmin = !!adminData;
        console.log('Current isAdmin status in handleShareItem (from AsyncStorage):', currentIsAdmin);
        
        if (currentIsAdmin) {
          // تحسين التعامل مع content:// URIs من التطبيقات الخارجية
          let uri = item.data;
          let fileName = item.filename || item.data.split('/').pop() || 'sharedfile';
          
          console.log('AppContent: processing EXTERNAL shared item for admin:', {
            originalUri: uri,
            originalFileName: fileName,
            mimeType: item.mimeType,
            source: 'external_app'
          });
          
          if (uri.startsWith('content://')) {
            // لا تضيف file:// prefix لـ content:// URIs من التطبيقات الخارجية
            uri = uri;
            
            // تحسين استخراج اسم الملف لـ content:// URIs من التطبيقات الخارجية
            if (!item.filename) {
              // محاولة استخراج اسم من URI إذا كان متاحاً
              let extractedName = '';
              
              // استخراج اسم من رابط تيليجرام
              if (uri.includes('Telegram')) {
                const uriParts = uri.split('/');
                const lastPart = uriParts[uriParts.length - 1];
                if (lastPart && lastPart.includes('%')) {
                  try {
                    extractedName = decodeURIComponent(lastPart);
                    // إزالة الامتداد إذا كان موجوداً
                    extractedName = extractedName.replace(/\.[^/.]+$/, '');
                  } catch (e) {
                    extractedName = '';
                  }
                }
              }
              
              // إذا لم نتمكن من استخراج اسم، استخدم الاسم الافتراضي
              if (!extractedName || extractedName.length < 3) {
                const mimeType = item.mimeType || '';
                let extension = '';
                if (mimeType.startsWith('audio/')) {
                  if (mimeType.includes('mp3')) extension = '.mp3';
                  else if (mimeType.includes('m4a')) extension = '.m4a';
                  else if (mimeType.includes('wav')) extension = '.wav';
                  else if (mimeType.includes('ogg')) extension = '.ogg';
                  else extension = '.mp3';
                } else if (mimeType.startsWith('video/')) {
                  if (mimeType.includes('mp4')) extension = '.mp4';
                  else if (mimeType.includes('mkv')) extension = '.mkv';
                  else if (mimeType.includes('avi')) extension = '.avi';
                  else extension = '.mp4';
                } else if (mimeType.includes('pdf')) {
                  extension = '.pdf';
                } else if (mimeType.startsWith('text/')) {
                  extension = '.txt';
                }
                fileName = `external_shared_file_${Date.now()}${extension}`;
              } else {
                // إضافة الامتداد المناسب للاسم المستخرج
                const mimeType = item.mimeType || '';
                let extension = '';
                if (mimeType.startsWith('audio/')) {
                  if (mimeType.includes('mp3')) extension = '.mp3';
                  else if (mimeType.includes('m4a')) extension = '.m4a';
                  else if (mimeType.includes('wav')) extension = '.wav';
                  else if (mimeType.includes('ogg')) extension = '.ogg';
                  else extension = '.mp3';
                } else if (mimeType.startsWith('video/')) {
                  if (mimeType.includes('mp4')) extension = '.mp4';
                  else if (mimeType.includes('mkv')) extension = '.mkv';
                  else if (mimeType.includes('avi')) extension = '.avi';
                  else extension = '.mp4';
                } else if (mimeType.includes('pdf')) {
                  extension = '.pdf';
                } else if (mimeType.startsWith('text/')) {
                  extension = '.txt';
                }
                fileName = `${extractedName}${extension}`;
              }
            }
          } else if (uri.startsWith('file://')) {
            uri = uri;
          } else {
            uri = 'file://' + uri;
          }
          
          const sharedFileData = {
            uri: uri,
            name: fileName,
            mimeType: item.mimeType,
            source: 'external_app', // تمييز واضح أن هذا من تطبيق خارجي
            timestamp: Date.now()
          };
          
          console.log('AppContent: processed EXTERNAL shared file data:', sharedFileData);
          
          // حماية محسنة ضد استقبال نفس الملف مرتين
          if (lastHandledUri === sharedFileData.uri) {
            console.log('تم تجاهل الملف لأنه مطابق للملف السابق (lastHandledUri):', sharedFileData.uri);
            return;
          }
          
          setLastHandledUri(sharedFileData.uri);
          // 1. عند استقبال ملف مشترك من ShareMenu، خزنه في AsyncStorage
          const sharedFileDataWithTimestamp = {
            ...sharedFileData,
            timestamp: Date.now(),
            uploadType: 'external' // تمييز واضح لنوع الإضافة
          };
          AsyncStorage.setItem('pendingSharedFile', JSON.stringify(sharedFileDataWithTimestamp));
          setPendingSharedFile(sharedFileDataWithTimestamp);
          // إضافة تأخير آمن لمنع كراش Reanimated
          setTimeout(() => {
            setDrawerInitialRoute('AddContent');
          }, 100);
          console.log(`Setting pendingSharedFile for EXTERNAL app (${source}):`, sharedFileDataWithTimestamp);
          console.log('AppContent: pendingSharedFile state updated, should trigger navigation');
        } else {
          console.log('User is not admin, ignoring EXTERNAL shared file');
        }
      }).catch(error => {
        console.error('Error checking admin status for EXTERNAL file:', error);
      });
    };

    // تنظيف أي listeners سابقة
    if (shareMenuListenerRef.current) {
      try {
        if (shareMenuListenerRef.current.remove) {
          shareMenuListenerRef.current.remove();
          shareMenuListenerRef.current = null;
        }
      } catch (e) {
        console.warn('Error cleaning up previous ShareMenu listener:', e);
      }
    }

    // إعداد ShareMenu listeners
    ShareMenu.getInitialShare((item) => handleShareItem(item, 'getInitialShare'));
    const handleNewShare = (item) => handleShareItem(item, 'addNewShareListener');
    shareMenuListenerRef.current = ShareMenu.addNewShareListener(handleNewShare);
    console.log('ShareMenu listener added:', shareMenuListenerRef.current);
    
    return () => {
      console.log('Cleaning up ShareMenu listener...');
      try {
        if (shareMenuListenerRef.current && typeof shareMenuListenerRef.current.remove === 'function') {
          shareMenuListenerRef.current.remove();
          shareMenuListenerRef.current = null;
        }
      } catch (error) {
        console.warn('Error removing ShareMenu listener:', error);
      }
      shareMenuInitialized.current = false;
    };
  }, [adminCheckComplete, isAdmin]);

  // عند أول تحميل فقط، إذا كان هناك ملف معلق، اجعل AddContent هو المسار الأولي
  useEffect(() => {
    console.log('AppContent: checking pendingSharedFile for initial route:', {
      hasPendingSharedFile: !!pendingSharedFile,
      drawerInitialRouteSet,
      pendingSharedFileData: pendingSharedFile
    });
    
    if (!drawerInitialRouteSet && pendingSharedFile) {
      // إضافة تأخير آمن لمنع كراش Reanimated
      setTimeout(() => {
        console.log('AppContent: setting initial route to AddContent due to pendingSharedFile');
        setDrawerInitialRoute('AddContent');
        setDrawerInitialRouteSet(true);
      }, 100);
    } else if (!drawerInitialRouteSet) {
      console.log('AppContent: setting initial route to المحتوى (no pending shared file)');
      setDrawerInitialRoute('المحتوى');
      setDrawerInitialRouteSet(true);
    }
  }, [pendingSharedFile, drawerInitialRouteSet]);

  // عند استقبال مشاركة جديدة والتطبيق مفتوح
  useEffect(() => {
    console.log('AppContent: useEffect triggered for pendingSharedFile navigation:', {
      hasPendingSharedFile: !!pendingSharedFile,
      drawerInitialRouteSet,
      hasNavigationRef: !!navigationRef.current,
      pendingSharedFileData: pendingSharedFile
    });
    
    if (drawerInitialRouteSet && pendingSharedFile && navigationRef.current) {
      // إضافة تأخير آمن لمنع كراش Reanimated
      const safeNavigate = () => {
        // فحص إضافي للتأكد من أن navigationRef.current لا يزال صالحاً
        if (!navigationRef.current) {
          console.log('navigationRef.current is null, skipping navigation');
          return;
        }
        
        // إذا لم تكن الشاشة الحالية هي AddContent، انتقل إليها
        try {
          const currentRoute = navigationRef.current.getCurrentRoute?.();
          console.log('AppContent: current route:', currentRoute?.name);
          if (!currentRoute || currentRoute.name !== 'AddContent') {
            // تأخير إضافي لضمان استقرار واجهة المستخدم
            setTimeout(() => {
              try {
                if (navigationRef.current) {
                  console.log('AppContent: navigating to AddContent with sharedFile:', pendingSharedFile);
                  navigationRef.current.navigate('AddContent', { sharedFile: pendingSharedFile });
                }
              } catch (error) {
                console.error('Error navigating to AddContent:', error);
                // محاولة ثانية بعد تأخير أطول
                setTimeout(() => {
                  try {
                    if (navigationRef.current) {
                      console.log('AppContent: retry navigating to AddContent');
                      navigationRef.current.navigate('AddContent', { sharedFile: pendingSharedFile });
                    }
                  } catch (retryError) {
                    console.error('Retry navigation failed:', retryError);
                  }
                }, 500);
              }
            }, 100);
          } else {
            console.log('AppContent: already on AddContent screen, skipping navigation');
          }
        } catch (error) {
          console.error('Error getting current route:', error);
          // محاولة التنقل مباشرة في حالة الخطأ
          setTimeout(() => {
            try {
              if (navigationRef.current) {
                console.log('AppContent: direct navigation to AddContent after error');
                navigationRef.current.navigate('AddContent', { sharedFile: pendingSharedFile });
              }
            } catch (navError) {
              console.error('Direct navigation failed:', navError);
            }
          }, 100);
        }
      };
      
      // تأخير أولي لضمان اكتمال عمليات Reanimated
      setTimeout(safeNavigate, 200);
    }
  }, [pendingSharedFile, drawerInitialRouteSet]);

  const updateDarkMode = async (val) => {
    setDarkMode(val);
    await AsyncStorage.setItem('darkMode', val.toString());
  };
  const updateAutoDownload = async (val) => {
    setAutoDownload(val);
    await AsyncStorage.setItem('autoDownload', val);
  };
  const updateFontSize = async (val) => {
    setFontSize(val);
    await AsyncStorage.setItem('fontSize', val.toString());
  };

  // إضافة لوج في بداية HomeScreen
  const HomeScreenWithLog = (props) => {
    console.log('HomeScreen mounted');
    return <HomeScreen {...props} />;
  };

  console.log('AppContent: pendingSharedFile =', pendingSharedFile, 'drawerInitialRoute =', drawerInitialRoute);

  if (!settingsLoaded || !adminCheckComplete || !navReady || !asyncStorageChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#197278' }}>
          تحميل مشكاة الهداية...
        </Text>
        <Text style={{ fontSize: 14, color: '#666', marginTop: 10 }}>
          يتم تهيئة التطبيق
        </Text>
      </View>
    );
  }
  
  console.log('AppContent: drawerInitialRoute =', drawerInitialRoute, 'pendingSharedFile =', pendingSharedFile);

  return (
    <AppSettingsContext.Provider value={{
      darkMode, updateDarkMode,
      autoDownload, updateAutoDownload,
      fontSize, updateFontSize,
      isAdmin
    }}>
      <AudioProvider>
        <DataProvider>
          <NavigationContainer
            ref={navigationRef}
            theme={darkMode ? DarkTheme : DefaultTheme}
            onReady={() => {
              console.log('NavigationContainer onReady');
              console.log('Pending shared file:', pendingSharedFile);
              console.log('Initial route:', drawerInitialRoute);
            }}
            onStateChange={(state) => {
              const route = state?.routes?.[state.index];
              console.log('Navigation state changed. Active route:', route?.name);
            }}
          >
            <Drawer.Navigator
              initialRouteName={drawerInitialRoute}
              drawerContent={(props) => <SettingsDrawer {...props} />}
              screenOptions={{
                drawerPosition: 'right',
                headerShown: false,
                swipeEnabled: false,
              }}
            >
              <Drawer.Screen name="المحتوى">
                {props => <MainTabs {...props} pendingSharedFile={pendingSharedFile} setPendingSharedFile={setPendingSharedFile} setSharedItem={setSharedItem} />}
              </Drawer.Screen>
              <Drawer.Screen name="AddContent">
                {props => (
                  <AddContentScreen 
                    {...props} 
                    sharedFile={pendingSharedFile} 
                    setPendingSharedFile={setPendingSharedFile} 
                    setSharedItem={setSharedItem} 
                  />
                )}
              </Drawer.Screen>
            </Drawer.Navigator>
          </NavigationContainer>
        </DataProvider>
      </AudioProvider>
    </AppSettingsContext.Provider>
  );
}

export default function App() {
  const [realmError, setRealmError] = useState(null);

  if (realmError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#e74c3c', textAlign: 'center', marginBottom: 20 }}>
          خطأ في تهيئة قاعدة البيانات
        </Text>
        <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>
          {realmError}
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: '#197278',
            padding: 15,
            borderRadius: 8,
            minWidth: 150,
            alignItems: 'center'
          }}
          onPress={() => {
            setRealmError(null);
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
            إعادة المحاولة
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <RealmProvider
      schema={[Book, Category, Subcategory, AppStats, SyncStatus, ContentUsage]}
      schemaVersion={5}
      deleteRealmIfMigrationNeeded={true}
      onError={(error) => {
        console.error('Realm Provider Error:', error);
        setRealmError(error.message);
      }}
      fallback={() => (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#197278' }}>
            جاري تهيئة قاعدة البيانات...
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginTop: 10 }}>
            يرجى الانتظار
          </Text>
        </View>
      )}
    >
      <AppContent />
    </RealmProvider>
  );
}
