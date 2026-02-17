import { Router } from "express";
import { verifyToken } from "../midellwares/auth.middleware.js";
import { 
    getDashboard, 
    getDashboardData,
    exportDashboardPDF 
} from "../controllers/Report.controler.js";

export const dashboardRouter = Router();

// جميع مسارات لوحة التحكم تتطلب مصادقة
dashboardRouter.use(verifyToken);

// ==================== الصفحات ====================
dashboardRouter.get('/dashboard', getDashboard);

// ==================== API ====================
dashboardRouter.get('/api/dashboard/data', getDashboardData);

// ==================== التصدير ====================
dashboardRouter.get('/dashboard/export/pdf', exportDashboardPDF);