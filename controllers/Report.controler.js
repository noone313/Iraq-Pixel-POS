import { Op, fn, col, literal } from "sequelize";
import PDFDocument from 'pdfkit';
import { 
    Sale, 
    SaleItem, 
    Product, 
    Category,
    Customer, 
    Supplier,
    Debt, 
    CashMovement,
    StockMovement,
    User,
    Purchase,
    sequelize
} from "../models/models.js";


// 1. الصفحة الرئيسية للتقارير (البوابة)
export const getReportsMainPage = async (req, res) => {
    res.render('reports', {
        title: 'مركز التقارير - Pixel POS',
        user: req.user 
    });
};



// =============================================
// تقرير المبيعات التفصيلي
// =============================================
export const getSalesReport = async (req, res, next) => {
    try {
        const { startDate, endDate, type, cashierId, shiftStart, shiftEnd } = req.query;
        
        // تحديد نطاق التاريخ (افتراضياً: آخر 1 يوم)
        const end = endDate ? new Date(endDate) : new Date();
        end.setHours(23, 59, 59, 999);
        
        const start = startDate ? new Date(startDate) : new Date();
        if (!startDate) {
            start.setDate(start.getDate() - 0);
        }
        start.setHours(0, 0, 0, 0);

        // ==================== فلتر الوردية (الساعات) ====================
        const defaultShiftStart = shiftStart || 6;
        const defaultShiftEnd = shiftEnd || 3;

        // بناء شرط الوقت للوردية
        const timeFilter = [];
        
        if (shiftStart || shiftEnd) {
            if (parseInt(defaultShiftEnd) < parseInt(defaultShiftStart)) {
                timeFilter.push({
                    [Op.or]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            } else {
                timeFilter.push({
                    [Op.and]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            }
        }

        // بناء شرط البحث الرئيسي
        const whereClause = {
            [Op.and]: [
                { createdAt: { [Op.between]: [start, end] } },
                ...(type && type !== 'all' ? [{ type }] : []),
                ...(cashierId && cashierId !== 'all' ? [{ userId: cashierId }] : []),
                ...timeFilter
            ]
        };

        // ==================== 1. إحصائيات المبيعات ====================
        const salesStats = await Sale.findOne({
            where: whereClause,
            attributes: [
                [fn('COUNT', col('Sale.id')), 'totalInvoices'],
                [fn('SUM', col('Sale.total')), 'totalSales'],
                [fn('SUM', col('Sale.paid')), 'totalPaid'],
                [fn('SUM', col('Sale.change')), 'totalChange'],
                [fn('AVG', col('Sale.total')), 'averageInvoice'],
                [fn('SUM', literal(`CASE WHEN "Sale"."type" = 'CASH' THEN "Sale"."total" ELSE 0 END`)), 'cashSales'],
                [fn('SUM', literal(`CASE WHEN "Sale"."type" = 'DEBT' THEN "Sale"."total" ELSE 0 END`)), 'debtSales'],
                [fn('COUNT', literal(`CASE WHEN "Sale"."type" = 'DEBT' THEN 1 END`)), 'debtInvoices']
            ],
            raw: true
        });

        // ==================== 2. المبيعات اليومية ====================
        const dailySales = await Sale.findAll({
            where: whereClause,
            attributes: [
                [fn('DATE', col('Sale.createdAt')), 'date'],
                [fn('COUNT', col('Sale.id')), 'invoiceCount'],
                [fn('SUM', col('Sale.total')), 'total']
            ],
            group: [fn('DATE', col('Sale.createdAt'))],
            order: [[fn('DATE', col('Sale.createdAt')), 'ASC']],
            raw: true
        });

       // 3. حساب تكلفة البضاعة المباعة (تعديل علامات الاقتباس)
const costStats = await SaleItem.findOne({
    include: [{
        model: Sale,
        where: dateFilter,
        attributes: []
    }],
    attributes: [
        // لاحظ استخدام "" حول أسماء الأعمدة
        [sequelize.literal('SUM("costAtSale" * "quantity")'), 'totalCost']
    ],
    raw: true
});

// 4. جلب أفضل 5 منتجات مبيعاً (تعديل علامات الاقتباس)
const topProducts = await SaleItem.findAll({
    include: [
        { model: Sale, where: dateFilter, attributes: [] },
        { model: Product, attributes: ['name'] }
    ],
    attributes: [
        'productId',
        [sequelize.literal('MAX("Product"."name")'), 'name'], 
        [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'qty'],
        // هنا أيضاً نستخدم علامات الاقتباس المزدوجة داخل الـ literal
        [sequelize.fn('SUM', sequelize.col('SaleItem.total')), 'revenue']
    ],
    group: ['productId', 'Product.id'],
    order: [[sequelize.literal('revenue'), 'DESC']],
    limit: 5,
    raw: true
});
        // ==================== 5. آخر المبيعات ====================
        const recentSales = await Sale.findAll({
            where: whereClause,
            include: [
                { model: Customer, attributes: ['name'] },
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        // ==================== 6. أفضل العملاء ====================
        const topCustomers = await Sale.findAll({
            where: whereClause,
            attributes: [
                [col('Customer.name'), 'customerName'],
                [fn('COUNT', col('Sale.id')), 'invoiceCount'],
                [fn('SUM', col('Sale.total')), 'totalSpent']
            ],
            include: [
                { model: Customer, attributes: [], required: false }
            ],
            group: ['Customer.id'],
            having: literal('SUM("Sale"."total") > 0'),
            order: [[fn('SUM', col('Sale.total')), 'DESC']],
            limit: 10,
            raw: true
        });

        // ==================== 7. إحصائيات الوردية (مصححة) ====================
        // بناء شرط خاص بالوردية باستخدام نفس نطاق التاريخ
        const shiftWhereClause = {
            [Op.and]: [
                { createdAt: { [Op.between]: [start, end] } }
            ]
        };

        // إضافة شرط الساعات
        if (shiftStart || shiftEnd) {
            if (parseInt(defaultShiftEnd) < parseInt(defaultShiftStart)) {
                shiftWhereClause[Op.and].push({
                    [Op.or]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            } else {
                shiftWhereClause[Op.and].push({
                    [Op.and]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            }
        }

        const shiftStats = await Sale.findOne({
            where: shiftWhereClause,
            attributes: [
                [fn('COUNT', col('Sale.id')), 'invoiceCount'],
                [fn('SUM', col('Sale.total')), 'totalSales']
            ],
            raw: true
        });

        // ==================== 8. قائمة الكاشيرات ====================
        const cashiers = await User.findAll({
            where: { role: ['CASHIER', 'ADMIN'] },
            attributes: ['id', 'fullName'],
            order: [['fullName', 'ASC']]
        });

        // ==================== تجهيز البيانات ====================
        const reportData = {
            stats: {
                totalInvoices: parseInt(salesStats?.totalInvoices || 0),
                totalSales: parseFloat(salesStats?.totalSales || 0),
                totalPaid: parseFloat(salesStats?.totalPaid || 0),
                totalChange: parseFloat(salesStats?.totalChange || 0),
                averageInvoice: parseFloat(salesStats?.averageInvoice || 0),
                cashSales: parseFloat(salesStats?.cashSales || 0),
                debtSales: parseFloat(salesStats?.debtSales || 0),
                debtInvoices: parseInt(salesStats?.debtInvoices || 0),
                cashInvoices: parseInt((salesStats?.totalInvoices || 0) - (salesStats?.debtInvoices || 0))
            },
            shiftStats: {
                invoices: parseInt(shiftStats?.invoiceCount || 0),
                total: parseFloat(shiftStats?.totalSales || 0),
                startHour: defaultShiftStart,
                endHour: defaultShiftEnd
            },
            dailySales: dailySales.map(d => ({
                date: d.date,
                invoices: parseInt(d.invoiceCount || 0),
                total: parseFloat(d.total || 0)
            })),
            hourlySales: hourlySales.map(h => ({
                hour: parseInt(h.hour || 0),
                count: parseInt(h.count || 0),
                total: parseFloat(h.total || 0)
            })),
            byCashier: salesByCashier.map(c => ({
                name: c.cashierName || 'غير محدد',
                invoices: parseInt(c.invoiceCount || 0),
                total: parseFloat(c.totalSales || 0),
                average: parseFloat(c.averageSale || 0)
            })),
            recentSales: recentSales.map(s => ({
                id: s.id,
                invoiceNumber: s.invoiceNumber,
                date: s.createdAt,
                total: s.total,
                type: s.type,
                customer: s.Customer?.name || 'زبون نقدي',
                cashier: s.User?.fullName || 'غير معروف'
            })),
            topCustomers: topCustomers.map(c => ({
                name: c.customerName || 'زائر',
                invoices: parseInt(c.invoiceCount || 0),
                total: parseFloat(c.totalSpent || 0)
            })),
            filters: {
                startDate: start.toISOString().split('T')[0],
                endDate: endDate || end.toISOString().split('T')[0],
                type: type || 'all',
                cashierId: cashierId || 'all',
                shiftStart: shiftStart || '6',
                shiftEnd: shiftEnd || '3'
            },
            cashiers,
            period: {
                from: start.toLocaleDateString('ar-IQ'),
                to: end.toLocaleDateString('ar-IQ')
            }
        };

        res.render('reports-sales', {
            title: 'تقرير المبيعات التفصيلي',
            data: reportData,
            user: req.user,
            layout: 'layouts/main',
            currentPage: 'reports-sales'
        });

    } catch (error) {
        console.error('❌ خطأ في تقرير المبيعات:', error);
        const err = new Error('حدث خطأ أثناء تحميل تقرير المبيعات: ' + error.message);
        err.status = 500;
        next(err);
    }
};





export const exportSalesReport = async (req, res, next) => {
    try {
        const { format = 'pdf', startDate, endDate, type, cashierId, shiftStart, shiftEnd } = req.query;
        
        // التحقق من وجود التواريخ
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'الرجاء تحديد تاريخ البداية والنهاية' 
            });
        }

        // تحديد نطاق التاريخ
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        // بناء شرط الوقت للوردية
        const defaultShiftStart = shiftStart || 6;
        const defaultShiftEnd = shiftEnd || 3;
        
        const timeFilter = [];
        
        if (shiftStart || shiftEnd) {
            if (parseInt(defaultShiftEnd) < parseInt(defaultShiftStart)) {
                timeFilter.push({
                    [Op.or]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            } else {
                timeFilter.push({
                    [Op.and]: [
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") >= ${defaultShiftStart}`),
                        literal(`EXTRACT(HOUR FROM "Sale"."createdAt") < ${defaultShiftEnd}`)
                    ]
                });
            }
        }

        // بناء شرط البحث
        const whereClause = {
            [Op.and]: [
                { createdAt: { [Op.between]: [start, end] } },
                ...(type && type !== 'all' ? [{ type }] : []),
                ...(cashierId && cashierId !== 'all' ? [{ userId: cashierId }] : []),
                ...timeFilter
            ]
        };

        // جلب بيانات المبيعات
        const sales = await Sale.findAll({
            where: whereClause,
            include: [
                { model: Customer, attributes: ['name'] },
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        // التحقق من وجود بيانات
        if (sales.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'لا توجد مبيعات في هذه الفترة' 
            });
        }

        // تنسيق البيانات للتصدير
        const formattedSales = sales.map(s => ({
            invoiceNumber: s.invoiceNumber,
            date: new Date(s.createdAt).toLocaleString('ar-IQ'),
            customer: s.Customer?.name || 'زبون نقدي',
            cashier: s.User?.fullName || 'غير معروف',
            type: s.type === 'CASH' ? 'نقدي' : 'آجل',
            total: parseFloat(s.total),
            paid: parseFloat(s.paid),
            change: parseFloat(s.change)
        }));

        // ==================== تصدير CSV ====================
        if (format === 'csv') {
            const headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'الكاشير', 'النوع', 'الإجمالي', 'المدفوع', 'الباقي'];
            const csvRows = [];
            
            // إضافة BOM لدعم العربية في Excel
            const BOM = '\uFEFF';
            
            // إضافة headers
            csvRows.push(headers.join(','));
            
            // إضافة البيانات
            formattedSales.forEach(s => {
                const row = [
                    s.invoiceNumber,
                    s.date,
                    `"${s.customer.replace(/"/g, '""')}"`, // Escape quotes
                    `"${s.cashier.replace(/"/g, '""')}"`,
                    s.type,
                    s.total,
                    s.paid,
                    s.change
                ];
                csvRows.push(row.join(','));
            });

            const csvContent = BOM + csvRows.join('\n');
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.csv`);
            res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
            
            return res.send(csvContent);
        }

        // ==================== تصدير PDF ====================
        else if (format === 'pdf') {
            try {
                const doc = new PDFDocument({ 
                    size: 'A4', 
                    margin: 50,
                    layout: 'landscape',
                    bufferPages: true
                });
                
                // تعيين اسم الملف
                const filename = `sales-report-${Date.now()}.pdf`;
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

                doc.pipe(res);

                // إضافة دعم اللغة العربية (إذا كان الخط متوفر)
                try {
                    doc.registerFont('Arabic', 'fonts/arial.ttf');
                    doc.font('Arabic');
                } catch (fontError) {
                    doc.font('Helvetica');
                }

                // عنوان التقرير
                doc.fontSize(20)
                   .text('تقرير المبيعات التفصيلي', { align: 'center' })
                   .moveDown();

                // معلومات الفترة
                doc.fontSize(12)
                   .text(`الفترة: ${start.toLocaleDateString('ar-IQ')} - ${end.toLocaleDateString('ar-IQ')}`, { align: 'center' })
                   .moveDown(2);

                // إحصائيات سريعة
                const totalSales = formattedSales.reduce((sum, s) => sum + s.total, 0);
                const totalInvoices = formattedSales.length;
                const averageInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;

                doc.fontSize(14)
                   .text('ملخص سريع', { align: 'right' })
                   .moveDown(0.5);

                doc.fontSize(12)
                   .text(`إجمالي المبيعات: ${totalSales.toLocaleString('ar-IQ')} د.ع`, { align: 'right' })
                   .text(`عدد الفواتير: ${totalInvoices}`, { align: 'right' })
                   .text(`متوسط الفاتورة: ${Math.round(averageInvoice).toLocaleString('ar-IQ')} د.ع`, { align: 'right' })
                   .moveDown(2);

                // جدول المبيعات
                const tableTop = doc.y;
                const colWidths = [80, 80, 120, 120, 60, 80];
                const tableHeaders = ['رقم الفاتورة', 'التاريخ', 'العميل', 'الكاشير', 'النوع', 'الإجمالي'];

                // رسم رأس الجدول
                doc.fontSize(10).font('Helvetica-Bold');
                let xPosition = 50;
                tableHeaders.forEach((header, i) => {
                    doc.text(header, xPosition, tableTop, { width: colWidths[i], align: 'center' });
                    xPosition += colWidths[i];
                });

                // رسم خط تحت الرأس
                doc.moveTo(50, tableTop + 15)
                   .lineTo(550, tableTop + 15)
                   .stroke();

                // رسم البيانات
                let yPosition = tableTop + 25;
                doc.fontSize(9).font('Helvetica');

                formattedSales.slice(0, 50).forEach((s, index) => {
                    // التحقق من الحاجة لصفحة جديدة
                    if (yPosition > 550) {
                        doc.addPage();
                        yPosition = 50;
                        
                        // إعادة رسم رأس الجدول في الصفحة الجديدة
                        doc.font('Helvetica-Bold').fontSize(10);
                        xPosition = 50;
                        tableHeaders.forEach((header, i) => {
                            doc.text(header, xPosition, yPosition - 15, { width: colWidths[i], align: 'center' });
                            xPosition += colWidths[i];
                        });
                        
                        // رسم خط تحت الرأس
                        doc.moveTo(50, yPosition)
                           .lineTo(550, yPosition)
                           .stroke();
                        
                        yPosition += 10;
                        doc.font('Helvetica').fontSize(9);
                    }

                    xPosition = 50;
                    
                    // رقم الفاتورة
                    doc.text(s.invoiceNumber, xPosition, yPosition, { width: colWidths[0], align: 'center' });
                    xPosition += colWidths[0];
                    
                    // التاريخ
                    doc.text(s.date.split(' ')[0], xPosition, yPosition, { width: colWidths[1], align: 'center' });
                    xPosition += colWidths[1];
                    
                    // العميل
                    doc.text(s.customer.length > 15 ? s.customer.substring(0, 15) + '...' : s.customer, 
                            xPosition, yPosition, { width: colWidths[2], align: 'center' });
                    xPosition += colWidths[2];
                    
                    // الكاشير
                    doc.text(s.cashier.length > 15 ? s.cashier.substring(0, 15) + '...' : s.cashier, 
                            xPosition, yPosition, { width: colWidths[3], align: 'center' });
                    xPosition += colWidths[3];
                    
                    // النوع
                    doc.text(s.type, xPosition, yPosition, { width: colWidths[4], align: 'center' });
                    xPosition += colWidths[4];
                    
                    // الإجمالي
                    doc.text(s.total.toLocaleString('ar-IQ'), xPosition, yPosition, { width: colWidths[5], align: 'center' });
                    
                    yPosition += 20;
                    
                    // رسم خط فاصل خفيف بين الصفوف
                    if (index < formattedSales.length - 1) {
                        doc.strokeColor('#cccccc')
                           .lineWidth(0.5)
                           .moveTo(50, yPosition - 10)
                           .lineTo(550, yPosition - 10)
                           .stroke();
                    }
                });

                // تذييل الصفحة
                doc.fontSize(8)
                   .text(
                       `تم إنشاء التقرير في: ${new Date().toLocaleString('ar-IQ')} | Pixel POS - نظام نقاط البيع`,
                       50,
                       doc.page.height - 50,
                       { align: 'center', width: 500 }
                   );

                doc.end();

            } catch (pdfError) {
                console.error('PDF Error:', pdfError);
                res.status(500).json({ 
                    success: false, 
                    message: 'حدث خطأ أثناء إنشاء ملف PDF' 
                });
            }
        }

        // ==================== تصدير Excel (HTML) ====================
        else if (format === 'excel') {
            // إنشاء ملف HTML بسيط يمكن فتحه في Excel
            let html = `
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                    <meta charset="utf-8">
                    <title>تقرير المبيعات</title>
                    <style>
                        body { font-family: 'Tajawal', Arial, sans-serif; margin: 20px; }
                        h2 { color: #3b82f6; text-align: center; margin-bottom: 10px; }
                        .period { text-align: center; color: #666; margin-bottom: 30px; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        th { background: #3b82f6; color: white; padding: 12px; text-align: center; font-size: 14px; }
                        td { padding: 10px; border: 1px solid #ddd; text-align: center; }
                        tr:nth-child(even) { background: #f9fafb; }
                        .total-section { width: 50%; margin: 20px auto; }
                        .total-row td { background: #e2e8f0; font-weight: bold; }
                        .footer { text-align: center; color: #666; margin-top: 40px; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <h2>تقرير المبيعات التفصيلي</h2>
                    <div class="period">الفترة: ${start.toLocaleDateString('ar-IQ')} - ${end.toLocaleDateString('ar-IQ')}</div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                                <th>العميل</th>
                                <th>الكاشير</th>
                                <th>النوع</th>
                                <th>الإجمالي</th>
                                <th>المدفوع</th>
                                <th>الباقي</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            formattedSales.forEach(s => {
                html += `
                    <tr>
                        <td>${s.invoiceNumber}</td>
                        <td>${s.date}</td>
                        <td>${s.customer}</td>
                        <td>${s.cashier}</td>
                        <td>${s.type}</td>
                        <td>${s.total.toLocaleString('ar-IQ')}</td>
                        <td>${s.paid.toLocaleString('ar-IQ')}</td>
                        <td>${s.change.toLocaleString('ar-IQ')}</td>
                    </tr>
                `;
            });

            const totalSum = formattedSales.reduce((sum, s) => sum + s.total, 0);
            
            html += `
                        </tbody>
                    </table>
                    
                    <table class="total-section">
                        <tr class="total-row">
                            <td style="width: 50%;">إجمالي المبيعات</td>
                            <td style="width: 50%;">${totalSum.toLocaleString('ar-IQ')} د.ع</td>
                        </tr>
                        <tr>
                            <td>عدد الفواتير</td>
                            <td>${formattedSales.length}</td>
                        </tr>
                        <tr>
                            <td>متوسط الفاتورة</td>
                            <td>${Math.round(totalSum / formattedSales.length).toLocaleString('ar-IQ')} د.ع</td>
                        </tr>
                    </table>
                    
                    <div class="footer">
                        تم إنشاء التقرير في: ${new Date().toLocaleString('ar-IQ')}<br>
                        Pixel POS - نظام نقاط البيع
                    </div>
                </body>
                </html>
            `;

            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.xls`);
            res.send(html);
        }

        else {
            res.status(400).json({ 
                success: false, 
                message: 'صيغة غير مدعومة. استخدم: pdf, csv, أو excel' 
            });
        }

    } catch (error) {
        console.error('Export Error:', error);
        const err = new Error('حدث خطأ أثناء تصدير التقرير: ' + error.message);
        err.status = 500;
        next(err);
    }
};





// 3. تقرير المخزون
export const getInventoryReport = async (req, res) => {
    try {
        const products = await Product.findAll({
            include: [{ model: Category, attributes: ['name'] }],
            order: [['currentStock', 'ASC']]
        });

        const validProducts = products.filter(p => p.currentStock > 0);

        const stats = {
            totalProducts: products.length,
            lowStockCount: products.filter(p => p.currentStock <= 5 && p.currentStock > 0).length,
            
            // 1. إجمالي مبلغ الشراء (رأس المال)
            totalCost: Math.round(validProducts.reduce((acc, p) => acc + (Number(p.purchasePrice) * p.currentStock), 0)),
            
            // 2. إجمالي مبلغ البيع المتوقع (كل الكاش الذي سيدخل المحل)
            totalRevenue: Math.round(validProducts.reduce((acc, p) => acc + (Number(p.salePrice) * p.currentStock), 0)),
        };

        // 3. صافي الفائدة (الفرق بينهما)
        stats.netProfit = stats.totalRevenue - stats.totalCost;

        res.render('reports-inventory', {
            title: 'تقرير الجرد المالي',
            products,
            stats
        });
    } catch (error) {
        res.status(500).send('خطأ في الحسابات');
    }
};






// 4. تقرير الديون
export const getDebtReport = async (req, res) => {
    try {

        // ===================== ديون العملاء =====================
        const customerDebts = await Debt.findAll({
            where: { type: 'CUSTOMER' }
        });

        const customerStats = {
            totalDebt: customerDebts.reduce((sum, d) => sum + Number(d.remainingAmount), 0),
            pendingCount: customerDebts.filter(d => d.status === 'PENDING').length,
            partialCount: customerDebts.filter(d => d.status === 'PARTIAL').length
        };

        // ===================== ديون الموردين =====================
        const supplierDebts = await Debt.findAll({
            where: { type: 'SUPPLIER' }
        });

        const supplierStats = {
            totalDebt: supplierDebts.reduce((sum, d) => sum + Number(d.remainingAmount), 0),
            totalInvoices: supplierDebts.length
        };

        // ===================== معدل التحصيل =====================
        const allCustomerDebts = await Debt.findAll({
            where: { type: 'CUSTOMER' }
        });

        const totalOriginal = allCustomerDebts.reduce((sum, d) => sum + Number(d.originalAmount), 0);
        const totalRemaining = allCustomerDebts.reduce((sum, d) => sum + Number(d.remainingAmount), 0);

        let collectionRate = 0;

        if (totalOriginal > 0) {
            collectionRate = Math.round(((totalOriginal - totalRemaining) / totalOriginal) * 100);
        }

        // ===================== Render =====================
        res.render('reports-debts', {
            title: 'سجل الديون',
            customerStats,
            supplierStats,
            collectionRate
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('خطأ في تحميل تقرير الديون');
    }
};


// 5. تقرير الفواتير والمبيعات
export const getInvoiceReport = async (req, res) => {
    try {
        // 1. جلب الفواتير مع بيانات العميل والمستخدم الذي قام بالبيع
        const sales = await Sale.findAll({
            include: [
                { model: Customer, attributes: ['name'] },
                { model: User, attributes: ['fullName'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: 500 // لتجنب ثقل الصفحة
        });

        // 2. حساب إحصائيات سريعة للتقرير
        const stats = {
            totalInvoices: sales.length,
            totalSalesAmount: sales.reduce((sum, s) => sum + parseFloat(s.total), 0),
            totalPaidAmount: sales.reduce((sum, s) => sum + parseFloat(s.paid), 0),
            totalDebtAmount: sales.reduce((sum, s) => sum + (parseFloat(s.total) - parseFloat(s.paid)), 0)
        };

        res.render('reports-invoices', {
            title: 'سجل الفواتير والمبيعات',
            sales,
            stats
        });
    } catch (error) {
        console.error("Invoice Report Error:", error);
        res.status(500).render('error', { 
            status: 500, 
            message: "خطأ في جلب سجل الفواتير." 
        });
    }
};


// 6. التقرير الشهري الشامل
export const getMonthlyFullReport = async (req, res) => {
    try {
        const { month } = req.query;

       if (!month) {
    return res.render('reports-monthly', {
        title: 'تقرير شهري شامل',
        report: null   // 🔥 هذا هو الحل
    });
}

        const startDate = new Date(`${month}-01`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        // ===================== المبيعات =====================
        const sales = await Sale.findAll({
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            },
            include: [{ model: SaleItem }]
        });

        let totalSales = 0;
        let totalPaid = 0;
        let totalCost = 0;

        sales.forEach(s => {
            totalSales += Number(s.total);
            totalPaid += Number(s.paid);

            s.SaleItems.forEach(i => {
                totalCost += Number(i.costAtSale) * Number(i.quantity);
            });
        });

        const totalInvoices = sales.length;
        const remaining = totalSales - totalPaid;
        const profit = totalSales - totalCost;

        // ===================== المشتريات =====================
        const purchases = await Purchase.findAll({
            where: {
                createdAt: { [Op.between]: [startDate, endDate] }
            }
        });

        const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.total), 0);

        // ===================== الديون =====================
        const customerDebt = await Debt.sum('remainingAmount', {
            where: { type: 'CUSTOMER' }
        });

        const supplierDebt = await Debt.sum('remainingAmount', {
            where: { type: 'SUPPLIER' }
        });

        // ===================== التحصيل =====================
        const collectionRate = totalSales > 0
            ? Math.round((totalPaid / totalSales) * 100)
            : 0;

        // ===================== النتيجة =====================
        const report = {
            month,
            totalSales,
            totalPaid,
            remaining,
            totalInvoices,
            totalCost,
            profit,
            totalPurchases,
            customerDebt,
            supplierDebt,
            collectionRate
        };

        res.render('reports-monthly', {
            title: 'تقرير شهري شامل',
            report
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('خطأ في التقرير');
    }
};


// 7. التقرير المالي الشامل
export const getFullFinancialReport = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;

        // 1. إعداد فلتر التاريخ (من بداية اليوم الأول إلى نهاية اليوم الأخير)
        const dateFilter = {};
        if (fromDate && toDate) {
            dateFilter.createdAt = {
                [Op.between]: [
                    new Date(fromDate).setHours(0, 0, 0, 0),
                    new Date(toDate).setHours(23, 59, 59, 999)
                ]
            };
        }

        // 2. إحصائيات المبيعات (استعلام واحد مجمع لزيادة الأداء)
        const salesStats = await Sale.findOne({
            where: dateFilter,
            attributes: [
                [sequelize.fn('SUM', sequelize.col('total')), 'totalSales'],
                [sequelize.fn('SUM', sequelize.col('paid')), 'totalPaid'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount']
            ],
            raw: true
        });

        // 3. حساب تكلفة البضاعة المباعة (إصلاح مشكلة PostgreSQL عبر الـ Double Quotes)
        const costStats = await SaleItem.findOne({
            include: [{
                model: Sale,
                where: dateFilter,
                attributes: []
            }],
            attributes: [
                // استخدام "" حول أسماء الأعمدة لمنع PostgreSQL من تحويلها لأحرف صغيرة
                [sequelize.literal('SUM("costAtSale" * "quantity")'), 'totalCost']
            ],
            raw: true
        });

        // 4. جلب أفضل 5 منتجات (إصلاح أسماء الأعمدة والربط)
        const topProducts = await SaleItem.findAll({
            include: [
                { model: Sale, where: dateFilter, attributes: [] },
                { model: Product, attributes: ['name'] }
            ],
            attributes: [
                'productId',
                [sequelize.literal('MAX("Product"."name")'), 'name'], 
                [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'qty'],
                [sequelize.fn('SUM', sequelize.col('SaleItem.total')), 'revenue']
            ],
            group: ['productId', 'Product.id'],
            order: [[sequelize.literal('revenue'), 'DESC']],
            limit: 5,
            raw: true
        });

        // 5. المصاريف والديون (إحصائيات عامة)
        const totalExpenses = await CashMovement.sum('amount', {
            where: { category: 'EXPENSE', ...dateFilter }
        }) || 0;

        const customerDebt = await Debt.sum('remainingAmount', { where: { type: 'CUSTOMER' } }) || 0;
        const supplierDebt = await Debt.sum('remainingAmount', { where: { type: 'SUPPLIER' } }) || 0;

        // 6. تجميع النتائج النهائية
        const report = {
            totalSales: Number(salesStats.totalSales || 0),
            totalPaid: Number(salesStats.totalPaid || 0),
            totalCost: Number(costStats.totalCost || 0),
            totalExpenses: Number(totalExpenses),
            invoiceCount: salesStats.invoiceCount || 0,
            customerDebt: Number(customerDebt),
            supplierDebt: Number(supplierDebt),
            topProducts: topProducts
        };

        // حساب المؤشرات المالية (KPIs)
        report.grossProfit = report.totalSales - report.totalCost;
        report.netProfit = report.grossProfit - report.totalExpenses;
        report.profitMargin = report.totalSales > 0 ? ((report.netProfit / report.totalSales) * 100).toFixed(2) : 0;
        report.collectionRate = report.totalSales > 0 ? ((report.totalPaid / report.totalSales) * 100).toFixed(2) : 0;

        res.render('reports-full-financial', {
            title: 'التقرير المالي الشامل',
            report,
            filters: { fromDate, toDate }
        });

    } catch (error) {
        console.error("❌ Financial Report Error:", error);
        res.status(500).render('error', { 
            status: 500, 
            message: 'خطأ في معالجة البيانات: تأكد من تطابق أسماء الأعمدة وحالة الأحرف.' 
        });
    }
};



// 8. تقرير المقارنة السنوية
export const getAnnualComparison = async (req, res) => {
    try {
        const years = await Sale.findAll({
            attributes: [
                [Sequelize.fn('YEAR', Sequelize.col('createdAt')), 'year'],
                [Sequelize.fn('SUM', Sequelize.col('total')), 'totalSales'],
                [Sequelize.fn('SUM', Sequelize.col('paid')), 'totalPaid']
            ],
            group: ['year'],
            order: [[Sequelize.literal('year'), 'ASC']],
            raw: true
        });

        // COST per year
        const costData = await SaleItem.findAll({
            attributes: [
                [Sequelize.fn('YEAR', Sequelize.col('createdAt')), 'year'],
                [Sequelize.fn('SUM', Sequelize.literal('costAtSale * quantity')), 'totalCost']
            ],
            group: ['year'],
            raw: true
        });

        // EXPENSES per year
        const expenseData = await CashMovement.findAll({
            attributes: [
                [Sequelize.fn('YEAR', Sequelize.col('createdAt')), 'year'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalExpenses']
            ],
            where: { category: 'EXPENSE' },
            group: ['year'],
            raw: true
        });

        // دمج البيانات
        const map = {};

        years.forEach(y => {
            map[y.year] = {
                year: y.year,
                sales: Number(y.totalSales || 0),
                paid: Number(y.totalPaid || 0),
                cost: 0,
                expenses: 0,
                profit: 0
            };
        });

        costData.forEach(c => {
            if (!map[c.year]) map[c.year] = { year: c.year };
            map[c.year].cost = Number(c.totalCost || 0);
        });

        expenseData.forEach(e => {
            if (!map[e.year]) map[e.year] = { year: e.year };
            map[e.year].expenses = Number(e.totalExpenses || 0);
        });

        // حساب الأرباح
        const result = Object.values(map).map(r => {
            const grossProfit = r.sales - r.cost;
            const netProfit = grossProfit - r.expenses;

            return {
                ...r,
                grossProfit,
                netProfit
            };
        }).sort((a, b) => a.year - b.year);

        // Growth calculation
        for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1];
            const curr = result[i];

            curr.growth = {
                sales: prev.sales ? ((curr.sales - prev.sales) / prev.sales * 100).toFixed(2) : 0,
                profit: prev.netProfit ? ((curr.netProfit - prev.netProfit) / prev.netProfit * 100).toFixed(2) : 0
            };
        }

        res.render('reports-annual-comparison', {
            title: 'مقارنة سنوية',
            data: result
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('خطأ في التقرير السنوي');
    }
};