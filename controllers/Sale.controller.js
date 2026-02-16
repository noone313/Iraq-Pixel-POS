import { Sale, SaleItem, Product, StockMovement, CashMovement, Debt, Customer, sequelize, Category } from "../models/models.js";
import { Op } from "sequelize";

export const createSale = async (req, res, next) => {
    const t = await sequelize.transaction(); // بدء الترانسكشن لضمان سلامة البيانات
    
    try {
        const { customerId, type, items, paid } = req.body; // items: [{productId, quantity}]
        const userId = req.user.id; // معرّف الكاشير من الجلسة

        let totalInvoice = 0;
        const saleItemsToCreate = [];
        const stockUpdates = [];

        // 1. التحقق من المخزون وحساب الإجمالي
        for (const item of items) {
            const product = await Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
            
            if (!product || product.currentStock < item.quantity) {
                throw new Error(`المخزون غير كافٍ للمنتج: ${product ? product.name : 'غير معروف'}`);
            }

            const itemTotal = item.quantity * product.salePrice;
            totalInvoice += itemTotal;

            saleItemsToCreate.push({
                productId: product.id,
                quantity: item.quantity,
                priceAtSale: product.salePrice,
                costAtSale: product.purchasePrice,
                total: itemTotal
            });

            stockUpdates.push({
                product,
                quantity: item.quantity,
                previousStock: product.currentStock
            });
        }

        // 2. إنشاء رأس الفاتورة
        const change = type === 'CASH' ? (paid - totalInvoice) : 0;
        const newSale = await Sale.create({
            invoiceNumber: `INV-${Date.now()}`,
            type,
            total: totalInvoice,
            paid: type === 'CASH' ? paid : 0,
            change: change > 0 ? change : 0,
            userId,
            customerId: customerId || null
        }, { transaction: t });

        // 3. إنشاء مواد الفاتورة وتحديث المخزن وحركاته
        for (const update of stockUpdates) {
            // سجل المادة
            await SaleItem.create({
                ...saleItemsToCreate.find(i => i.productId === update.product.id),
                saleId: newSale.id
            }, { transaction: t });

            // تحديث المخزن
            await update.product.update({
                currentStock: update.product.currentStock - update.quantity
            }, { transaction: t });

            // سجل حركة المخزون (Polymorphic-like)
            await StockMovement.create({
                type: 'OUT',
                quantity: update.quantity,
                referenceId: newSale.id,
                referenceType: 'Sale',
                previousQuantity: update.previousStock,
                newQuantity: update.previousStock - update.quantity,
                productId: update.product.id
            }, { transaction: t });
        }

        // 4. معالجة الديون (إذا كان البيع بالآجل)
        if (type === 'DEBT' && customerId) {
            const debtAmount = totalInvoice - (paid || 0);
            await Debt.create({
                type: 'CUSTOMER',
                originalAmount: debtAmount,
                remainingAmount: debtAmount,
                status: 'PENDING',
                referenceId: newSale.id,
                referenceType: 'Sale',
                customerId
            }, { transaction: t });

            // تحديث دين العميل الإجمالي
            const customer = await Customer.findByPk(customerId, { transaction: t });
            await customer.increment('currentDebt', { by: debtAmount, transaction: t });
        }

        // 5. سجل حركة النقدية (الداخل للصندوق فعلياً)
        const actualPaid = type === 'CASH' ? totalInvoice : (paid || 0);
        if (actualPaid > 0) {
            await CashMovement.create({
                type: 'IN',
                amount: actualPaid,
                category: 'SALE',
                referenceId: newSale.id,
                referenceType: 'Sale',
                userId
            }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ success: true, saleId: newSale.id });

    } catch (e) {
        await t.rollback();
        next(e); // تمرير الخطأ للميدل وير الذي صممناه (Pixel Error Handler)
    }
};



export const getSales = async (req, res, next) => {
    try {
        // جلب المنتجات المتوفرة فقط في المخزن والعملاء لعرضهم في خيارات البيع
        const products = await Product.findAll({ 
            where: { currentStock: { [Op.gt]: 0 } },
            include: [{ model: Category, attributes: ['name'] }]
        });
        const customers = await Customer.findAll();

        res.render('createSale', { 
            title: 'نقطة البيع - Pixel Iraq',
            products,
            customers
        });
    }
    catch (e) {
        next(e);
    }
};

