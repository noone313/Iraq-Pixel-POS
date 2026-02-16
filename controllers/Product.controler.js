import { Product, Category } from "../models/models.js";
import { Op } from "sequelize";

// 1. عرض المنتجات مع البحث والتنقيط
export const getAllProducts = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        const { count, rows } = await Product.findAndCountAll({
            where: {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchQuery}%` } },
                    { barcode: { [Op.like]: `%${searchQuery}%` } }
                ]
            },
            include: [{ model: Category, as: 'Category' }],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.render('products', { 
            products: rows, 
            currentPage: page, 
            totalPages: Math.ceil(count / limit),
            searchQuery,
            totalItems: count
        });
    } catch (e) {
        next(e);
    }
};

// 2. دالة واحدة لعرض صفحة (إضافة / تعديل)
export const renderProductForm = async (req, res, next) => {
    try {
        const { id } = req.params;
        const categories = await Category.findAll();
        let product = null;

        if (id) {
            product = await Product.findByPk(id);
            if (!product) return res.status(404).send("المنتج غير موجود");
        }

        res.render('add-product', { categories, product });
    } catch (e) {
        next(e);
    }
};

// 3. معالجة الحفظ (إضافة جديد)
export const createProduct = async (req, res, next) => {
    try {
        const { barcode, CategoryId } = req.body;

        // الفحص الذكي: يشمل حتى المنتجات المحذوفة (paranoid: false)
        const existing = await Product.findOne({ 
            where: { barcode: barcode.trim() },
            paranoid: false 
        });

        if (existing) {
            // إنشاء خطأ وتمريره للميدل وير
            const error = new Error("الباركود مسجل مسبقاً في النظام (ربما في سلة المحذوفات)");
            error.status = 400; // ليتلقفه ميدل وير الـ 400
            throw error; 
        }


        await Product.create({
            ...req.body,
            barcode: barcode.trim(),
            categoryId: CategoryId // تصحيح الاسم ليتوافق مع الموديل
        });

        res.redirect('/products');

    } catch (e) {
        // أي خطأ هنا (سواء رميناه يدوياً أو من قاعدة البيانات) سيذهب للميدل وير
        next(e); 
    }
};

// 4. معالجة التحديث
export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ success: false });

        await product.update(req.body);
        res.redirect('/products');
    } catch (e) {
        next(e);
    }
};

// 5. الحذف المؤقت (Soft Delete)
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ success: false });

        await product.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
};

// 6. سلة المحذوفات مع دعم البحث
export const getDeletedProducts = async (req, res, next) => {
    try {
        const { search } = req.query; // جلب كلمة البحث من الرابط
        
        // بناء شرط البحث
        let whereCondition = {
            deletedAt: { [Op.ne]: null } // الشرط الأساسي: المنتجات المحذوفة فقط
        };

        // إذا كان هناك نص بحث، نضيف شروط الفلترة
        if (search) {
            whereCondition[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },   // البحث بالاسم (غير حساس لحالة الأحرف)
                { barcode: { [Op.iLike]: `%${search}%` } } // البحث بالباركود
            ];
        }

        const products = await Product.findAll({
            where: whereCondition,
            paranoid: false, // للسماح بجلب البيانات التي لها deletedAt
            order: [['deletedAt', 'DESC']] // عرض الأحدث حذفاً أولاً
        });

        // إرسال النتائج مع كلمة البحث لكي تظل ظاهرة في الحقل
        res.render('deleted-products', { 
            products, 
            searchQuery: search || '' 
        });

    } catch (e) {
        next(e);
    }
};

// 7. الاستعادة
export const restoreProduct = async (req, res, next) => {
    try {
        const product = await Product.findByPk(req.params.id, { paranoid: false });
        if (product) await product.restore();
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
};