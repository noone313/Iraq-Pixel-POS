import {Router} from 'express';
import { DeleteUser, ListUsers, Login, Register, UpdateUser } from '../controllers/user.controller.js';
import { User } from '../models/models.js';
import { verifyToken } from '../midellwares/auth.middleware.js';

const RegisterRoute = Router();



RegisterRoute.get('/register', (req, res) => {
    res.render('register', { 
        mode: 'create', 
        user: {} // كائن فارغ
    });
});

RegisterRoute.post('/register', Register);


RegisterRoute.get('/update-user/:id',verifyToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);
        
        if (!user) {
            const error = new Error("الموظف غير موجود");
            error.status = 404;
            return next(error);
        }

        // نرسل متغير mode ليحدد شكل الصفحة
        res.render('register', { 
            mode: 'edit', 
            user: user 
        });
    } catch (error) {
        next(error);
    }
});



RegisterRoute.post('/update-user/:id', verifyToken, UpdateUser);



RegisterRoute.delete('/delete-user/:id', verifyToken, DeleteUser);


RegisterRoute.get('/users',verifyToken, ListUsers);


RegisterRoute.get('/login', (req, res) => {
    res.render('login');
});


RegisterRoute.post('/login', Login);




export default RegisterRoute;