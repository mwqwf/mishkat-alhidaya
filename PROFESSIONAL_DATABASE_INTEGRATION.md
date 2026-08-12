# دليل التكامل مع قاعدة البيانات المحترفة
# Professional Database Integration Guide

## نظرة عامة
تم تطوير نظام قاعدة بيانات محترف جديد لتطبيق "مشكاة الهداية" يوفر:
- هيكل قاعدة بيانات متقدم ومحترف
- إدارة أفضل للأداء والذاكرة
- نظام مايجريشن ذكي
- إحصائيات وتحليلات متقدمة
- معالجة محسنة للأخطاء

## الهيكل الجديد

### 1. المجلدات الرئيسية
```
database/
├── index.js              # نقطة الدخول الرئيسية
├── realmConfig.js        # النظام القديم (للتوافق)
├── config/
│   └── RealmConfig.js    # إعدادات النظام الجديد
├── core/
│   └── DatabaseManager.js # مدير قاعدة البيانات
├── models/
│   ├── index.js          # فهرس النماذج
│   ├── BaseModel.js      # النموذج الأساسي
│   ├── Category.js       # نموذج الأقسام
│   ├── Book.js           # نموذج الكتب
│   ├── Subcategory.js    # نموذج الأقسام الفرعية
│   ├── Lesson.js         # نموذج الدروس
│   └── ContentStats.js   # نموذج الإحصائيات
└── services/
    └── MigrationService.js # خدمة المايجريشن
```

### 2. النماذج الجديدة

#### Category (الأقسام)
```javascript
{
  _id: string,
  name: string,
  description: string,
  sortOrder: number,
  isActive: boolean,
  color: string,
  icon: string,
  tags: string[],
  statistics: {
    totalSubcategories: number,
    totalContent: number,
    totalSize: number
  },
  metadata: object,
  createdAt: string,
  updatedAt: string
}
```

#### Book (الكتب)
```javascript
{
  _id: string,
  title: string,
  author: string,
  description: string,
  categoryId: string,
  subcategoryId: string,
  contentType: string,
  fileUrl: string,
  fileName: string,
  fileSize: number,
  filePath: string,
  downloadStatus: string,
  downloadProgress: number,
  downloadedAt: string,
  isBookmarked: boolean,
  lastAccessedAt: string,
  readingProgress: {
    currentPage: number,
    totalPages: number,
    percentage: number,
    timeSpent: number,
    bookmarks: array
  },
  rating: {
    userRating: number,
    averageRating: number,
    totalRatings: number
  },
  tags: string[],
  metadata: object,
  createdAt: string,
  updatedAt: string
}
```

#### Lesson (الدروس)
```javascript
{
  _id: string,
  title: string,
  description: string,
  categoryId: string,
  subcategoryId: string,
  speaker: string,
  duration: number,
  fileUrl: string,
  fileName: string,
  fileSize: number,
  filePath: string,
  downloadStatus: string,
  downloadProgress: number,
  downloadedAt: string,
  playbackStats: {
    currentPosition: number,
    totalPlayTime: number,
    playCount: number,
    lastPlayedAt: string,
    completionRate: number
  },
  tags: string[],
  metadata: object,
  createdAt: string,
  updatedAt: string
}
```

#### ContentStats (الإحصائيات)
```javascript
{
  _id: string,
  contentId: string,
  contentType: string,
  viewCount: number,
  totalViewTime: number,
  lastViewedAt: string,
  firstViewedAt: string,
  playbackStats: {
    totalPlayTime: number,
    averageSessionTime: number,
    completionRate: number,
    lastPosition: number
  },
  interactionStats: {
    likes: number,
    shares: number,
    downloads: number,
    bookmarks: number
  },
  engagementScore: number,
  createdAt: string,
  updatedAt: string
}
```

## خطوات التكامل

### 1. تحديث App.js
```javascript
import { RealmProvider } from '@realm/react';
import { Schemas } from './database';

// استبدال الاستيراد القديم
// import { Book, Category, AppStats, SyncStatus, ContentUsage } from './database/realmConfig';

// بالاستيراد الجديد
import { Schemas, getCurrentConfig } from './database';

// تحديث RealmProvider
function App() {
  const realmConfig = getCurrentConfig();
  
  return (
    <RealmProvider schema={Schemas} {...realmConfig}>
      <AppContent />
    </RealmProvider>
  );
}
```

### 2. تحديث DataContext
```javascript
import { getRealm, safeRead, safeWrite } from '../database';

// استبدال استخدام getRealm القديم
const realm = await getRealm();

// استخدام العمليات الآمنة
const books = await safeRead((realm) => {
  return realm.objects('Book').filtered('isActive == true');
});

await safeWrite((realm) => {
  realm.create('Book', newBookData);
});
```

### 3. تحديث الخدمات
```javascript
// في dataService.js
import { getRealm, safeRead, safeWrite, batchWrite } from '../database';

// استخدام العمليات المحسنة
export const getAllBooks = async () => {
  return await safeRead((realm) => {
    return Array.from(realm.objects('Book').sorted('createdAt', true));
  });
};

export const addMultipleBooks = async (booksData) => {
  const operations = booksData.map(bookData => (realm) => {
    return realm.create('Book', bookData);
  });
  
  return await batchWrite(operations);
};
```

### 4. تشغيل المايجريشن
```javascript
import { MigrationService } from '../database/services/MigrationService';

const migrationService = new MigrationService();

// تشغيل المايجريشن
try {
  const result = await migrationService.runFullMigration();
  console.log('Migration completed:', result);
} catch (error) {
  console.error('Migration failed:', error);
}

// مراقبة التقدم
const status = migrationService.getMigrationStatus();
console.log('Migration progress:', status.progress);
```

## الميزات الجديدة

### 1. العمليات الآمنة
```javascript
import { safeRead, safeWrite, batchWrite } from '../database';

// قراءة آمنة
const data = await safeRead((realm) => {
  return realm.objects('Book').filtered('categoryId == $0', categoryId);
});

// كتابة آمنة
await safeWrite((realm) => {
  const book = realm.objects('Book').filtered('_id == $0', bookId)[0];
  if (book) {
    book.lastAccessedAt = new Date().toISOString();
  }
});

// عمليات batch
const operations = books.map(book => (realm) => {
  return realm.create('Book', book);
});
await batchWrite(operations);
```

### 2. الإحصائيات المتقدمة
```javascript
import { getDatabaseStats } from '../database';

const stats = await getDatabaseStats();
console.log('Database statistics:', stats);
```

### 3. مراقبة الأحداث
```javascript
import { addEventListener, removeEventListener } from '../database';

const handleDatabaseChange = (data) => {
  console.log('Database changed:', data);
};

// إضافة مستمع
addEventListener('change', handleDatabaseChange);

// إزالة مستمع
removeEventListener('change', handleDatabaseChange);
```

### 4. إدارة الاتصال
```javascript
import { isConnected, restart, cleanup } from '../database';

// التحقق من الاتصال
if (!isConnected()) {
  await restart();
}

// تنظيف عند إغلاق التطبيق
await cleanup();
```

## أمثلة الاستخدام

### 1. جلب الكتب بالقسم
```javascript
const getBooksByCategory = async (categoryName) => {
  return await safeRead((realm) => {
    const category = realm.objects('Category').filtered('name == $0', categoryName)[0];
    if (!category) return [];
    
    return Array.from(realm.objects('Book').filtered('categoryId == $0', category._id));
  });
};
```

### 2. تحديث إحصائيات المشاهدة
```javascript
const updateViewStats = async (contentId, viewTime) => {
  await safeWrite((realm) => {
    let stats = realm.objects('ContentStats').filtered('contentId == $0', contentId)[0];
    
    if (!stats) {
      stats = realm.create('ContentStats', {
        _id: `stats_${contentId}`,
        contentId: contentId,
        contentType: 'book',
        viewCount: 0,
        totalViewTime: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    
    stats.viewCount += 1;
    stats.totalViewTime += viewTime;
    stats.lastViewedAt = new Date().toISOString();
    stats.updatedAt = new Date().toISOString();
  });
};
```

### 3. البحث المتقدم
```javascript
const searchContent = async (searchTerm) => {
  return await safeRead((realm) => {
    const books = realm.objects('Book').filtered(
      'title CONTAINS[c] $0 OR author CONTAINS[c] $0 OR tags CONTAINS[c] $0',
      searchTerm
    );
    
    const lessons = realm.objects('Lesson').filtered(
      'title CONTAINS[c] $0 OR speaker CONTAINS[c] $0 OR tags CONTAINS[c] $0',
      searchTerm
    );
    
    return {
      books: Array.from(books),
      lessons: Array.from(lessons),
      total: books.length + lessons.length
    };
  });
};
```

## التحسينات والفوائد

### 1. الأداء
- عمليات batch محسنة
- استعلامات مفهرسة
- إدارة ذاكرة محسنة
- ضغط قاعدة البيانات التلقائي

### 2. الموثوقية
- معالجة أخطاء شاملة
- عمليات آمنة
- نظام مايجريشن ذكي
- نسخ احتياطية تلقائية

### 3. القابلية للتوسع
- هيكل مرن للنماذج
- إضافة حقول جديدة بسهولة
- دعم العلاقات المعقدة
- إحصائيات متقدمة

### 4. سهولة الصيانة
- كود منظم ومقسم
- توثيق شامل
- اختبارات مدمجة
- مراقبة الأداء

## الاختبار والتحقق

### 1. اختبار المايجريشن
```javascript
// اختبار المايجريشن على بيانات تجريبية
const testMigration = async () => {
  const migrationService = new MigrationService();
  
  try {
    const result = await migrationService.runFullMigration();
    console.log('✅ Migration test passed:', result);
  } catch (error) {
    console.error('❌ Migration test failed:', error);
  }
};
```

### 2. اختبار الأداء
```javascript
// قياس أداء العمليات
const performanceTest = async () => {
  const startTime = Date.now();
  
  const books = await safeRead((realm) => {
    return realm.objects('Book').filtered('isActive == true');
  });
  
  const endTime = Date.now();
  console.log(`Query took ${endTime - startTime}ms for ${books.length} books`);
};
```

### 3. اختبار التكامل
```javascript
// اختبار التكامل مع الواجهات
const integrationTest = async () => {
  // اختبار جلب البيانات
  const categories = await getCategories();
  console.log('Categories loaded:', categories.length);
  
  // اختبار إضافة بيانات
  await addBook(testBookData);
  console.log('Book added successfully');
  
  // اختبار تحديث الإحصائيات
  await updateViewStats(testBookId, 300);
  console.log('Stats updated successfully');
};
```

## الخلاصة

النظام الجديد يوفر:
- **أداء محسن** بشكل كبير
- **موثوقية عالية** في العمليات
- **قابلية توسع** للمستقبل
- **سهولة صيانة** وتطوير
- **تتبع متقدم** للإحصائيات

يمكن التكامل تدريجياً مع النظام القديم للحفاظ على استقرار التطبيق أثناء الانتقال. 