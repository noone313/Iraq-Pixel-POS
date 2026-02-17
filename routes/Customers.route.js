import { Router } from "express";
import { 
    getCustomers, 
    createCustomer, 
    getCustomerCreatePage, 
    updateCustomer ,
    deleteCustomer,
    payCustomerDebt
} from "../controllers/Customers.controler.js";

export const CustomerRoute = Router();

// --- مسار عرض جدول العملاء ---
CustomerRoute.get('/customers', getCustomers);

// --- مسار عرض صفحة (الإضافة / التعديل) الموحدة ---
// إذا تم استدعاء /create ستفتح صفحة فارغة للإضافة
CustomerRoute.get('/customers/create', getCustomerCreatePage);

// إذا تم استدعاء /edit/:id ستفتح نفس الصفحة ببيانات العميل للتعديل
CustomerRoute.get('/customers/edit/:id', getCustomerCreatePage);


// --- مسارات المعالجة (POST) ---
// حفظ عميل جديد
CustomerRoute.post('/customers/create', createCustomer);

// تحديث بيانات عميل موجود
CustomerRoute.post('/customers/update/:id', updateCustomer);


// --- مسار الحذف (POST) ---
CustomerRoute.post('/customers/delete/:id', deleteCustomer);


// --- مسار دفع الدين (POST) ---
CustomerRoute.post('/customers/pay-debt/:id', payCustomerDebt); 