// YouTube Helper - معالج روابط يوتيوب
// هذا الملف يحتوي على دوال لمعالجة روابط يوتيوب وتحويلها إلى روابط قابلة للتشغيل

/**
 * استخراج معرف الفيديو من رابط يوتيوب
 * @param {string} url - رابط يوتيوب
 * @returns {string|null} - معرف الفيديو أو null إذا لم يتم العثور عليه
 */
export const extractYouTubeVideoId = (url) => {
  if (!url) return null;
  
  // أنماط مختلفة لروابط يوتيوب
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtu\.be\/([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
};

/**
 * التحقق من أن الرابط هو رابط يوتيوب
 * @param {string} url - الرابط للتحقق منه
 * @returns {boolean} - true إذا كان الرابط من يوتيوب
 */
export const isYouTubeUrl = (url) => {
  if (!url) return false;
  
  const youtubeDomains = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'www.youtu.be'
  ];
  
  try {
    const urlObj = new URL(url);
    return youtubeDomains.some(domain => urlObj.hostname === domain);
  } catch {
    return false;
  }
};

/**
 * إنشاء رابط تشغيل مباشر لفيديو يوتيوب (للاستخدام في التطبيقات)
 * @param {string} videoId - معرف الفيديو
 * @returns {string} - رابط التشغيل المباشر
 */
export const createYouTubeDirectUrl = (videoId) => {
  if (!videoId) return null;
  
  // استخدام YouTube Data API v3 للحصول على معلومات الفيديو
  // أو استخدام خدمات خارجية للحصول على رابط التشغيل المباشر
  return `https://www.youtube.com/watch?v=${videoId}`;
};

/**
 * إنشاء رابط embed لفيديو يوتيوب
 * @param {string} videoId - معرف الفيديو
 * @returns {string} - رابط الـ embed
 */
export const createYouTubeEmbedUrl = (videoId) => {
  if (!videoId) return null;
  
  return `https://www.youtube.com/embed/${videoId}`;
};

/**
 * معالجة رابط يوتيوب وإرجاع معلومات الفيديو
 * @param {string} url - رابط يوتيوب
 * @returns {object|null} - معلومات الفيديو أو null إذا فشل
 */
export const processYouTubeUrl = (url) => {
  if (!isYouTubeUrl(url)) {
    return null;
  }
  
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }
  
  return {
    videoId,
    originalUrl: url,
    embedUrl: createYouTubeEmbedUrl(videoId),
    directUrl: createYouTubeDirectUrl(videoId),
    isYouTube: true
  };
};

/**
 * إنشاء رابط تشغيل محسن لفيديو يوتيوب
 * @param {string} url - رابط يوتيوب الأصلي
 * @returns {string|null} - رابط التشغيل المحسن أو null إذا فشل
 */
export const getOptimizedYouTubeUrl = (url) => {
  const videoInfo = processYouTubeUrl(url);
  if (!videoInfo) {
    return null;
  }
  
  // يمكن استخدام خدمات خارجية للحصول على روابط تشغيل مباشرة
  // مثل: y2mate, savefrom.net, etc.
  // لكن هذا يتطلب API keys أو قد يكون غير قانوني
  
  // للآن، نستخدم رابط الـ embed كبديل
  return videoInfo.embedUrl;
};

/**
 * التحقق من صحة رابط يوتيوب
 * @param {string} url - الرابط للتحقق منه
 * @returns {boolean} - true إذا كان الرابط صحيح
 */
export const validateYouTubeUrl = (url) => {
  if (!url) return false;
  
  const videoId = extractYouTubeVideoId(url);
  return videoId !== null && videoId.length === 11; // معرف يوتيوب عادة 11 حرف
};

/**
 * إنشاء رابط مشاركة قصير ليوتيوب
 * @param {string} videoId - معرف الفيديو
 * @returns {string} - رابط المشاركة القصير
 */
export const createShortYouTubeUrl = (videoId) => {
  if (!videoId) return null;
  
  return `https://youtu.be/${videoId}`;
};

/**
 * استخراج معلومات إضافية من رابط يوتيوب
 * @param {string} url - رابط يوتيوب
 * @returns {object|null} - معلومات إضافية أو null إذا فشل
 */
export const extractYouTubeInfo = (url) => {
  if (!isYouTubeUrl(url)) {
    return null;
  }
  
  try {
    const urlObj = new URL(url);
    const videoId = extractYouTubeVideoId(url);
    
    if (!videoId) {
      return null;
    }
    
    return {
      videoId,
      originalUrl: url,
      shortUrl: createShortYouTubeUrl(videoId),
      embedUrl: createYouTubeEmbedUrl(videoId),
      timestamp: urlObj.searchParams.get('t'), // timestamp في الرابط
      playlist: urlObj.searchParams.get('list'), // playlist ID
      channel: urlObj.searchParams.get('channel'), // channel ID
      isYouTube: true
    };
  } catch (error) {
    console.error('Error extracting YouTube info:', error);
    return null;
  }
}; 