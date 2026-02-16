import { Router } from "express";
import { 
    getPurchases, 
    renderAddPurchase, 
    createPurchase, 
    deletePurchase 
} from "../controllers/Purchese.controler.js";

export const PurchaseRoute = Router();

// --- مسارات العرض (GET) ---

// 1. عرض جدول فواتير الشراء مع Pagination
// الرابط: /purchases أو /purchases?page=2
PurchaseRoute.get('/purchases', getPurchases);

// 2. عرض صفحة إضافة فاتورة شراء جديدة
// الرابط: /purchases/create
PurchaseRoute.get('/purchases/create', renderAddPurchase);


// --- مسارات المعالجة (POST) ---

// 3. استقبال بيانات الفاتورة وحفظها في قاعدة البيانات
// ملاحظة: بما أننا نستخدم JSON في الـ Fetch، تأكد من وجود express.json() في الـ app.js
PurchaseRoute.post('/purchases/create', createPurchase);

// 4. حذف الفاتورة وعكس كافة العمليات (المخزن، الديون، النقدية)
// الرابط: /purchases/delete/ID
PurchaseRoute.post('/purchases/delete/:id', deletePurchase);