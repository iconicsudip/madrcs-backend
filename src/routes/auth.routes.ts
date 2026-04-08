import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authenticate, AuthController.getProfile);
router.post('/refresh', AuthController.refresh);
router.post('/2fa/login', AuthController.verify2FALogin);

export default router;
