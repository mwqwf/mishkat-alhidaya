/**
 * فهرس النماذج - Models Index
 * يجمع جميع النماذج ويصدرها بطريقة منظمة
 */

import BaseModel from './BaseModel';
import Category from './Category';
import Book from './Book';
import Subcategory from './Subcategory';
import Lesson from './Lesson';
import ContentStats from './ContentStats';

// تجميع جميع النماذج
export const Models = {
  BaseModel,
  Category,
  Book,
  Subcategory,
  Lesson,
  ContentStats,
};

// تجميع جميع الـ schemas
export const Schemas = [
  Category.schema,
  Book.schema,
  Subcategory.schema,
  Lesson.schema,
  ContentStats.schema,
];

// تجميع أسماء النماذج
export const ModelNames = {
  CATEGORY: 'Category',
  BOOK: 'Book',
  SUBCATEGORY: 'Subcategory',
  LESSON: 'Lesson',
  CONTENT_STATS: 'ContentStats',
};

// تصدير النماذج الفردية
export {
  BaseModel,
  Category,
  Book,
  Subcategory,
  Lesson,
  ContentStats,
};

// دالة مساعدة للحصول على نموذج بالاسم
export const getModelByName = (name) => {
  const modelMap = {
    [ModelNames.CATEGORY]: Category,
    [ModelNames.BOOK]: Book,
    [ModelNames.SUBCATEGORY]: Subcategory,
    [ModelNames.LESSON]: Lesson,
    [ModelNames.CONTENT_STATS]: ContentStats,
  };
  
  return modelMap[name] || null;
};

// دالة مساعدة للتحقق من صحة البيانات لأي نموذج
export const validateModelData = (modelName, data) => {
  const Model = getModelByName(modelName);
  if (!Model || !Model.validate) {
    throw new Error(`نموذج غير معروف أو لا يحتوي على دالة التحقق: ${modelName}`);
  }
  
  return Model.validate(data);
};

// دالة مساعدة لتنظيف البيانات لأي نموذج
export const sanitizeModelData = (modelName, data) => {
  const Model = getModelByName(modelName);
  if (!Model || !Model.sanitizeData) {
    throw new Error(`نموذج غير معروف أو لا يحتوي على دالة التنظيف: ${modelName}`);
  }
  
  return Model.sanitizeData(data);
};

export default Models; 