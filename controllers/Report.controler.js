import { Op, fn, col, literal } from "sequelize";
import { 
    Sale, 
    SaleItem, 
    Purchase,
    Product, 
    Category,
    Customer, 
    Supplier,
    Debt, 
    CashMovement,
    StockMovement,
    User,
    sequelize 
} from "../models/models.js";

// =============================================
// عرض صفحة لوحة التحكم الرئيسية
// =============================================
export const getDashboard = async (req, res, next) => {
    try {
        // تواريخ اليوم
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // تواريخ الأسبوع
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // الأحد
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // تواريخ الشهر
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

        // ==================== 1. إحصائيات سريعة ====================
        
        // مبيعات اليوم
        const todayStats = await Sale.findOne({
            where: {
                createdAt: { [Op.between]: [today, tomorrow] }
            },
            attributes: [
                [fn('COUNT', col('id')), 'invoiceCount'],
                [fn('SUM', col('total')), 'totalSales'],
                [fn('SUM', literal(`CASE WHEN type = 'CASH' THEN total ELSE 0 END`)), 'cashSales'],
                [fn('SUM', literal(`CASE WHEN type = 'DEBT' THEN total ELSE 0 END`)), 'debtSales']
            ],
            raw: true
        });

        // مبيعات الشهر
        const monthStats = await Sale.findOne({
            where: {
                createdAt: { [Op.between]: [startOfMonth, endOfMonth] }
            },
            attributes: [
                [fn('SUM', col('total')), 'totalSales']
            ],
            raw: true
        });

        // إحصائيات المخزون
        const inventoryStats = await Product.findAll({
            attributes: [
                [fn('COUNT', col('id')), 'totalProducts'],
                [fn('SUM', col('currentStock')), 'totalStock'],
                [fn('SUM', literal('currentStock * purchasePrice')), 'totalValue'],
                [fn('COUNT', literal(`CASE WHEN currentStock <= minStockLevel THEN 1 END`)), 'lowStockCount'],
                [fn('COUNT', literal(`CASE WHEN currentStock = 0 THEN 1 END`)), 'outOfStockCount']
            ],
            raw: true
        });

        // إحصائيات الديون
        const customerDebts = await Customer.sum('currentDebt') || 0;
        const supplierDebts = await Supplier.sum('currentDebt') || 0;
        
        const debtorsCount = await Customer.count({
            where: { currentDebt: { [Op.gt]: 0 } }
        });

        const suppliersWithDebt = await Supplier.count({
            where: { currentDebt: { [Op.gt]: 0 } }
        });

        // إحصائيات النقدية (آخر 30 يوم)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const cashStats = await CashMovement.findOne({
            where: {
                createdAt: { [Op.gte]: thirtyDaysAgo }
            },
            attributes: [
                [fn('SUM', literal(`CASE WHEN type = 'IN' THEN amount ELSE 0 END`)), 'totalIn'],
                [fn('SUM', literal(`CASE WHEN type = 'OUT' THEN amount ELSE 0 END`)), 'totalOut']
            ],
            raw: true
        });

        // ==================== 2. مبيعات الأسبوع (للرسم البياني) ====================
        const weeklySales = [];
        const weeklyLabels = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        for (let i = 0; i < 7; i++) {
            const dayStart = new Date(startOfWeek);
            dayStart.setDate(startOfWeek.getDate() + i);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const daySales = await Sale.findOne({
                where: {
                    createdAt: { [Op.between]: [dayStart, dayEnd] }
                },
                attributes: [
                    [fn('SUM', col('total')), 'total']
                ],
                raw: true
            });

            weeklySales.push(parseFloat(daySales?.total || 0));
        }

        // ==================== 3. مبيعات الشهر (للرسم البياني) ====================
        const monthlySales = await Sale.findAll({
            attributes: [
                [fn('DATE', col('createdAt')), 'date'],
                [fn('SUM', col('total')), 'total']
            ],
            where: {
                createdAt: { [Op.between]: [startOfMonth, endOfMonth] }
            },
            group: [fn('DATE', col('createdAt'))],
            order: [[fn('DATE', col('createdAt')), 'ASC']],
            limit: 30,
            raw: true
        });

        // ==================== 4. توزيع المبيعات (نقدي/آجل) ====================
        const salesDistribution = await Sale.findOne({
            where: {
                createdAt: { [Op.gte]: startOfMonth }
            },
            attributes: [
                [fn('SUM', literal(`CASE WHEN type = 'CASH' THEN total ELSE 0 END`)), 'cash'],
                [fn('SUM', literal(`CASE WHEN type = 'DEBT' THEN total ELSE 0 END`)), 'debt']
            ],
            raw: true
        });

        // ==================== 5. أفضل المنتجات مبيعاً ====================
        const topProducts = await SaleItem.findAll({
            attributes: [
                [col('Product.name'), 'name'],
                [col('Product.barcode'), 'barcode'],
                [fn('SUM', col('quantity')), 'totalQuantity'],
                [fn('SUM', col('total')), 'totalRevenue']
            ],
            include: [
                { 
                    model: Product,
                    attributes: [],
                    include: [
                        { model: Category, attributes: ['name'] }
                    ]
                }
            ],
            where: {
                createdAt: { [Op.gte]: startOfMonth }
            },
            group: ['Product.id'],
            order: [[fn('SUM', col('quantity')), 'DESC']],
            limit: 10,
            raw: true
        });

        // ==================== 6. آخر المبيعات ====================
        const recentSales = await Sale.findAll({
            include: [
                { model: Customer, attributes: ['name'] },
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: 10
        });

        // تنسيق آخر المبيعات
        const formattedRecentSales = recentSales.map(sale => ({
            id: sale.id,
            invoiceNumber: sale.invoiceNumber,
            total: sale.total,
            type: sale.type,
            customer: sale.Customer?.name || 'زبون نقدي',
            cashier: sale.User?.fullName || 'غير معروف',
            time: formatTime(sale.createdAt)
        }));

        // ==================== 7. المنتجات منخفضة المخزون ====================
        const lowStockProducts = await Product.findAll({
            where: {
                currentStock: { [Op.lte]: col('minStockLevel') }
            },
            include: [
                { model: Category, attributes: ['name'] }
            ],
            order: [['currentStock', 'ASC']],
            limit: 8
        });

        // ==================== 8. آخر حركات النقدية ====================
        const recentCashMovements = await CashMovement.findAll({
            include: [
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: 5
        });

        // ==================== 9. آخر الديون المسددة ====================
        const recentDebtPayments = await CashMovement.findAll({
            where: {
                category: 'DEBT_PAYMENT'
            },
            include: [
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: 5
        });

        // ==================== 10. إحصائيات الكاشيرات ====================
        const cashiersStats = await Sale.findAll({
            attributes: [
                [col('User.fullName'), 'cashierName'],
                [fn('COUNT', col('Sale.id')), 'invoiceCount'],
                [fn('SUM', col('total')), 'totalSales']
            ],
            include: [
                { model: User, attributes: [] }
            ],
            where: {
                createdAt: { [Op.gte]: startOfMonth }
            },
            group: ['User.id'],
            order: [[fn('SUM', col('total')), 'DESC']],
            limit: 5,
            raw: true
        });

        // ==================== تجهيز البيانات للعرض ====================
        const dashboardData = {
            // إحصائيات سريعة
            quickStats: {
                todaySales: parseFloat(todayStats?.totalSales || 0),
                todayInvoices: parseInt(todayStats?.invoiceCount || 0),
                todayCash: parseFloat(todayStats?.cashSales || 0),
                todayDebt: parseFloat(todayStats?.debtSales || 0),
                
                monthSales: parseFloat(monthStats?.totalSales || 0),
                
                totalProducts: parseInt(inventoryStats[0]?.totalProducts || 0),
                totalStock: parseFloat(inventoryStats[0]?.totalStock || 0),
                inventoryValue: parseFloat(inventoryStats[0]?.totalValue || 0),
                lowStockCount: parseInt(inventoryStats[0]?.lowStockCount || 0),
                outOfStockCount: parseInt(inventoryStats[0]?.outOfStockCount || 0),
                
                customerDebts: customerDebts,
                supplierDebts: supplierDebts,
                totalDebts: customerDebts + supplierDebts,
                debtorsCount: debtorsCount,
                suppliersWithDebt: suppliersWithDebt,
                
                cashIn: parseFloat(cashStats?.totalIn || 0),
                cashOut: parseFloat(cashStats?.totalOut || 0),
                cashNet: parseFloat((cashStats?.totalIn || 0) - (cashStats?.totalOut || 0))
            },
            
            // بيانات الرسوم البيانية
            charts: {
                weeklyLabels: weeklyLabels,
                weeklySales: weeklySales,
                monthlyLabels: monthlySales.map(m => m.date),
                monthlySales: monthlySales.map(m => parseFloat(m.total || 0)),
                distribution: {
                    cash: parseFloat(salesDistribution?.cash || 0),
                    debt: parseFloat(salesDistribution?.debt || 0)
                }
            },
            
            // القوائم
            topProducts: topProducts.map(p => ({
                name: p.name,
                barcode: p.barcode,
                quantity: parseInt(p.totalQuantity || 0),
                revenue: parseFloat(p.totalRevenue || 0)
            })),
            
            recentSales: formattedRecentSales,
            
            lowStockProducts: lowStockProducts.map(p => ({
                id: p.id,
                name: p.name,
                barcode: p.barcode,
                stock: p.currentStock,
                minStock: p.minStockLevel,
                category: p.Category?.name || 'غير مصنف',
                percentage: Math.min(100, (p.currentStock / p.minStockLevel) * 100)
            })),
            
            recentCashMovements: recentCashMovements.map(m => ({
                id: m.id,
                type: m.type,
                amount: m.amount,
                category: m.category,
                user: m.User?.fullName || 'غير معروف',
                time: formatTime(m.createdAt)
            })),
            
            recentDebtPayments: recentDebtPayments.map(p => ({
                id: p.id,
                amount: p.amount,
                user: p.User?.fullName || 'غير معروف',
                time: formatTime(p.createdAt)
            })),
            
            cashiersStats: cashiersStats.map(c => ({
                name: c.cashierName || 'غير معروف',
                invoices: c.invoiceCount,
                sales: parseFloat(c.totalSales || 0)
            })),
            
            // معلومات إضافية
            currentDate: new Date().toLocaleDateString('ar-IQ', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            currentTime: new Date().toLocaleTimeString('ar-IQ'),
            lastUpdate: new Date().toISOString()
        };

        // عرض صفحة EJS مع البيانات
        res.render('reports', {
            title: 'لوحة التحكم - Pixel POS',
            data: dashboardData,
            user: req.user,
            layout: 'layouts/main',
            currentPage: 'dashboard'
        });

    } catch (error) {
        console.error("❌ خطأ في لوحة التحكم:", error);
        const err = new Error("حدث خطأ أثناء تحميل لوحة التحكم: " + error.message);
        err.status = 500;
        return next(err);
    }
};

// =============================================
// API للحصول على بيانات محدثة (للتحديث اللحظي)
// =============================================
export const getDashboardData = async (req, res, next) => {
    try {
        const { range = 'week' } = req.query;
        
        // نفس الكود أعلاه مع إمكانية التصفية حسب range
        // يمكنك نسخ نفس الاستعلامات من getDashboard
        
        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        next(error);
    }
};

// =============================================
// تصدير لوحة التحكم كـ PDF
// =============================================
export const exportDashboardPDF = async (req, res, next) => {
    try {
        // سيتم تنفيذها لاحقاً
        res.status(501).json({ message: 'قيد التطوير' });
    } catch (error) {
        next(error);
    }
};

// =============================================
// دوال مساعدة
// =============================================
function formatTime(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `منذ ${minutes} دقيقة`;
    }
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `منذ ${hours} ساعة`;
    }
    return d.toLocaleDateString('ar-IQ');
}