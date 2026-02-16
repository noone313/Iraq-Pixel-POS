import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const verifyToken = (req, res, next) => {
    const token = req.cookies.pixel_token;

    if (!token) {
        return res.redirect('/login'); // إذا لا يوجد توكن، ارجع لصفحة الدخول
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // تخزين بيانات المستخدم المشفرة في الطلب
        next();
    } catch (err) {
        res.clearCookie('pixel_token');
        return res.redirect('/login');
    }
};