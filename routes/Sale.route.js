import { Router } from "express";
import { createSale, getSales } from "../controllers/Sale.controller.js";
import { verifyToken } from "../midellwares/auth.middleware.js";
export const SaleRoute = Router();

// --- مسار عرض صفحة نقطة البيع ---
SaleRoute.get('/sales', verifyToken, getSales);

// --- مسار إنشاء بيع جديد ---
SaleRoute.post('/sales/create', verifyToken, createSale);