# Android Build Fixes

## مشكلة فشل البناء - SDK Version

### المشكلة:
```
Could not create task ':react-native-share-menu:compileDebugJavaWithJavac'.
In order to compile Java 9+ source, please set compileSdkVersion to 30 or above
```

### السبب:
مكتبة `react-native-share-menu` تستخدم إعدادات SDK قديمة:
- `compileSdkVersion 29` (يجب أن تكون 30 أو أعلى)
- `buildToolsVersion "29.0.2"` (قديمة)
- `targetSdkVersion 29` (قديمة)

### الحلول المطبقة:

#### 1. تحديث إعدادات المشروع العامة:
- **ملف**: `android/gradle.properties`
- **التغييرات**: إضافة إعدادات إجبارية لجميع المكتبات
```properties
android.compileSdkVersion=34
android.targetSdkVersion=34
android.buildToolsVersion=34.0.0
android.minSdkVersion=24
```

#### 2. تحديث إعدادات البناء الرئيسية:
- **ملف**: `android/build.gradle`
- **التغييرات**: إضافة قسم `subprojects` لإجبار جميع المكتبات على استخدام نفس الإعدادات

#### 3. تصحيح مباشر للمكتبة:
- **ملف**: `node_modules/react-native-share-menu/android/build.gradle`
- **التغييرات**: تحديث جميع إعدادات SDK إلى الإصدارات الحديثة

#### 4. Script تلقائي للتصحيح:
- **ملف**: `scripts/postinstall.js`
- **الغرض**: تطبيق التصحيحات تلقائياً بعد تثبيت المكتبات
- **التفعيل**: إضافة `"postinstall": "node scripts/postinstall.js"` في `package.json`

### كيفية التطبيق في المستقبل:

1. **عند تثبيت مكتبات جديدة**:
   ```bash
   npm install
   # سيتم تشغيل postinstall script تلقائياً
   ```

2. **عند مواجهة مشاكل مشابهة**:
   - تحقق من إعدادات SDK في ملف `build.gradle` الخاص بالمكتبة
   - أضف المكتبة إلى `scripts/postinstall.js`

### ملاحظات مهمة:
- هذه التصحيحات ضرورية لضمان توافق المكتبات مع إعدادات Android الحديثة
- يجب تشغيل `postinstall` script بعد أي تحديث للمكتبات
- في حالة عدم نجاح الحلول التلقائية، يمكن تطبيق التصحيحات يدوياً

### الحالة الحالية:
✅ تم تصحيح مكتبة `react-native-share-menu`
✅ تم إضافة script تلقائي للتصحيح
✅ تم تحديث إعدادات المشروع العامة 