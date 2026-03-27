// routes/report.routes.js
import { Router } from "express";
import { 
    getReportsMainPage, 
    getSalesReport, 
    getInventoryReport, 
    getDebtReport, 
    exportSalesReport
} from "../controllers/Report.controler.js";
import { verifyToken } from "../midellwares/auth.middleware.js";

const dashboardRouter = Router();

dashboardRouter.use(verifyToken);

// الصفحة الرئيسية للتقارير (البوابة)
dashboardRouter.get('/reports', getReportsMainPage);

// تقارير تفصيلية
dashboardRouter.get('/reports/sales', getSalesReport);       // تقرير المبيعات
dashboardRouter.get('/reports/inventory', getInventoryReport); // تقرير المخزون
dashboardRouter.get('/reports/debts', getDebtReport);         // تقرير الديون

// ==================== تصدير التقارير ====================
dashboardRouter.get('/reports/sales/export', exportSalesReport);
export default dashboardRouter;