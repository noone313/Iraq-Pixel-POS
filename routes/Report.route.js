// routes/report.routes.js
import { Router } from "express";
import { 
    getReportsMainPage, 
    getSalesReport, 
    getInventoryReport, 
    getDebtReport, 
    exportSalesReport,
    getInvoiceReport,
    getMonthlyFullReport,
    getFullFinancialReport
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
dashboardRouter.get('/reports/invoices', getInvoiceReport);  // تقرير الفواتير
dashboardRouter.get('/reports/monthly-sales', getMonthlyFullReport); // تقرير المبيعات الشهري
dashboardRouter.get('/reports/profit-loss', getFullFinancialReport); // تقرير المخزون الشهري
// ==================== تصدير التقارير ====================
dashboardRouter.get('/reports/sales/export', exportSalesReport);
export default dashboardRouter;