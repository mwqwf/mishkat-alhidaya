import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

class BackgroundQueue {
  constructor() {
    this.jobs = new Map();
    this.workers = new Map();
    this.isProcessing = false;
    this.isPaused = false;
    this.maxConcurrency = 3;
    this.activeJobs = new Set();
    
    this.setupWorkers();
  }

  setupWorkers() {
    // عامل التحميل
    this.addWorker('download', this.downloadWorker.bind(this));
  }

  addWorker(name, workerFunction) {
    this.workers.set(name, workerFunction);
  }

  async addJob(type, payload, options = {}) {
    const jobId = `${type}_${payload.id}_${Date.now()}`;
    
    const job = {
      id: jobId,
      type,
      payload,
      options: {
        priority: 0,
        timeout: 7200000, // 120 دقيقة (زيادة كبيرة لدعم الملفات الكبيرة جداً)
        attempts: 3,
        retryCount: 0,
        ...options
      },
      status: 'pending',
      createdAt: Date.now()
    };

    this.jobs.set(jobId, job);
    console.log(`📋 Job added to background queue: ${jobId}`);
    
    if (!this.isPaused) {
      this.processJobs();
    }
    
    return jobId;
  }

  async processJobs() {
    if (this.isProcessing || this.isPaused) return;
    
    this.isProcessing = true;
    
    try {
      const pendingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'pending')
        .sort((a, b) => b.options.priority - a.options.priority);

      const promises = [];
      
      for (const job of pendingJobs) {
        if (this.activeJobs.size >= this.maxConcurrency) break;
        if (this.isPaused) break;
        
        this.activeJobs.add(job.id);
        promises.push(this.executeJob(job));
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    } catch (error) {
      console.error('❌ Error processing background jobs:', error);
    } finally {
      this.isProcessing = false;
      
      // التحقق من وجود المزيد من المهام
      const remainingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'pending');
      
      if (remainingJobs.length > 0 && !this.isPaused) {
        setTimeout(() => this.processJobs(), 1000);
      }
    }
  }

  async executeJob(job) {
    try {
      console.log(`⚙️ Executing job: ${job.id}`);
      job.status = 'running';
      
      const worker = this.workers.get(job.type);
      if (!worker) {
        throw new Error(`Worker not found for job type: ${job.type}`);
      }
      
      // إعداد timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), job.options.timeout);
      });
      
      // تنفيذ المهمة
      const result = await Promise.race([
        worker(job.payload, job.options),
        timeoutPromise
      ]);
      
      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
      
      console.log(`✅ Job completed: ${job.id}`);
      
      // استدعاء callback
      if (job.options.onComplete) {
        try {
          await job.options.onComplete(result);
        } catch (error) {
          console.error('❌ Error in onComplete callback:', error);
        }
      }
      
    } catch (error) {
      console.error(`❌ Job failed: ${job.id}`, error);
      
      job.options.retryCount++;
      
      if (job.options.retryCount < job.options.attempts) {
        job.status = 'pending';
        console.log(`🔄 Retrying job: ${job.id} (${job.options.retryCount}/${job.options.attempts})`);
      } else {
        job.status = 'failed';
        job.error = error.message;
        job.failedAt = Date.now();
        
        // استدعاء callback
        if (job.options.onFailed) {
          try {
            await job.options.onFailed(error);
          } catch (callbackError) {
            console.error('❌ Error in onFailed callback:', callbackError);
          }
        }
      }
      
      // استدعاء onFailure لكل محاولة فاشلة
      if (job.options.onFailure) {
        try {
          await job.options.onFailure(error);
        } catch (callbackError) {
          console.error('❌ Error in onFailure callback:', callbackError);
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  async downloadWorker(payload, options) {
    const { id, bookName, bookUrl, contentType } = payload;
    
    console.log(`📥 Starting background download: ${bookName}`);
    
    // محاولة الحصول على حجم الملف من الخادم أولاً
    let expectedSize = 0;
    try {
      const headResponse = await fetch(bookUrl, { method: 'HEAD' });
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          expectedSize = parseInt(contentLength, 10);
          console.log(`📊 Expected file size: ${this.formatFileSize(expectedSize)}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not get file size from server:', error);
    }
    
    // تحديد اسم الملف ومساره
    const fileName = contentType === 'video' || contentType === 'audio' 
      ? this.sanitizeFileName(bookName || id)
      : this.sanitizeFileName(bookName || id) + '.pdf';
    
    const fileUri = FileSystem.documentDirectory + fileName;
    
    // التحقق من وجود الملف مسبقاً
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists && fileInfo.size > 100) {
      console.log(`📄 File already exists: ${bookName}`);
      return {
        uri: fileUri,
        name: bookName,
        type: contentType || 'book',
        size: fileInfo.size
      };
    }
    
    let downloadProgress = 0;
    
    // إنشاء تحميل قابل للإستكمال
    const downloadResumable = FileSystem.createDownloadResumable(
      bookUrl,
      fileUri,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BookReaderApp)'
        }
      },
      (progressEvent) => {
        const progress = Math.round(
          (progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite) * 100
        );
        
        if (progress !== downloadProgress) {
          downloadProgress = progress;
          
          // إظهار معلومات التحميل المفصلة
          const downloadedMB = (progressEvent.totalBytesWritten / (1024 * 1024)).toFixed(2);
          const totalMB = (progressEvent.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(2);
          console.log(`📊 Download progress for ${bookName}: ${progress}% (${downloadedMB}MB / ${totalMB}MB)`);
          
          // استدعاء callback
          if (options.onProgress) {
            try {
              options.onProgress(progress);
            } catch (error) {
              console.error('❌ Error in onProgress callback:', error);
            }
          }
        }
      }
    );
    
    // تحميل الملف مع محاولات الاستئناف
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        result = await downloadResumable.downloadAsync();
        break; // نجح التحميل
      } catch (error) {
        retryCount++;
        console.log(`🔄 Download attempt ${retryCount}/${maxRetries} failed for ${bookName}:`, error.message);
        
        if (retryCount >= maxRetries) {
          throw error; // فشلت جميع المحاولات
        }
        
        // انتظار قبل المحاولة التالية
        await new Promise(resolve => setTimeout(resolve, 3000 * retryCount));
        
        // محاولة استئناف التحميل
        try {
          result = await downloadResumable.downloadAsync();
          console.log(`✅ Resume successful for ${bookName}`);
          break;
        } catch (resumeError) {
          console.log(`🔄 Resume attempt ${retryCount} failed for ${bookName}:`, resumeError.message);
          // استمر في الحلقة للمحاولة التالية
        }
      }
    }
    
    if (!result || !result.uri) {
      throw new Error('Download failed - no result');
    }
    
    // التحقق من حجم الملف المحمل
    const finalFileInfo = await FileSystem.getInfoAsync(result.uri);
    if (!finalFileInfo.exists || finalFileInfo.size <= 100) {
      throw new Error('Downloaded file is invalid or empty');
    }
    
    // التحقق من أن الملف مكتمل (إذا كان الحجم المتوقع معروف)
    if (expectedSize > 0 && finalFileInfo.size < expectedSize * 0.95) {
      throw new Error(`Downloaded file is incomplete. Expected: ${this.formatFileSize(expectedSize)}, Got: ${this.formatFileSize(finalFileInfo.size)}`);
    }
    
    console.log(`✅ Background download completed: ${bookName} (${this.formatFileSize(finalFileInfo.size)})`);
    
    return {
      uri: result.uri,
      name: bookName,
      type: contentType || 'book',
      size: finalFileInfo.size
    };
  }

  // تنسيق حجم الملف
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  sanitizeFileName(name) {
    // تنظيف اسم الملف
    const cleanName = (name || 'file').replace(/[^\w\d\-_\.]/g, '_');
    
    // إضافة امتداد مناسب إذا لم يكن موجود
    if (!cleanName.includes('.')) {
      return cleanName + '.mp4'; // افتراضي للفيديو والصوت
    }
    return cleanName;
  }

  pauseAll() {
    this.isPaused = true;
    console.log('⏸️ Background queue paused');
  }

  resumeAll() {
    this.isPaused = false;
    console.log('▶️ Background queue resumed');
    this.processJobs();
  }

  clearAll() {
    this.jobs.clear();
    this.activeJobs.clear();
    console.log('🗑️ Background queue cleared');
  }

  getStatus() {
    const pending = Array.from(this.jobs.values()).filter(job => job.status === 'pending').length;
    const running = this.activeJobs.size;
    const completed = Array.from(this.jobs.values()).filter(job => job.status === 'completed').length;
    const failed = Array.from(this.jobs.values()).filter(job => job.status === 'failed').length;
    
    return {
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      pending,
      running,
      completed,
      failed,
      total: this.jobs.size
    };
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  removeJob(jobId) {
    this.jobs.delete(jobId);
    this.activeJobs.delete(jobId);
  }
}

export default BackgroundQueue; 