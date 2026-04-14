import { sequelize, Customer, CashMovement, Debt } from "../models/models.js";

// 1. عرض قائمة العملاء
export const getCustomers = async (req, res, next) => {
    try {
        const customers = await Customer.findAll({
            order: [['createdAt', 'DESC']]
        });

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json(customers);
        }

        res.render('customers', {
            title: 'إدارة العملاء - Pixel Iraq',
            customers
        });
    } catch (e) {
        next(e);
    }
};

// 2. الصفحة الموحدة (إضافة أو تعديل)
export const getCustomerCreatePage = async (req, res, next) => {
    try {
        const { id } = req.params; // سنحاول جلب المعرف من الرابط
        let customer = null;

        if (id) {
            customer = await Customer.findByPk(id);
            if (!customer) {
                return res.redirect('/customers'); // إذا لم يوجد العميل نرجعه للقائمة
            }
        }

        // ملاحظة: تأكد أن اسم ملف الـ EJS الموحد هو 'customer-form'
        res.render('customer-create', {
            title: id ? 'تعديل بيانات العميل - Pixel Iraq' : 'إضافة عميل جديد - Pixel Iraq',
            customer: customer // سيكون إما كائن الزبون أو null
        });
    } catch (e) {
        next(e);
    }
};

// 3. معالجة الإضافة (Store)
export const createCustomer = async (req, res, next) => {
    try {
        const { name, currentDebt } = req.body;

        if (!name || name.trim() === "") {
            return res.status(400).send("اسم الزبون مطلوب");
        }

        await Customer.create({
            name: name.trim(),
            currentDebt: parseFloat(currentDebt) || 0
        });

        res.redirect('/customers');
    } catch (e) {
        next(e);
    }
};

// 4. معالجة التحديث (Update)
export const updateCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, currentDebt } = req.body;
        
        if (!name || name.trim() === "") {
            return res.status(400).send("اسم الزبون مطلوب");
        }
        
        const customer = await Customer.findByPk(id);
        if (!customer) {
            return res.status(404).send("العميل غير موجود");
        }

        await customer.update({
            name: name.trim(),
            currentDebt: parseFloat(currentDebt) || 0
        });

        res.redirect('/customers');
    } catch (e) {
        next(e);
    }
};



export const deleteCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        await Customer.destroy({ where: { id } });
        res.redirect('/customers');
    } catch (e) {
        next(e);
    }
};





export const payCustomerDebt = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { customerId, amountPaid, userId } = req.body;
        let paymentAmount = parseFloat(amountPaid);

        // 1. جلب العميل
        const customer = await Customer.findByPk(customerId, { transaction: t });
        if (!customer) throw new Error("العميل غير موجود");

        // 2. تحديث رصيد العميل
        customer.currentDebt = parseFloat(customer.currentDebt) - paymentAmount;
        await customer.save({ transaction: t });

        // 3. تسجيل حركة نقدية
        await CashMovement.create({
            type: 'IN',
            amount: paymentAmount,
            category: 'DEBT_PAYMENT',
            userId: userId || null,
            referenceId: customerId,
            referenceType: 'Customer'
        }, { transaction: t });

        // 4. جلب الديون مع الفواتير المرتبطة
        let remainingToDistribute = paymentAmount;

        const debts = await Debt.findAll({
            where: {
                customerId,
                type: 'CUSTOMER',
                status: ['PENDING', 'PARTIAL']
            },
            include: [{
                association: 'sale' // مهم جدًا
            }],
            order: [['createdAt', 'ASC']],
            transaction: t
        });

        for (let debt of debts) {
            if (remainingToDistribute <= 0) break;

            let debtRemaining = parseFloat(debt.remainingAmount);
            let sale = debt.sale;

            let amountToPay = Math.min(remainingToDistribute, debtRemaining);

            // ================== تحديث الدين ==================
            debt.remainingAmount = debtRemaining - amountToPay;

            if (debt.remainingAmount === 0) {
                debt.status = 'PAID';
            } else {
                debt.status = 'PARTIAL';
            }

            await debt.save({ transaction: t });

            // ================== تحديث الفاتورة ==================
            if (sale) {
                sale.paid = parseFloat(sale.paid) + amountToPay;
                await sale.save({ transaction: t });
            }

            remainingToDistribute -= amountToPay;
        }

        await t.commit();

        res.json({
            success: true,
            message: "تم تسديد الدين وتحديث الفواتير بنجاح"
        });

    } catch (e) {
        await t.rollback();
        res.status(500).json({
            success: false,
            message: e.message
        });
    }
};