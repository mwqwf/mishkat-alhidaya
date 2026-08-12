/**
 * سكريبت المايجريشن - Database Migration Script
 * يقوم بتشغيل المايجريشن من النظام القديم إلى النظام الجديد
 */

import { MigrationService } from '../database/services/MigrationService';
import { getDatabaseStats, cleanup } from '../database';

// إعدادات المايجريشن
const MIGRATION_CONFIG = {
  // تشغيل المايجريشن في وضع الاختبار
  testMode: true,
  
  // إنشاء نسخة احتياطية قبل المايجريشن
  createBackup: true,
  
  // تشغيل التحقق من البيانات بعد المايجريشن
  validateAfterMigration: true,
  
  // إظهار تقدم المايجريشن
  showProgress: true,
};

/**
 * دالة رئيسية لتشغيل المايجريشن
 */
async function runMigration() {
  console.log('🚀 بدء عملية المايجريشن...');
  console.log('⚙️ إعدادات المايجريشن:', MIGRATION_CONFIG);
  
  const migrationService = new MigrationService();
  
  try {
    // عرض إحصائيات قاعدة البيانات القديمة
    console.log('\n📊 إحصائيات قاعدة البيانات القديمة:');
    await showOldDatabaseStats();
    
    // تشغيل المايجريشن
    console.log('\n🔄 تشغيل المايجريشن...');
    
    if (MIGRATION_CONFIG.showProgress) {
      // مراقبة التقدم
      const progressInterval = setInterval(() => {
        const status = migrationService.getMigrationStatus();
        if (status.isRunning) {
          console.log(`⏳ التقدم: ${status.progress}%`);
        }
      }, 2000);
      
      // تشغيل المايجريشن
      const result = await migrationService.runFullMigration();
      
      clearInterval(progressInterval);
      
      // عرض النتائج
      console.log('\n✅ تم إكمال المايجريشن بنجاح!');
      console.log('📈 نتائج المايجريشن:');
      console.log(`  - الأقسام: ${result.migratedCounts.categories}`);
      console.log(`  - الكتب: ${result.migratedCounts.books}`);
      console.log(`  - الأقسام الفرعية: ${result.migratedCounts.subcategories}`);
      console.log(`  - الدروس: ${result.migratedCounts.lessons}`);
      console.log(`  - الإحصائيات: ${result.migratedCounts.contentStats}`);
      console.log(`  - بيانات الاستخدام: ${result.migratedCounts.contentUsage}`);
      
      if (result.errors.length > 0) {
        console.log('\n⚠️ أخطاء المايجريشن:');
        result.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }
      
    } else {
      // تشغيل بدون مراقبة التقدم
      const result = await migrationService.runFullMigration();
      console.log('✅ تم إكمال المايجريشن:', result);
    }
    
    // التحقق من البيانات بعد المايجريشن
    if (MIGRATION_CONFIG.validateAfterMigration) {
      console.log('\n🔍 التحقق من البيانات بعد المايجريشن...');
      await validateMigratedData();
    }
    
    // عرض إحصائيات قاعدة البيانات الجديدة
    console.log('\n📊 إحصائيات قاعدة البيانات الجديدة:');
    await showNewDatabaseStats();
    
  } catch (error) {
    console.error('❌ فشل المايجريشن:', error);
    
    // عرض تفاصيل الخطأ
    const status = migrationService.getMigrationStatus();
    console.log('📊 حالة المايجريشن عند الفشل:');
    console.log(`  - التقدم: ${status.progress}%`);
    console.log(`  - الأخطاء: ${status.errors.length}`);
    
    if (status.errors.length > 0) {
      console.log('🔍 تفاصيل الأخطاء:');
      status.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    process.exit(1);
  } finally {
    // تنظيف الموارد
    await cleanup();
  }
}

/**
 * عرض إحصائيات قاعدة البيانات القديمة
 */
async function showOldDatabaseStats() {
  try {
    const { getRealm: getOldRealm } = await import('../database/realmConfig');
    const oldRealm = await getOldRealm();
    
    const stats = {
      books: oldRealm.objects('Book').length,
      categories: oldRealm.objects('Category').length,
      contentUsage: oldRealm.objects('ContentUsage').length,
      appStats: oldRealm.objects('AppStats').length,
      syncStatus: oldRealm.objects('SyncStatus').length,
    };
    
    console.log('  📚 الكتب:', stats.books);
    console.log('  📂 الأقسام:', stats.categories);
    console.log('  📊 بيانات الاستخدام:', stats.contentUsage);
    console.log('  📈 إحصائيات التطبيق:', stats.appStats);
    console.log('  🔄 حالة المزامنة:', stats.syncStatus);
    
  } catch (error) {
    console.warn('⚠️ لا يمكن جلب إحصائيات قاعدة البيانات القديمة:', error.message);
  }
}

/**
 * عرض إحصائيات قاعدة البيانات الجديدة
 */
async function showNewDatabaseStats() {
  try {
    const stats = await getDatabaseStats();
    
    if (stats) {
      console.log('  📚 الكتب:', stats.totalBooks || 0);
      console.log('  📂 الأقسام:', stats.totalCategories || 0);
      console.log('  📊 الإحصائيات:', stats.totalStats || 0);
      console.log('  💾 حجم قاعدة البيانات:', stats.databaseSize || 'غير متاح');
      console.log('  🕐 آخر تحديث:', stats.lastUpdate || 'غير متاح');
    } else {
      console.log('  ⚠️ لا يمكن جلب إحصائيات قاعدة البيانات الجديدة');
    }
    
  } catch (error) {
    console.warn('⚠️ خطأ في جلب إحصائيات قاعدة البيانات الجديدة:', error.message);
  }
}

/**
 * التحقق من صحة البيانات المهاجرة
 */
async function validateMigratedData() {
  try {
    const { safeRead } = await import('../database');
    
    const validation = await safeRead((realm) => {
      const categories = realm.objects('Category');
      const books = realm.objects('Book');
      const subcategories = realm.objects('Subcategory');
      const lessons = realm.objects('Lesson');
      const contentStats = realm.objects('ContentStats');
      
      // التحقق من العلاقات
      let orphanedBooks = 0;
      let orphanedSubcategories = 0;
      let orphanedLessons = 0;
      
      // التحقق من الكتب المفقودة الأقسام
      books.forEach(book => {
        if (book.categoryId) {
          const category = realm.objects('Category').filtered('_id == $0', book.categoryId)[0];
          if (!category) {
            orphanedBooks++;
          }
        }
      });
      
      // التحقق من الأقسام الفرعية المفقودة الأقسام الرئيسية
      subcategories.forEach(subcategory => {
        const parentCategory = realm.objects('Category').filtered('_id == $0', subcategory.parentCategoryId)[0];
        if (!parentCategory) {
          orphanedSubcategories++;
        }
      });
      
      // التحقق من الدروس المفقودة الأقسام
      lessons.forEach(lesson => {
        if (lesson.subcategoryId) {
          const subcategory = realm.objects('Subcategory').filtered('_id == $0', lesson.subcategoryId)[0];
          if (!subcategory) {
            orphanedLessons++;
          }
        }
      });
      
      return {
        totalCategories: categories.length,
        totalBooks: books.length,
        totalSubcategories: subcategories.length,
        totalLessons: lessons.length,
        totalContentStats: contentStats.length,
        orphanedBooks,
        orphanedSubcategories,
        orphanedLessons,
        isValid: orphanedBooks === 0 && orphanedSubcategories === 0 && orphanedLessons === 0,
      };
    });
    
    console.log('  📊 نتائج التحقق:');
    console.log(`    - الأقسام: ${validation.totalCategories}`);
    console.log(`    - الكتب: ${validation.totalBooks}`);
    console.log(`    - الأقسام الفرعية: ${validation.totalSubcategories}`);
    console.log(`    - الدروس: ${validation.totalLessons}`);
    console.log(`    - الإحصائيات: ${validation.totalContentStats}`);
    
    if (validation.isValid) {
      console.log('  ✅ جميع البيانات صحيحة');
    } else {
      console.log('  ⚠️ تم العثور على مشاكل في البيانات:');
      if (validation.orphanedBooks > 0) {
        console.log(`    - كتب مفقودة الأقسام: ${validation.orphanedBooks}`);
      }
      if (validation.orphanedSubcategories > 0) {
        console.log(`    - أقسام فرعية مفقودة الأقسام الرئيسية: ${validation.orphanedSubcategories}`);
      }
      if (validation.orphanedLessons > 0) {
        console.log(`    - دروس مفقودة الأقسام: ${validation.orphanedLessons}`);
      }
    }
    
  } catch (error) {
    console.warn('⚠️ خطأ في التحقق من البيانات:', error.message);
  }
}

/**
 * دالة اختبار المايجريشن
 */
async function testMigration() {
  console.log('🧪 تشغيل اختبار المايجريشن...');
  
  // تغيير إعدادات الاختبار
  MIGRATION_CONFIG.testMode = true;
  MIGRATION_CONFIG.showProgress = false;
  
  try {
    await runMigration();
    console.log('✅ نجح اختبار المايجريشن');
    return true;
  } catch (error) {
    console.error('❌ فشل اختبار المايجريشن:', error);
    return false;
  }
}

/**
 * دالة رئيسية
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'test':
      await testMigration();
      break;
    case 'run':
      await runMigration();
      break;
    case 'stats':
      console.log('📊 إحصائيات قاعدة البيانات:');
      await showOldDatabaseStats();
      break;
    default:
      console.log('🔧 استخدام السكريبت:');
      console.log('  node scripts/migrate-database.js test   # اختبار المايجريشن');
      console.log('  node scripts/migrate-database.js run    # تشغيل المايجريشن');
      console.log('  node scripts/migrate-database.js stats  # عرض الإحصائيات');
      break;
  }
}

// تشغيل السكريبت
if (require.main === module) {
  main().catch(console.error);
}

export { runMigration, testMigration, showOldDatabaseStats, showNewDatabaseStats }; 