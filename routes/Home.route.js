import { Router } from "express";
import { Home } from "../controllers/Home.controler.js";
import { verifyToken } from "../midellwares/auth.middleware.js";

const HomeRoute = Router();

HomeRoute.get('/', verifyToken, Home);

export { HomeRoute };