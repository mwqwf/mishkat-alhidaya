import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ⚠️ هذا المشروع مفصول عن أي قاعدة بيانات.
// لتشغيله أنشئ مشروع Firebase خاصاً بك وضع إعداداته هنا
// (أو عبر متغيرات بيئة في ملف .env غير مُتتبَّع في git).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'YOUR_API_KEY',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'YOUR_PROJECT.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'YOUR_PROJECT_ID',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'YOUR_PROJECT.firebasestorage.app',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? 'YOUR_APP_ID',
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
const db = getFirestore(app);

// تفعيل الكاش الدائم
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch(() => {
    // تجاهل الأخطاء المتعلقة بتفعيل الكاش
  });
}

const storage = getStorage(app);

export { db, storage };
