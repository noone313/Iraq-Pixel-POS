import { Router } from "express";
import * as productCtrl from '../controllers/Product.controler.js';

const ProductRouter = Router();

// المسارات الأساسية
ProductRouter.get('/products', productCtrl.getAllProducts);
ProductRouter.get('/products/add', productCtrl.renderProductForm);
ProductRouter.get('/products/edit/:id', productCtrl.renderProductForm); // نفس الدالة للتعديل

// عمليات POST/AJAX
ProductRouter.post('/products/add', productCtrl.createProduct);
ProductRouter.post('/products/edit/:id', productCtrl.updateProduct);
ProductRouter.post('/products/delete/:id', productCtrl.deleteProduct);

// المحذوفات
ProductRouter.get('/products/trash', productCtrl.getDeletedProducts);
ProductRouter.post('/products/restore/:id', productCtrl.restoreProduct);

export default ProductRouter;