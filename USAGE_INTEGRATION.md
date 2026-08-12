# دليل تكامل نظام تتبع الاستخدام

تم إنشاء نظام تتبع الاستخدام لمراقبة المحتوى الأكثر اطلاعاً في التطبيق. إليك الملفات التي تم إنشاؤها والتعديلات المطلوبة:

## 1. الملفات الجديدة المُنشأة:

### أ) services/usageTrackingService.js
- خدمة تتبع الاستخدام الرئيسية
- تسجيل مشاهدات المحتوى
- استرجاع المحتوى الأكثر شعبية
- إحصائيات الاستخدام

### ب) screens/PopularContentScreen.js  
- صفحة عرض المحتوى الأكثر اطلاعاً
- 3 تبويبات: الأكثر شعبية، المشاهد مؤخراً، الإحصائيات
- تصميم متناسق مع باقي الصفحات

## 2. التعديلات على الملفات الموجودة:

### أ) database/realmConfig.js
تم إضافة:
```javascript
// نموذج تتبع الاستخدام والمشاهدات
export class ContentUsage extends Realm.Object {
  static schema = {
    name: 'ContentUsage',
    primaryKey: 'id',
    properties: {
      id: 'string',
      contentId: { type: 'string', indexed: true },
      contentName: 'string',
      contentType: { type: 'string', indexed: true },
      mainCategory: { type: 'string', indexed: true },
      subCategory: 'string?',
      subSubCategory: 'string?',
      viewCount: { type: 'int', default: 0, indexed: true },
      totalViewTime: { type: 'int', default: 0 },
      lastViewedAt: { type: 'date', indexed: true },
      firstViewedAt: 'date',
      createdAt: 'date',
    },
  };
}
```

### ب) App.js
يجب إضافة:

1. الاستيراد:
```javascript
import PopularContentScreen from './screens/PopularContentScreen';
```

2. في دالة tabBarIcon داخل MainTabs():
```javascript
} else if (route.name === 'الأكثر اطلاعاً') {
  return <Ionicons name="trending-up" size={size} color={color} />;
```

3. في Tab.Navigator:
```javascript
<Tab.Screen name="الأكثر اطلاعاً" component={PopularContentScreen} />
```

### ج) إضافة تتبع الاستخدام في الصفحات:

#### في BookReaderScreen.js:
```javascript
import usageTrackingService from '../services/usageTrackingService';

// في useEffect:
useEffect(() => {
  const trackView = async () => {
    try {
      await usageTrackingService.trackContentView(book);
    } catch (error) {
      console.error('Error tracking book view:', error);
    }
  };
  trackView();
}, [book]);
```

#### في VideoPlayerScreen.js:
```javascript
import usageTrackingService from '../services/usageTrackingService';

// في useEffect:
useEffect(() => {
  const trackView = async () => {
    try {
      await usageTrackingService.trackContentView(content);
    } catch (error) {
      console.error('Error tracking video view:', error);
    }
  };
  trackView();
}, [content]);
```

#### في AudioPlayerScreen.js:
```javascript
import usageTrackingService from '../services/usageTrackingService';

// في useEffect:
useEffect(() => {
  const trackView = async () => {
    try {
      await usageTrackingService.trackContentView(content);
    } catch (error) {
      console.error('Error tracking audio view:', error);
    }
  };
  trackView();
}, [content]);
```

### د) تهيئة الخدمة في DataContext.js:
```javascript
import usageTrackingService from '../services/usageTrackingService';

// في useEffect للتهيئة:
useEffect(() => {
  if (realm && !usageTrackingService.realm) {
    usageTrackingService.initWithRealm(realm);
  }
}, [realm]);
```

## 3. كيفية عمل النظام:

1. **تتبع المشاهدات**: عند فتح أي محتوى (كتاب/فيديو/صوت)، يتم تسجيل المشاهدة
2. **حفظ البيانات**: البيانات تُحفظ في جدول ContentUsage في Realm  
3. **عرض الإحصائيات**: صفحة المحتوى الأكثر اطلاعاً تعرض:
   - المحتوى الأكثر مشاهدة مرتب حسب عدد المشاهدات
   - المحتوى المشاهد مؤخراً مرتب حسب التاريخ
   - إحصائيات شاملة (إجمالي المشاهدات، أنواع المحتوى، إلخ)

## 4. الميزات:

- تتبع دقيق للمشاهدات مع عدد المرات ووقت المشاهدة
- تصنيف حسب نوع المحتوى (كتب/فيديو/صوت)  
- واجهة عربية مصممة بنفس طراز التطبيق
- إحصائيات تفاعلية ومفصلة
- تنظيف تلقائي للبيانات القديمة (أكثر من شهرين)

هذا النظام سيراقب بفعالية المحتوى الأكثر استخداماً في التطبيق ويعرضه للمستخدمين. 