import { Op } from 'sequelize';
// أضفنا استيراد sequelize هنا لكي يعمل السطر الخاص بـ lowStock
import {  Sale, Product, Debt, sequelize } from '../models/models.js';





async function Home(req,res) {
    try {
        // جلب البيانات مع معالجة حالة القيمة null (إذا كانت الجداول فارغة)
        const totalSales = (await Sale.sum('total')) || 0;
        const productsCount = await Product.count();
        
        // هنا كان الخطأ، الآن sequelize معرف لأنه تم استيراده من الأعلى
        const lowStock = await Product.count({ 
            where: { 
                currentStock: { [Op.lte]: sequelize.col('minStockLevel') } 
            } 
        });
        
        const totalDebt = (await Debt.sum('remainingAmount', { where: { type: 'CUSTOMER' } })) || 0;

        res.render('dashboard', {
            stats: { totalSales, productsCount, lowStock, totalDebt }
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).send("خطأ في تحميل البيانات");
    }
}



export { Home };