import React, { useContext, useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AppSettingsContext from '../AppSettingsContext';
import { clearCachedData } from '../utils/cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { CommonActions } from '@react-navigation/native';
import eventEmitter from '../utils/EventEmitter';
import autoDownloadService from '../services/AutoDownloadService';

const AUTO_DOWNLOAD_OPTIONS = [
  { label: 'دائمًا', value: 'always' },
  { label: 'عند الاتصال بالواي فاي فقط', value: 'wifi' },
  { label: 'عند استخدام البيانات فقط', value: 'cellular' },
  { label: 'إيقاف', value: 'off' },
];

const CLEAR_CONTENT_OPTIONS = [
  { label: 'الكل', value: 'all', icon: 'delete-sweep' },
  { label: 'الفيديوهات', value: 'video', icon: 'videocam-off' },
  { label: 'الملفات الصوتية', value: 'audio', icon: 'volume-off' },
  { label: 'الكتب فقط', value: 'books', icon: 'menu-book' },
];

export default function SettingsDrawer(props) {
  const {
    darkMode, updateDarkMode,
    autoDownload, updateAutoDownload,
    fontSize, updateFontSize
  } = useContext(AppSettingsContext);

  const [expanded, setExpanded] = useState({
    darkMode: false,
    fontSize: false,
    autoDownload: false,
    clearContent: false,
  });

  // إضافة state للتحديث التلقائي للواجهة
  const [autoDownloadStatus, setAutoDownloadStatus] = useState({
    isActive: false,
    settings: { contentTypes: [] }
  });

  // تحديث الحالة كل ثانيتين لضمان التزامن
  useEffect(() => {
    const updateStatus = () => {
      try {
        const status = autoDownloadService.getStatus();
        setAutoDownloadStatus(status);
      } catch (error) {
        console.error('❌ Error getting auto-download status:', error);
      }
    };

    // تحديث فوري
    updateStatus();

    // تحديث دوري
    const interval = setInterval(updateStatus, 2000);

    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const changeFontSize = (inc) => {
    let newSize = fontSize + inc;
    if (newSize < 12) newSize = 12;
    if (newSize > 28) newSize = 28;
    updateFontSize(newSize);
  };

  // تنظيف إضافي لأي مفاتيح متبقية
  const cleanupRemainingKeys = async () => {
    try {
      console.log('🧹 Final cleanup of remaining keys...');
      const allKeys = await AsyncStorage.getAllKeys();
      const downloadKeys = allKeys.filter(key => 
        key.startsWith('download_') || 
        key.startsWith('downloaded_') ||
        key.includes('update_image_')
      );
      
      console.log(`🧹 Found ${downloadKeys.length} keys for final cleanup`);
      
      for (const key of downloadKeys) {
        try {
          await AsyncStorage.removeItem(key);
          console.log(`🧹 Final cleanup removed: ${key}`);
        } catch (error) {
          console.warn(`⚠️ Could not remove key ${key}:`, error);
        }
      }
      
      console.log('✅ Final cleanup completed');
    } catch (error) {
      console.error('❌ Error in final cleanup:', error);
    }
  };

  // دالة مسح المحتوى المحمل
  const clearDownloadedContent = async (type) => {
    const getWarningMessage = (type) => {
      switch (type) {
        case 'all':
          return '⚠️ تحذير: سيتم مسح جميع المحتوى المحمل (كتب، فيديوهات، ملفات صوتية)\n\nهذا الإجراء لا يمكن التراجع عنه. ستحتاج لإعادة تحميل المحتوى مرة أخرى.';
        case 'video':
          return '⚠️ تحذير: سيتم مسح جميع ملفات الفيديو المحملة\n\nستبقى الكتب والملفات الصوتية كما هي. هذا الإجراء لا يمكن التراجع عنه.';
        case 'audio':
          return '⚠️ تحذير: سيتم مسح جميع الملفات الصوتية المحملة\n\nستبقى الكتب وملفات الفيديو كما هي. هذا الإجراء لا يمكن التراجع عنه.';
        case 'books':
          return '⚠️ تحذير: سيتم مسح جميع الكتب المحملة\n\nستبقى ملفات الفيديو والصوت كما هي. هذا الإجراء لا يمكن التراجع عنه.';
        default:
          return 'هل أنت متأكد من هذا الإجراء؟';
      }
    };

    Alert.alert(
      'مسح المحتوى المحمل',
      getWarningMessage(type),
      [
        { text: 'إلغاء', style: 'cancel' },
        { 
          text: 'تأكيد المسح', 
          style: 'destructive',
          onPress: () => performClearContent(type)
        }
      ]
    );
  };

  // تنفيذ مسح المحتوى
  const performClearContent = async (type) => {
    try {
      console.log(`🗑️ Starting clear content: ${type}`);
      
      // الحصول على جميع مفاتيح AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // البحث عن جميع أنماط مفاتيح التحميل
      const downloadKeys = allKeys.filter(key => 
        key.startsWith('download_') || key.startsWith('downloaded_')
      );
      
      console.log(`🔍 Found ${downloadKeys.length} download keys:`, downloadKeys);
      
      // الحصول على جميع الملفات في directory للحذف المباشر
      const directoryFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      console.log(`📁 Found ${directoryFiles.length} files in directory`);
      
      let deletedCount = 0;
      let errorCount = 0;
      
      // حذف الملفات من النظام مباشرة
      for (const fileName of directoryFiles) {
        try {
          const fileExtension = fileName.split('.').pop()?.toLowerCase();
            let shouldDelete = false;
            
            // تحديد نوع الملف والقرار بالحذف
            switch (type) {
              case 'all':
                shouldDelete = true;
                break;
              case 'video':
                shouldDelete = ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(fileExtension);
                break;
              case 'audio':
                shouldDelete = ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(fileExtension);
                break;
              case 'books':
                shouldDelete = ['pdf'].includes(fileExtension) || 
                            (!['mp4', 'avi', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'jpg', 'jpeg', 'png'].includes(fileExtension));
                break;
            }
            
            if (shouldDelete) {
            const filePath = FileSystem.documentDirectory + fileName;
                    await FileSystem.deleteAsync(filePath);
            console.log(`✅ Deleted file: ${fileName}`);
            deletedCount++;
                  }
                } catch (fileError) {
          console.warn(`⚠️ Could not delete file: ${fileName}`, fileError);
          errorCount++;
                }
              }
              
      // حذف مفاتيح AsyncStorage
      for (const key of downloadKeys) {
        try {
              await AsyncStorage.removeItem(key);
              console.log(`✅ Removed storage key: ${key}`);
        } catch (storageError) {
          console.warn(`⚠️ Could not remove key ${key}:`, storageError);
          errorCount++;
        }
      }
      
      // رسالة النتيجة
      const typeLabel = type === 'all' ? 'جميع الملفات' : 
                       type === 'video' ? 'ملفات الفيديو' : 
                       type === 'audio' ? 'الملفات الصوتية' : 'الكتب';
      
      if (deletedCount > 0) {
        Alert.alert(
          'تم المسح بنجاح',
          `تم مسح ${deletedCount} من ${typeLabel}${errorCount > 0 ? `\n\nفشل في مسح ${errorCount} ملف` : ''}`,
          [{ 
            text: 'موافق',
            onPress: () => {
              // تنظيف إضافي لأي مفاتيح قد تكون فاتت
              cleanupRemainingKeys().then(() => {
                // إغلاق الدراج
              props.navigation?.closeDrawer();
                
                // إرسال إشارة عبر EventEmitter بدلاً من navigation
                console.log('📡 Sending clear content signal via EventEmitter...');
                eventEmitter.emit('clearContent', { 
                  timestamp: Date.now(),
                  type: type,
                  deletedCount: deletedCount 
                });
                
                // إرسال إشارة إضافية للتأكد
                setTimeout(() => {
                  eventEmitter.emit('forceRefresh', { timestamp: Date.now() });
                }, 500);
                
                // العودة للصفحة الرئيسية بعد تأخير
                setTimeout(() => {
                  props.navigation?.navigate('الرئيسية');
                }, 1000);
              });
            }
          }]
        );
      } else {
        Alert.alert(
          'لا توجد ملفات',
          `لا توجد ${typeLabel} محملة لمسحها`,
          [{ text: 'موافق' }]
        );
      }
      
      console.log(`🗑️ Clear content completed: ${deletedCount} deleted, ${errorCount} errors`);
      
    } catch (error) {
      console.error('❌ Error in performClearContent:', error);
      Alert.alert(
        'خطأ',
        'حدث خطأ أثناء مسح المحتوى. يرجى المحاولة مرة أخرى.',
        [{ text: 'موافق' }]
      );
    }
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>الإعدادات</Text>
      
      {/* الوضع الليلي */}
      <TouchableOpacity onPress={() => toggleExpand('darkMode')} style={styles.settingRow}>
        <Ionicons name="moon" size={22} color="#197278" style={styles.icon} />
        <Text style={styles.label}>الوضع الليلي</Text>
      </TouchableOpacity>
      {expanded.darkMode && (
        <View style={{flexDirection:'row',alignItems:'center',marginBottom:12,marginRight:36}}>
          <Text style={{marginLeft:8}}>تفعيل/إيقاف</Text>
          <Switch value={darkMode} onValueChange={updateDarkMode} />
        </View>
      )}
      
      {/* حجم الخط */}
      <TouchableOpacity onPress={() => toggleExpand('fontSize')} style={styles.settingRow}>
        <Ionicons name="text" size={22} color="#197278" style={styles.icon} />
        <Text style={styles.label}>حجم الخط</Text>
      </TouchableOpacity>
      {expanded.fontSize && (
        <View style={{flexDirection:'row',alignItems:'center',marginBottom:12,marginRight:36}}>
          <TouchableOpacity onPress={() => changeFontSize(2)} style={styles.fontBtn}><Text style={styles.fontBtnText}>+</Text></TouchableOpacity>
          <Text style={styles.fontSizeVal}>{fontSize}</Text>
          <TouchableOpacity onPress={() => changeFontSize(-2)} style={styles.fontBtn}><Text style={styles.fontBtnText}>-</Text></TouchableOpacity>
        </View>
      )}
      
      {/* التحميل التلقائي */}
      <TouchableOpacity onPress={() => toggleExpand('autoDownload')} style={styles.settingRow}>
        <Ionicons name="cloud-download-outline" size={22} color="#197278" style={styles.icon} />
        <Text style={styles.label}>التحميل التلقائي</Text>
      </TouchableOpacity>
      {expanded.autoDownload && (
        <View style={{marginBottom:12,marginRight:36}}>
          
          {/* تفعيل/إلغاء الخدمة */}
          <View style={[styles.advancedSettingItem, { backgroundColor: darkMode ? '#444' : '#f5f5f5' }]}>
            <Text style={[styles.advancedLabel, { color: darkMode ? '#fff' : '#333' }]}>
              تفعيل التحميل التلقائي
            </Text>
            <Switch
              value={autoDownloadStatus.isActive}
              onValueChange={async (value) => {
                try {
                  if (value) {
                    await autoDownloadService.enable();
                    Alert.alert('تم التفعيل', 'الخدمة تعمل الآن وستحمل المحتوى الجديد تلقائياً');
                  } else {
                    await autoDownloadService.disable();
                    Alert.alert('تم الإيقاف', 'تم إيقاف الخدمة');
                  }
                } catch (error) {
                  Alert.alert('خطأ', 'حدث خطأ في تحديث الخدمة');
                }
              }}
              trackColor={{ false: '#767577', true: darkMode ? '#90caf9' : '#197278' }}
              thumbColor={autoDownloadStatus.isActive ? '#fff' : '#f4f3f4'}
            />
          </View>

          {/* الإعدادات المتقدمة - تظهر فقط عند التفعيل */}
          {autoDownloadStatus.isActive && (
            <View>
              {/* أنواع المحتوى */}
              <Text style={[styles.advancedLabel, { color: darkMode ? '#fff' : '#333', marginTop: 10, marginBottom: 5 }]}>
                أنواع المحتوى:
              </Text>
              <View style={styles.contentTypesList}>
                {[
                  { key: 'book', label: 'كتب', icon: 'menu-book' },
                  { key: 'audio', label: 'صوت', icon: 'audiotrack' },
                  { key: 'video', label: 'فيديو', icon: 'video-library' }
                ].map(contentType => (
                  <TouchableOpacity
                    key={contentType.key}
                    style={[
                      styles.contentTypeItem,
                      {
                        backgroundColor: autoDownloadStatus.settings.contentTypes.includes(contentType.key) 
                          ? (darkMode ? '#90caf9' : '#197278') 
                          : (darkMode ? '#555' : '#e0e0e0')
                      }
                    ]}
                    onPress={async () => {
                      const currentTypes = autoDownloadStatus.settings.contentTypes;
                      let newTypes;
                      
                      if (currentTypes.includes(contentType.key)) {
                        newTypes = currentTypes.filter(type => type !== contentType.key);
                      } else {
                        newTypes = [...currentTypes, contentType.key];
                      }
                      
                      await autoDownloadService.setContentTypes(newTypes);
                    }}
                  >
                    <MaterialIcons 
                      name={contentType.icon} 
                      size={16} 
                      color={autoDownloadStatus.settings.contentTypes.includes(contentType.key) ? '#fff' : (darkMode ? '#aaa' : '#666')} 
                    />
                    <Text style={[
                      styles.contentTypeLabel,
                      { 
                        color: autoDownloadStatus.settings.contentTypes.includes(contentType.key) ? '#fff' : (darkMode ? '#aaa' : '#666'),
                        fontSize: 12
                      }
                    ]}>
                      {contentType.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* معلومات سريعة */}
              <View style={[styles.quickStats, { backgroundColor: darkMode ? '#444' : '#f5f5f5' }]}>
                <Text style={[styles.quickStatsText, { color: darkMode ? '#90caf9' : '#197278' }]}>
                  في القائمة: {autoDownloadStatus.queueLength} | 
                  يتم التحميل: {autoDownloadStatus.currentDownloads}
                </Text>
              </View>

              {/* زر مسح القائمة */}
              <View style={styles.quickButtons}>
                <TouchableOpacity
                  style={[styles.quickButton, { backgroundColor: darkMode ? '#555' : '#e0e0e0' }]}
                  onPress={async () => {
                    Alert.alert(
                      'مسح قائمة الانتظار',
                      'هل تريد مسح جميع المحتوى في قائمة انتظار التحميل التلقائي؟',
                      [
                        { text: 'إلغاء', style: 'cancel' },
                        { 
                          text: 'مسح', 
                          style: 'destructive',
                          onPress: async () => {
                            await autoDownloadService.clearQueue();
                            Alert.alert('تم المسح', 'تم مسح قائمة الانتظار');
                          }
                        }
                      ]
                    );
                  }}
                >
                  <MaterialIcons name="clear-all" size={16} color={darkMode ? '#fff' : '#333'} />
                  <Text style={[styles.quickButtonText, { color: darkMode ? '#fff' : '#333' }]}>مسح القائمة</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
      
      {/* الإحصائيات */}
      <TouchableOpacity 
        onPress={() => props.navigation?.navigate('StatsScreen')} 
        style={styles.settingRow}
      >
        <MaterialIcons name="analytics" size={22} color="#197278" style={styles.icon} />
        <Text style={styles.label}>📊 الإحصائيات</Text>
      </TouchableOpacity>
      
      {/* مسح المحتوى المحمل */}
      <TouchableOpacity onPress={() => toggleExpand('clearContent')} style={styles.settingRow}>
        <MaterialIcons name="delete-sweep" size={22} color="#d32f2f" style={styles.icon} />
        <Text style={[styles.label, { color: '#d32f2f' }]}>مسح المحتوى المحمل</Text>
      </TouchableOpacity>
      {expanded.clearContent && (
        <View style={{marginBottom:12,marginRight:36}}>
          {CLEAR_CONTENT_OPTIONS.map((option) => (
            <TouchableOpacity 
              key={option.value}
              onPress={() => clearDownloadedContent(option.value)}
              style={styles.clearOptionBtn}
            >
              <MaterialIcons name={option.icon} size={18} color="#d32f2f" style={{marginLeft: 8}} />
              <Text style={styles.clearOptionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    backgroundColor: '#f6fcfa',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#197278',
    marginBottom: 18,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  icon: {
    marginLeft: 8,
  },
  label: {
    flex: 1,
    fontSize: 16,
    color: '#29434e',
    textAlign: 'right',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
    justifyContent: 'center',
  },
  optionBtn: {
    backgroundColor: '#e0f2f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    margin: 4,
  },
  optionBtnActive: {
    backgroundColor: '#197278',
  },
  optionText: {
    color: '#197278',
    fontWeight: 'bold',
  },
  optionTextActive: {
    color: '#fff',
  },
  fontBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  fontBtn: {
    backgroundColor: '#e0f2f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginHorizontal: 2,
  },
  fontBtnText: {
    color: '#197278',
    fontSize: 18,
    fontWeight: 'bold',
  },
  fontSizeVal: {
    fontSize: 16,
    color: '#29434e',
    marginHorizontal: 6,
    minWidth: 24,
    textAlign: 'center',
  },
  clearOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  clearOptionText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
  },
  // Advanced auto-download settings styles
  advancedSettingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  advancedLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  contentTypesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
    marginBottom: 10,
  },
  contentTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  contentTypeLabel: {
    marginLeft: 8,
    fontSize: 12,
  },
  quickStats: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  quickStatsText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  quickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 'bold',
  },
}); 