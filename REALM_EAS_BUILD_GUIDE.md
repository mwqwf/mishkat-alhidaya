# دليل استخدام Realm Database مع EAS Build

## نظرة عامة
تم إعداد تطبيق مكتبة الهدى للعمل مع Realm Database باستخدام EAS Build لحل مشكلة التوافق مع Expo.

## المتطلبات
- EAS CLI مثبت: `npm install -g eas-cli`
- حساب Expo مع EAS Build
- Project ID: `4c0bf556-dc47-4c01-ab07-14fa998f4aae`

## الإعداد المطلوب

### 1. ملفات Realm
- `database/realmConfig.js` - إعداد قاعدة البيانات والنماذج
- `services/dataService.js` - خدمة البيانات مع Realm
- `context/DataContext.js` - Context للبيانات
- `App.js` - RealmProvider الرئيسي

### 2. إعدادات EAS Build
```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 3. إعدادات التطبيق
```json
// app.json
{
  "plugins": [
    [
      "expo-build-properties",
      {
        "android": {
          "compileSdkVersion": 34,
          "targetSdkVersion": 34,
          "minSdkVersion": 24,
          "proguardMinifyEnabled": false,
          "packagingOptions": {
            "pickFirst": [
              "**/libc++_shared.so",
              "**/libjsc.so"
            ]
          }
        }
      }
    ]
  ]
}
```

## أوامر البناء

### تطوير (Development Build)
```bash
eas build -p android --profile development
```

### معاينة (Preview Build)
```bash
eas build -p android --profile preview
```

### إنتاج (Production Build)
```bash
eas build -p android --profile production
```

## ميزات Realm في التطبيق

### 1. نماذج البيانات
- **Book**: الكتب والمحتوى
- **Category**: الأقسام والفئات
- **AppStats**: الإحصائيات
- **SyncStatus**: حالة المزامنة

### 2. الوظائف المتاحة
- تخزين محلي سريع
- مزامنة مع Firebase
- بحث متقدم
- إدارة الأقسام
- حساب الإحصائيات

### 3. إدارة المزامنة
- مزامنة تلقائية كل 6 ساعات للكتب
- مزامنة تلقائية كل 12 ساعة للأقسام
- مزامنة إجبارية عند الحاجة

## استكشاف الأخطاء

### خطأ Binary Missing
إذا ظهر خطأ "Could not find the Realm binary"، تأكد من:
1. استخدام EAS Build وليس Expo Go
2. إعدادات `expo-build-properties` صحيحة
3. `packagingOptions` محددة في app.json

### خطأ Schema Migration
إذا حدث خطأ في Schema:
1. زيادة `schemaVersion` في realmConfig.js
2. إضافة migration logic إذا لزم الأمر
3. إعادة بناء التطبيق

### مشاكل الأداء
- استخدام Realm queries بدلاً من JavaScript filtering
- تحسين indices للبحث
- استخدام lazy loading للبيانات الكبيرة

## الاختبار

### اختبار محلي
```bash
npx expo start --dev-client
```

### اختبار على الجهاز
1. بناء development build
2. تثبيت APK على الجهاز
3. اختبار جميع الوظائف

## النشر

### خطوات النشر
1. تحديث version في app.json
2. بناء production build
3. اختبار شامل
4. رفع إلى متجر التطبيقات

## ملاحظات مهمة

1. **لا تستخدم Expo Go**: Realm يحتاج EAS Build
2. **النسخ الاحتياطي**: احتفظ بنسخة من قاعدة البيانات
3. **الأمان**: تأكد من تشفير البيانات الحساسة
4. **الأداء**: راقب استخدام الذاكرة مع Realm

## الدعم
للمساعدة في المشاكل:
1. راجع Realm Documentation
2. تحقق من EAS Build logs
3. استخدم Realm Studio للتصحيح 