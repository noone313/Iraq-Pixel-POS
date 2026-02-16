import { Router } from "express";
import { CreateCategory, DeleteCategory, ListCategories, UpdateCategory } from "../controllers/Category.controler.js";
const CategoryRoute = Router();

// 1. عرض جميع الأصناف
CategoryRoute.get('/categories', ListCategories);

// 2. إنشاء صنف جديد
CategoryRoute.post('/categories', CreateCategory);

// 3. تحديث صنف (تعديل الاسم)
CategoryRoute.put('/categories/:id', UpdateCategory);

// 4. حذف صنف
CategoryRoute.delete('/categories/:id', DeleteCategory);

export { CategoryRoute };