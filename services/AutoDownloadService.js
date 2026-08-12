import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import BackgroundQueue from './BackgroundQueue';

// محاولة استيراد EventEmitter إذا كان متاحاً
let eventEmitter = null;
try {
  eventEmitter = require('../utils/EventEmitter').default;
} catch (error) {
  console.warn('⚠️ EventEmitter not available for AutoDownloadService');
}

class AutoDownloadService {
  constructor() {
    this.isActive = false;
    this.downloadQueue = [];
    this.maxConcurrentDownloads = 3;
    this.currentDownloads = new Set();
    this.settings = {
      enabled: false,
      contentTypes: ['book', 'audio', 'video']
    };
    this.backgroundQueue = new BackgroundQueue();
    
    // تهيئة الخدمة
    this.init();
  }

  async init() {
    try {
      // تحميل الإعدادات من AsyncStorage
      await this.loadSettings();
      
      // بدء الخدمة إذا كانت مفعلة
      if (this.settings.enabled) {
        await this.start();
      }
      
      console.log('🚀 AutoDownloadService initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing AutoDownloadService:', error);
    }
  }

  async loadSettings() {
    try {
      const savedSettings = await AsyncStorage.getItem('autoDownloadSettings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }
    } catch (error) {
      console.error('❌ Error loading auto-download settings:', error);
    }
  }

  async saveSettings() {
    try {
      await AsyncStorage.setItem('autoDownloadSettings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('❌ Error saving auto-download settings:', error);
    }
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    // إعادة تشغيل الخدمة بالإعدادات الجديدة
    if (this.settings.enabled) {
      await this.start();
    } else {
      await this.stop();
    }
    
    console.log('✅ Auto-download settings updated:', this.settings);
  }

  async start() {
    if (this.isActive) return;
    
    this.isActive = true;
    console.log('🟢 AutoDownloadService started');
    
    // بدء معالجة القائمة فوراً
    await this.processQueue();
  }

  async stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.pauseDownloads();
    console.log('🔴 AutoDownloadService stopped');
  }

  async addToQueue(content) {
    // التحقق المزدوج من تفعيل التحميل التلقائي
    if (!this.settings.enabled || !this.isActive) {
      console.log('📄 Auto-download disabled or not active, skipping:', content.bookName);
      return;
    }
    
    if (!this.settings.contentTypes.includes(content.contentType || 'book')) {
      console.log('📄 Content type not enabled for auto-download:', content.contentType);
      return;
    }
    
    // التحقق من عدم وجود المحتوى في القائمة
    const exists = this.downloadQueue.find(item => item.id === content.id);
    if (exists) {
      console.log('📄 Content already in download queue:', content.bookName);
      return;
    }
    
    // إضافة للقائمة مع أولوية
    const queueItem = {
      ...content,
      addedAt: Date.now(),
      priority: this.calculatePriority(content),
      retryCount: 0,
      maxRetries: 3
    };
    
    this.downloadQueue.push(queueItem);
    this.sortQueueByPriority();
    
    console.log('📥 Added to auto-download queue:', content.bookName);
    
    // بدء المعالجة إذا كانت الخدمة نشطة
    if (this.isActive) {
      await this.processQueue();
    }
  }

  calculatePriority(content) {
    let priority = 0;
    
    // محتوى أحدث = أولوية أعلى
    if (content.createdAt) {
      const ageInDays = (Date.now() - content.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      priority += Math.max(100 - ageInDays, 0);
    }
    
    // نوع المحتوى
    switch (content.contentType) {
      case 'book': priority += 50; break;
      case 'audio': priority += 30; break;
      case 'video': priority += 20; break;
      default: priority += 10; break;
    }
    
    // حجم الملف (أولوية أعلى للملفات الأصغر)
    if (content.fileSize) {
      priority += Math.max(50 - (content.fileSize / 1024 / 1024), 0); // MB
    }
    
    return priority;
  }

  sortQueueByPriority() {
    this.downloadQueue.sort((a, b) => b.priority - a.priority);
  }

  async processQueue() {
    if (!this.isActive || this.downloadQueue.length === 0) {
      return;
    }
    
    console.log(`🔄 Processing download queue: ${this.downloadQueue.length} items`);
    
    // معالجة التحميلات المتوازية
    while (
      this.currentDownloads.size < this.maxConcurrentDownloads &&
      this.downloadQueue.length > 0 &&
      this.isActive
    ) {
      const item = this.downloadQueue.shift();
      this.startDownload(item);
    }
  }

  async startDownload(item) {
    if (this.currentDownloads.has(item.id)) {
      console.log('📥 Already downloading:', item.bookName);
      return;
    }
    
    this.currentDownloads.add(item.id);
    
    try {
      console.log(`📥 Starting auto-download: ${item.bookName}`);
      
      // إرسال إشارة بدء التحميل للواجهة لإظهارها كما لو كانت تحميل يدوي
      this.emitDownloadEvent('downloadStarted', {
        id: item.id,
        name: item.bookName,
        type: item.contentType,
        isAutoDownload: true
      });
      
      // إضافة للقائمة في الخلفية
      await this.backgroundQueue.addJob('download', item, {
        priority: item.priority,
        timeout: 7200000, // 120 دقيقة (زيادة كبيرة لدعم الملفات الكبيرة جداً)
        attempts: item.maxRetries,
        onProgress: (progress) => {
          console.log(`📊 Download progress for ${item.bookName}: ${progress}%`);
          // إرسال تقدم التحميل للواجهة
          this.emitDownloadEvent('downloadProgress', {
            id: item.id,
            progress: progress,
            isAutoDownload: true
          });
        },
        onComplete: (result) => {
          this.onDownloadComplete(item, result);
        },
        onFailed: (error) => {
          this.onDownloadFailed(item, error);
        }
      });
      
    } catch (error) {
      console.error(`❌ Error starting download for ${item.bookName}:`, error);
      this.currentDownloads.delete(item.id);
      
      // إعادة المحاولة
      await this.retryDownload(item, error);
    }
  }

  // دالة لإرسال الأحداث للواجهة
  emitDownloadEvent(eventType, data) {
    try {
      // استخدام EventEmitter إذا كان متاحاً
      if (typeof eventEmitter !== 'undefined') {
        eventEmitter.emit(eventType, data);
      }
      
      // إرسال للتحديث المحلي أيضاً
      if (typeof global !== 'undefined' && global.autoDownloadEvents) {
        global.autoDownloadEvents.push({ eventType, data, timestamp: Date.now() });
      }
    } catch (error) {
      console.warn('⚠️ Could not emit download event:', error);
    }
  }

  async onDownloadComplete(item, result) {
    console.log(`✅ Auto-download completed: ${item.bookName}`);
    this.currentDownloads.delete(item.id);
    
    // إرسال إشارة إتمام التحميل للواجهة
    this.emitDownloadEvent('downloadCompleted', {
      id: item.id,
      name: item.bookName,
      uri: result.uri,
      type: item.contentType,
      isAutoDownload: true
    });
    
    // حفظ معلومات التحميل
    await this.saveDownloadInfo(item, result);
    
    // متابعة معالجة القائمة
    setTimeout(() => this.processQueue(), 1000);
  }

  async onDownloadFailed(item, error) {
    console.error(`❌ Auto-download failed: ${item.bookName}`, error);
    this.currentDownloads.delete(item.id);
    
    // إرسال إشارة فشل التحميل للواجهة
    this.emitDownloadEvent('downloadFailed', {
      id: item.id,
      name: item.bookName,
      error: error.message,
      isAutoDownload: true
    });
    
    await this.retryDownload(item, error);
  }

  async retryDownload(item, error) {
    item.retryCount++;
    
    if (item.retryCount < item.maxRetries) {
      // إعادة إضافة للقائمة مع تأخير
      setTimeout(() => {
        console.log(`🔄 Retrying download (${item.retryCount}/${item.maxRetries}): ${item.bookName}`);
        this.downloadQueue.unshift(item); // إضافة في المقدمة
        this.processQueue();
      }, Math.pow(2, item.retryCount) * 1000); // تأخير متزايد
    } else {
      console.error(`💀 Auto-download failed permanently: ${item.bookName}`);
      // حفظ سجل الفشل
      await this.saveFailedDownload(item, error);
    }
  }

  async saveDownloadInfo(item, result) {
    try {
      const downloadInfo = {
        id: item.id,
        name: item.bookName,
        type: item.contentType,
        uri: result.uri,
        completedAt: Date.now(),
        autoDownloaded: true
      };
      
      await AsyncStorage.setItem(`downloaded_${item.id}`, JSON.stringify(downloadInfo));
    } catch (error) {
      console.error('❌ Error saving download info:', error);
    }
  }

  async saveFailedDownload(item, error) {
    try {
      const failedInfo = {
        id: item.id,
        name: item.bookName,
        error: error.message,
        failedAt: Date.now(),
        retryCount: item.retryCount
      };
      
      await AsyncStorage.setItem(`failed_download_${item.id}`, JSON.stringify(failedInfo));
    } catch (error) {
      console.error('❌ Error saving failed download info:', error);
    }
  }

  pauseDownloads() {
    console.log('⏸️ Pausing auto-downloads');
    this.backgroundQueue.pauseAll();
  }

  resumeDownloads() {
    console.log('▶️ Resuming auto-downloads');
    this.backgroundQueue.resumeAll();
    this.processQueue();
  }

  async clearQueue() {
    console.log('🗑️ Clearing auto-download queue');
    this.downloadQueue = [];
    this.backgroundQueue.clearAll();
    this.currentDownloads.clear();
  }

  // API عامة للتحكم
  async enable() {
    await this.updateSettings({ enabled: true });
  }

  async disable() {
    await this.updateSettings({ enabled: false });
  }

  async setContentTypes(contentTypes) {
    await this.updateSettings({ contentTypes });
  }

  getStatus() {
    return {
      isActive: this.isActive,
      settings: this.settings,
      queueLength: this.downloadQueue.length,
      currentDownloads: this.currentDownloads.size
    };
  }

  async getDownloadHistory() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const downloadKeys = keys.filter(key => key.startsWith('downloaded_'));
      const downloads = await AsyncStorage.multiGet(downloadKeys);
      
      return downloads.map(([key, value]) => JSON.parse(value)).filter(Boolean);
    } catch (error) {
      console.error('❌ Error getting download history:', error);
      return [];
    }
  }

  async getFailedDownloads() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const failedKeys = keys.filter(key => key.startsWith('failed_download_'));
      const failed = await AsyncStorage.multiGet(failedKeys);
      
      return failed.map(([key, value]) => JSON.parse(value)).filter(Boolean);
    } catch (error) {
      console.error('❌ Error getting failed downloads:', error);
      return [];
    }
  }
}

// إنشاء مثيل واحد للخدمة
const autoDownloadService = new AutoDownloadService();

export default autoDownloadService; 