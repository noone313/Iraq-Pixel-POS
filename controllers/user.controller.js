import { User } from '../models/models.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

async function Register(req, res, next) { 
    try {
        // 1. استلام البيانات من النموذج
        const { fullName, username, password, role } = req.body;

        // 2. التحقق من التكرار
        const existingUser = await User.findOne({ 
            where: { username } 
        });

        if (existingUser) {
            // ✅ الطريقة الصحيحة: إنشاء كائن خطأ وتمريره للـ Middleware
            const error = new Error("اسم المستخدم مسجل مسبقاً في النظام");
            error.status = 400;
            return next(error);
        }

        // 3. تشفير كلمة المرور
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 4. إنشاء المستخدم
        // ملاحظة: تأكد من اسم الحقل في الموديل (roleId) كما عرفناه سابقاً
        await User.create({
            fullName,
            username,
            password: hashedPassword,
            role, // نستخدم role لربطه بجدول الأدوار
            isActive: true
        });

        // 5. النجاح
        res.redirect('/');

    } catch (error) {
        console.error("Register Error:", error);
        // ✅ تمرير أخطاء السيرفر (500) أيضاً للمالج العام
        next(error); 
    }
}



async function UpdateUser(req, res, next) {
    try {
        const { id } = req.params; // معرف المستخدم من الرابط
        const { fullName, username, password, roleId, isActive } = req.body;

        // 1. البحث عن المستخدم
        const user = await User.findByPk(id);
        if (!user) {
            const error = new Error("المستخدم غير موجود في النظام");
            error.status = 404;
            return next(error);
        }

        // 2. التحقق من اسم المستخدم الجديد (إذا تم تغييره)
        if (username !== user.username) {
            const userExists = await User.findOne({ where: { username } });
            if (userExists) {
                const error = new Error("اسم المستخدم الجديد محجوز لموظف آخر");
                error.status = 400;
                return next(error);
            }
        }

        // 3. تجهيز البيانات للتحديث
        const updateData = {
            fullName,
            username,
            roleId,
            isActive: isActive === 'on' || isActive === true // التعامل مع الـ Checkbox في EJS
        };

        // 4. تشفير كلمة المرور فقط إذا تم إرسال واحدة جديدة
        if (password && password.trim() !== "") {
            const saltRounds = 10;
            updateData.password = await bcrypt.hash(password, saltRounds);
        }

        // 5. تنفيذ التحديث
        await user.update(updateData);

        // 6. التوجيه لصفحة المستخدمين مع رسالة نجاح (أو عرض المستخدم نفسه)
        res.redirect('/users');

    } catch (error) {
        console.error("Update User Error:", error);
        // تمرير أي خطأ تقني غير متوقع لمعالج الـ 500
        next(error);
    }
}

async function ListUsers(req, res, next) {
    try {
        const users = await User.findAll();
        res.render('users', { users });
    } catch (error) {
        console.error("List Users Error:", error);
        next(error);
    }
}


async function DeleteUser(req, res, next) {
    try {
        const { id } = req.params;  
        const user = await User.findByPk(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "الموظف غير موجود في قاعدة البيانات" 
            });
        }
        
        await user.destroy();
        
        // نرسل استجابة نجاح JSON للمتصفح
        res.json({ 
            success: true, 
            message: "تم حذف الموظف بنجاح" 
        });

    } catch (error) {
        console.error("Delete User Error:", error);
        // في طلبات الـ API نفضل إرسال JSON حتى في الخطأ
        res.status(500).json({ 
            success: false, 
            message: "فشل الحذف بسبب خطأ داخلي" 
        });
    }
}


async function Login(req, res, next) {
    try {
        const { username, password } = req.body;

        // 1. البحث عن المستخدم
        const user = await User.findOne({ where: { username } });
        if (!user || !user.isActive) {
            const error = new Error("بيانات الدخول غير صحيحة أو الحساب معطل");
            error.status = 401;
            return next(error);
        }

        // 2. التحقق من كلمة المرور
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            const error = new Error("كلمة المرور غير صحيحة");
            error.status = 401;
            return next(error);
        }

        // 3. إنشاء التوكن (JWT)
        const token = jwt.sign(
            { id: user.id, role: user.role }, 
             process.env.JWT_SECRET, 
            { expiresIn: '30d' } 
        );

        // 4. تخزين التوكن في Cookie لسهولة استخدامه في المتصفح
        res.cookie('pixel_token', token, {
            httpOnly: true, // أمان عالي: يمنع الوصول للتوكن عبر JavaScript
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 24 * 60 * 60 * 1000 // يوم واحد
        });

        res.redirect('/'); // التوجه للوحة التحكم

    } catch (error) {
        next(error);
    }
}

export { Register, UpdateUser, ListUsers, DeleteUser, Login };