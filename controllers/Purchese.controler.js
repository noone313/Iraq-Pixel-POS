import { 
    Purchase, PurchaseItem, Product, Supplier, 
    StockMovement, CashMovement, Debt, sequelize 
} from "../models/models.js";



// 1. عرض قائمة جميع فواتير الشراء مع التقسيم لصفحات (Pagination)
export const getPurchases = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1; // الصفحة الحالية
        const limit = 10; // عدد الفواتير في كل صفحة
        const offset = (page - 1) * limit;

        // استخدام findAndCountAll لجلب البيانات والعدد الإجمالي معاً
        const { count, rows: purchases } = await Purchase.findAndCountAll({
            include: [{ model: Supplier, attributes: ['name'] }],
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset,
            distinct: true // لضمان حساب العدد الصحيح عند وجود include
        });

        const totalPages = Math.ceil(count / limit);

        res.render('purchases', {
            title: 'قائمة المشتريات - Pixel Iraq',
            purchases,
            currentPage: page,
            totalPages: totalPages,
            totalItems: count,
            limit: limit
        });
    } catch (e) {
        next(e);
    }
};

// 2. عرض صفحة فاتورة شراء جديدة
export const renderAddPurchase = async (req, res, next) => {
    try {
        const products = await Product.findAll();
        const suppliers = await Supplier.findAll();
        
        res.render('purchasesAdd', {
            title: 'فاتورة شراء جديدة',
            products,
            suppliers
        });
    } catch (e) {
        next(e);
    }
};


export const createPurchase = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        // استلام البيانات من الفرونت إند
        const { supplierId, items, totalAmount, paidAmount, invoiceNumber, userId } = req.body;

        // 1. إنشاء فاتورة الشراء
        const purchase = await Purchase.create({
            invoiceNumber,
            total: totalAmount,
            supplierId
        }, { transaction });

        // 2. معالجة المواد (تحديث المخزن + سجل حركة المخزن)
        for (const item of items) {
            const product = await Product.findByPk(item.productId);
            
            // حفظ تفاصيل الفاتورة
            await PurchaseItem.create({
                purchaseId: purchase.id,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                total: item.quantity * item.price
            }, { transaction });

            // تسجيل حركة المخزن (Stock Movement)
            await StockMovement.create({
                type: 'IN',
                quantity: item.quantity,
                productId: item.productId,
                referenceId: purchase.id,
                referenceType: 'Purchase',
                previousQuantity: product.currentStock,
                newQuantity: parseFloat(product.currentStock) + parseFloat(item.quantity)
            }, { transaction });

            // تحديث الكمية وسعر الشراء في جدول المنتجات
            await product.update({
                currentStock: parseFloat(product.currentStock) + parseFloat(item.quantity),
                purchasePrice: item.price
            }, { transaction });
        }

        // 3. معالجة النقدية (Cash Movement) - إذا تم دفع أي مبلغ
        if (parseFloat(paidAmount) > 0) {
            await CashMovement.create({
                type: 'OUT', // خرجت أموال للمورد
                amount: paidAmount,
                category: 'PURCHASE',
                referenceId: purchase.id,
                referenceType: 'Purchase',
                userId: userId // المستخدم الذي قام بالعملية
            }, { transaction });
        }

        // 4. معالجة الديون (Debt) - إذا كان هناك مبلغ متبقي
        const remaining = totalAmount - paidAmount;
        if (remaining > 0) {
            // إضافة سجل في جدول الديون
            await Debt.create({
                type: 'SUPPLIER',
                originalAmount: totalAmount,
                remainingAmount: remaining,
                status: paidAmount > 0 ? 'PARTIAL' : 'PENDING',
                supplierId: supplierId,
                referenceId: purchase.id,
                referenceType: 'Purchase'
            }, { transaction });

            // تحديث إجمالي ديون المورد في جدول الموردين
            const supplier = await Supplier.findByPk(supplierId);
            await supplier.update({
                currentDebt: parseFloat(supplier.currentDebt) + remaining
            }, { transaction });
        }

        await transaction.commit();
        res.status(201).json({ success: true, message: 'تمت العملية وتحديث كافة السجلات' });

    } catch (e) {
        await transaction.rollback();
        console.error("❌ خطأ في عملية الشراء:", e);
        res.status(500).json({ success: false, error: e.message });
    }
};



export const deletePurchase = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;

        // 1. جلب الفاتورة مع كافة تفاصيلها والديون المرتبطة بها
        const purchase = await Purchase.findByPk(id, {
            include: [PurchaseItem, Debt, CashMovement]
        });

        if (!purchase) {
            return res.status(404).json({ success: false, message: "الفاتورة غير موجودة" });
        }

        // 2. عكس حركة المخزن (إنقاص الكميات التي دخلت)
        for (const item of purchase.PurchaseItems) {
            const product = await Product.findByPk(item.productId);
            if (product) {
                const previousStock = product.currentStock;
                const newStock = parseFloat(product.currentStock) - parseFloat(item.quantity);

                // تسجيل حركة مخزن عكسية (ADJUST or OUT)
                await StockMovement.create({
                    type: 'ADJUST',
                    quantity: item.quantity,
                    productId: item.productId,
                    referenceId: purchase.id,
                    referenceType: 'Purchase_Delete',
                    previousQuantity: previousStock,
                    newQuantity: newStock
                }, { transaction });

                await product.update({ currentStock: newStock }, { transaction });
            }
        }

        // 3. عكس ديون المورد (إذا كانت الفاتورة ديناً)
        const debtRecord = await Debt.findOne({ 
            where: { referenceId: id, referenceType: 'Purchase' } 
        });
        if (debtRecord) {
            const supplier = await Supplier.findByPk(purchase.supplierId);
            if (supplier) {
                // إنقاص الدين الذي ترتب على هذه الفاتورة من حساب المورد
                await supplier.update({
                    currentDebt: parseFloat(supplier.currentDebt) - parseFloat(debtRecord.remainingAmount)
                }, { transaction });
            }
            await debtRecord.destroy({ transaction });
        }

        // 4. حذف حركات النقدية المرتبطة (إعادة الأموال للصندوق افتراضياً)
        await CashMovement.destroy({
            where: { referenceId: id, referenceType: 'Purchase' }
        }, { transaction });

        // 5. حذف الفاتورة وتفاصيلها (Cascade سيحذف PurchaseItems تلقائياً)
        await purchase.destroy({ transaction });

        await transaction.commit();
        res.redirect('/purchases?success=deleted');

    } catch (e) {
        await transaction.rollback();
        console.error("❌ خطأ أثناء حذف المشتريات:", e);
        next(e);
    }
};




