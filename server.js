import express from 'express';
import cookieParser from 'cookie-parser';
import { startServer } from './models/models.js';

import { HomeRoute } from './routes/Home.route.js';
import  dashboardRouter  from './routes/Report.route.js';
import RegisterRoute from './routes/RegisterRoute.js';
import { CategoryRoute } from './routes/Category.route.js';
import ProductRoute from './routes/Product.route.js';
import { SaleRoute } from './routes/Sale.route.js';
import { CustomerRoute } from './routes/Customers.route.js';
import { PurchaseRoute } from './routes/Purchese.route.js';
import supplierRouter from './routes/Supplier.route.js';

const app = express();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
// في ملف app.js
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});


// --- . تسجيل المسارات (Routes) ---

app.use('/', HomeRoute);
app.use('/', RegisterRoute);
app.use('/',CategoryRoute);
app.use('/', ProductRoute);  
app.use('/',SaleRoute);   
app.use('/', CustomerRoute);    
app.use('/', PurchaseRoute);
app.use('/',supplierRouter);
app.use('/', dashboardRouter);



// ---. معالجة خطأ 404 (يتم الوصول إليه فقط إذا لم يتطابق أي مسار أعلاه) ---
app.use((req, res, next) => {
    res.status(404).render('error', { 
        status: 404, 
        message: 'عذراً، الصفحة التي تبحث عنها غير موجودة في نظام Pixel Iraq.' 
    });
});


// معالجة خطأ 400
app.use((err, req, res, next) => {
    if (err.status === 400) {
        return res.status(400).render('error', { 
            status: 400, 
            message: err.message || 'بيانات الإدخال غير صحيحة، يرجى المحاولة مرة أخرى.',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
    next(err); 
});

// معالجة خطأ 500 والـ Catch-all
app.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    console.error(`[Pixel Error ${statusCode}]: `, err.stack); 

    res.status(statusCode).render('error', { 
        status: statusCode, 
        message: statusCode === 500 ? 'حدث خطأ داخلي في النظام، فريق بكسل العراق يعمل على إصلاحه.' : err.message,
        error: process.env.NODE_ENV === 'development' ? err : {} 
    });
});










// تشغيل السيرفر
startServer().then(() => {
    app.listen(3000, () => {
        console.log("🚀 Pixel Iraq Server: http://localhost:3000");
    });
});