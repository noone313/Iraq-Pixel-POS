// routes/supplier.routes.js
import { Router } from "express";
import { 
    getSuppliers,
    createSupplier,
    deleteSupplier,
    updateSupplier,
    getSupplierById,
    searchSuppliers,
    getSuppliersWithDebt,
    paySupplierDebt,
    getSuppliersStats
} from "../controllers/Supplier.controler.js";
import { verifyToken } from "../midellwares/auth.middleware.js";

export const supplierRouter = Router();

// =============================================
// جميع المسارات تتطلب مصادقة
// =============================================
supplierRouter.use(verifyToken);

// =============================================
// صفحات وعمليات الموردين
// =============================================

// عرض صفحة إدارة الموردين
supplierRouter.get('/suppliers', getSuppliers);

// إضافة مورد جديد (POST)
supplierRouter.post('/suppliers', createSupplier);

// البحث عن موردين (معروض كصفحة منفصلة أو كـ HTML)
supplierRouter.get('/suppliers/search', searchSuppliers);

// عرض الموردين الذين عليهم ديون
supplierRouter.get('/suppliers/debt', getSuppliersWithDebt);

// عرض إحصائيات الموردين
supplierRouter.get('/suppliers/stats', getSuppliersStats);

// عرض بيانات مورد محدد
supplierRouter.get('/suppliers/:id', getSupplierById);

// تحديث بيانات مورد
supplierRouter.post('/suppliers/:id/update', updateSupplier);

// حذف مورد
supplierRouter.post('/suppliers/:id/delete', deleteSupplier);

// تسديد دين مورد
supplierRouter.post('/suppliers/:id/pay', paySupplierDebt);

export default supplierRouter;