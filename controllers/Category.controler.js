import { Category } from "../models/models.js";

// 1. عرض جميع الأصناف
async function ListCategories(req, res, next) {
    try {
        // ترتيب الأصناف من الأحدث إلى الأقدم
        const categories = await Category.findAll({ order: [['id', 'DESC']] });
        res.render('categories', { categories });
    } catch (error) {
        console.error("List Categories Error:", error);
        next(error);
    }
}

// 2. إنشاء صنف جديد
async function CreateCategory(req, res, next) {
    try {
        const { name } = req.body;

        // التحقق مما إذا كان الاسم موجوداً مسبقاً لمنع خطأ التكرار
        const existingCategory = await Category.findOne({ where: { name } });
        if (existingCategory) {
            // يمكنك هنا إرسال رسالة خطأ تظهر في الواجهة
            return res.redirect('/categories?error=exists');
        }

        await Category.create({ name });
        res.redirect('/categories');
    } catch (error) {
        console.error("Create Category Error:", error);
        next(error);
    }
}

// 3. تحديث صنف (تعديل الاسم)
async function UpdateCategory(req, res, next) {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "الصنف غير موجود" });
        }

        await category.update({ name });
        
        // بما أن التعديل يتم غالباً عبر AJAX/Fetch في الواجهة، نرد بـ JSON
        res.json({ success: true, message: "تم تحديث الاسم بنجاح" });
    } catch (error) {
        console.error("Update Category Error:", error);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء التحديث" });
    }
}

// 4. حذف صنف
async function DeleteCategory(req, res, next) {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);

        if (!category) {
            return res.status(404).json({ success: false, message: "الصنف غير موجود بالفعل" });
        }

        // ملاحظة: Sequelize سيمنع الحذف تلقائياً إذا كان الصنف مرتبطاً بمنتجات (RESTRICT)
        await category.destroy();
        res.json({ success: true, message: "تم حذف الصنف بنجاح" });
    } catch (error) {
        console.error("Delete Category Error:", error);
        // التحقق إذا كان الخطأ بسبب وجود منتجات مرتبطة
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ 
                success: false, 
                message: "لا يمكن حذف الصنف لأنه يحتوي على منتجات مرتبطة به" 
            });
        }
        res.status(500).json({ success: false, message: "فشل الحذف بسبب خطأ داخلي" });
    }
}

export { ListCategories, CreateCategory, UpdateCategory, DeleteCategory };