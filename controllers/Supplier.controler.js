import { sequelize, Supplier, CashMovement, Debt } from "../models/models.js";
import { Op } from "sequelize";

// =============================================
// عرض جميع الموردين مع pagination
// =============================================
export const getSuppliers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const { count, rows } = await Supplier.findAndCountAll({
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });

        const totalPages = Math.ceil(count / limit);

        res.render('suppliers', { 
            suppliers: rows, 
            currentPage: page, 
            totalPages: totalPages,
            totalCount: count,
            title: 'إدارة الموردين'
        }); 
    } catch (error) {
        const err = new Error("حدث خطأ أثناء جلب الموردين");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// إضافة مورد جديد
// =============================================
export const createSupplier = async (req, res, next) => {
    try {
        const { name, currentDebt } = req.body;

        // التحقق من صحة البيانات
        if (!name || name.trim() === '') {
            const error = new Error("اسم المورد مطلوب");
            error.status = 400;
            return next(error);
        }

        // التحقق من عدم تكرار الاسم
        const existingSupplier = await Supplier.findOne({
            where: { name: name.trim() }
        });

        if (existingSupplier) {
            const error = new Error("مورد بنفس الاسم موجود مسبقاً في النظام");
            error.status = 400;
            return next(error);
        }

        const newSupplier = await Supplier.create({
            name: name.trim(),
            currentDebt: parseFloat(currentDebt) || 0
        });

        res.redirect('/suppliers');
     
    } catch (error) {
        const err = new Error("حدث خطأ أثناء إضافة المورد");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// حذف مورد
// =============================================
export const deleteSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;

        // التحقق من وجود المورد
        const supplier = await Supplier.findByPk(id);
        if (!supplier) {
            const error = new Error("المورد غير موجود في النظام");
            error.status = 404;
            return next(error);
        }

        // التحقق من عدم وجود ديون مستحقة
        if (parseFloat(supplier.currentDebt) > 0) {
            const error = new Error(`لا يمكن حذف المورد لأنه عليه ديون مستحقة: ${parseFloat(supplier.currentDebt).toLocaleString()} د.ع`);
            error.status = 400;
            return next(error);
        }

        await supplier.destroy();
        res.json({ 
            success: true, 
            message: "تم حذف المورد بنجاح" 
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء حذف المورد");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// تحديث بيانات مورد
// =============================================
export const updateSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, currentDebt } = req.body;

        // التحقق من وجود المورد
        const supplier = await Supplier.findByPk(id);
        if (!supplier) {
            const error = new Error("المورد غير موجود في النظام");
            error.status = 404;
            return next(error);
        }

        // التحقق من صحة البيانات
        if (name !== undefined && name.trim() === '') {
            const error = new Error("اسم المورد لا يمكن أن يكون فارغاً");
            error.status = 400;
            return next(error);
        }

        // التحقق من عدم تكرار الاسم (إذا تم تغيير الاسم)
        if (name !== undefined && name.trim() !== supplier.name) {
            const existingSupplier = await Supplier.findOne({
                where: { name: name.trim() }
            });
            if (existingSupplier) {
                const error = new Error("مورد بنفس الاسم موجود مسبقاً في النظام");
                error.status = 400;
                return next(error);
            }
        }

        // التحقق من صحة المبلغ (لا يمكن أن يكون سالباً)
        if (currentDebt !== undefined && parseFloat(currentDebt) < 0) {
            const error = new Error("لا يمكن أن يكون الدين مبلغاً سالباً");
            error.status = 400;
            return next(error);
        }

        await supplier.update({
            name: name !== undefined ? name.trim() : supplier.name,
            currentDebt: currentDebt !== undefined ? parseFloat(currentDebt) : supplier.currentDebt
        });

        res.json({ 
            success: true, 
            message: "تم تحديث البيانات بنجاح",
            data: supplier
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء تحديث بيانات المورد");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// تسديد دين مورد
// =============================================
export const paySupplierDebt = async (req, res, next) => {
    const t = await sequelize.transaction(); // بدء المعاملة

    try {
        const { id } = req.params; // معرف المورد
        const { amount, userId } = req.body; 

        // 1. التحقق من المدخلات
        const paymentAmount = parseFloat(amount);
        if (!paymentAmount || paymentAmount <= 0) {
            throw { status: 400, message: "المبلغ المدفوع يجب أن يكون أكبر من صفر" };
        }

        // 2. التحقق من وجود المورد وجلب دينه الحالي
        const supplier = await Supplier.findByPk(id, { transaction: t });
        if (!supplier) {
            throw { status: 404, message: "المورد غير موجود" };
        }

        const currentTotalDebt = parseFloat(supplier.currentDebt);
        if (currentTotalDebt < paymentAmount) {
            throw { status: 400, message: `المبلغ أكبر من إجمالي الدين المستحق (${currentTotalDebt.toLocaleString()})` };
        }

        // 3. جلب الديون الفردية المرتبطة بهذا المورد (التي لم تدفع بالكامل)
        // مرتبة من الأقدم إلى الأحدث (FIFO)
        const pendingDebts = await Debt.findAll({
            where: {
                supplierId: id,
                type: 'SUPPLIER',
                status: ['PENDING', 'PARTIAL']
            },
            order: [['createdAt', 'ASC']],
            transaction: t
        });

        let remainingToDistribute = paymentAmount;

        // 4. توزيع المبلغ على سجلات الديون الفردية
        for (const debt of pendingDebts) {
            if (remainingToDistribute <= 0) break;

            const debtRemaining = parseFloat(debt.remainingAmount);

            if (remainingToDistribute >= debtRemaining) {
                // تسديد هذا الدين بالكامل
                remainingToDistribute -= debtRemaining;
                await debt.update({
                    remainingAmount: 0,
                    status: 'PAID'
                }, { transaction: t });
            } else {
                // تسديد جزء من هذا الدين
                await debt.update({
                    remainingAmount: debtRemaining - remainingToDistribute,
                    status: 'PARTIAL'
                }, { transaction: t });
                remainingToDistribute = 0;
            }
        }

        // 5. تحديث إجمالي الدين في جدول المورد
        const newTotalDebt = currentTotalDebt - paymentAmount;
        await supplier.update({ currentDebt: newTotalDebt }, { transaction: t });

        // 6. تسجيل الحركة في جدول النقدية (CashMovement)
        await CashMovement.create({
            type: 'OUT',
            amount: paymentAmount,
            category: 'DEBT_PAYMENT',
            referenceId: supplier.id, // ربط مباشر بالمورد أو بأول سجل دين حسب رغبتك
            referenceType: 'Supplier',
            userId: userId || 1 
        }, { transaction: t });

        // إتمام العملية
        await t.commit();

        res.json({
            success: true,
            message: `تم تسديد ${paymentAmount.toLocaleString()} د.ع بنجاح`,
            data: {
                supplierName: supplier.name,
                paid: paymentAmount,
                remainingDebt: newTotalDebt
            }
        });

    } catch (error) {
        await t.rollback();
        console.error("Critical Payment Error:", error);
        next(error.status ? error : { status: 500, message: "خطأ داخلي أثناء معالجة الدفع" });
    }
};

// =============================================
// البحث عن موردين
// =============================================
export const searchSuppliers = async (req, res, next) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim() === '') {
            return res.json({ 
                success: true, 
                data: [] 
            });
        }

        const suppliers = await Supplier.findAll({
            where: {
                name: { [Op.like]: `%${q}%` }
            },
            limit: 20,
            order: [['name', 'ASC']]
        });

        res.json({ 
            success: true, 
            data: suppliers 
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء البحث عن الموردين");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// جلب الموردين الذين عليهم ديون
// =============================================
export const getSuppliersWithDebt = async (req, res, next) => {
    try {
        const suppliers = await Supplier.findAll({
            where: {
                currentDebt: { [Op.gt]: 0 }
            },
            order: [['currentDebt', 'DESC']]
        });

        if (suppliers.length === 0) {
            const error = new Error("لا يوجد موردين عليهم ديون حالياً");
            error.status = 404;
            return next(error);
        }

        res.json({ 
            success: true, 
            data: suppliers 
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء جلب الموردين المدينين");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// إحصائيات سريعة عن الموردين
// =============================================
export const getSuppliersStats = async (req, res, next) => {
    try {
        const totalSuppliers = await Supplier.count();
        
        const suppliersWithDebt = await Supplier.count({
            where: { currentDebt: { [Op.gt]: 0 } }
        });
        
        const totalDebtResult = await Supplier.sum('currentDebt');
        const totalDebt = parseFloat(totalDebtResult || 0);

        const topDebtSuppliers = await Supplier.findAll({
            where: { currentDebt: { [Op.gt]: 0 } },
            order: [['currentDebt', 'DESC']],
            limit: 5
        });

        res.json({ 
            success: true, 
            data: {
                totalSuppliers,
                suppliersWithDebt,
                totalDebt,
                topDebtSuppliers
            }
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء جلب إحصائيات الموردين");
        err.status = 500;
        return next(err);
    }
};

// =============================================
// جلب مورد واحد
// =============================================
export const getSupplierById = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const supplier = await Supplier.findByPk(id);
        if (!supplier) {
            const error = new Error("المورد غير موجود في النظام");
            error.status = 404;
            return next(error);
        }

        res.json({ 
            success: true, 
            data: supplier 
        });
    } catch (error) {
        const err = new Error("حدث خطأ أثناء جلب بيانات المورد");
        err.status = 500;
        return next(err);
    }
};