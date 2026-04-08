import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.patch('/profile', authenticate, UserController.updateProfile);
router.patch('/password', authenticate, UserController.updatePassword);
router.patch('/notifications', authenticate, UserController.updateNotifications);
router.post('/2fa/setup', authenticate, UserController.setup2FA);
router.post('/2fa/verify', authenticate, UserController.verify2FA);
router.post('/2fa/disable', authenticate, UserController.disable2FA);
router.get('/2fa/recovery-codes', authenticate, UserController.getRecoveryCodes);
router.post('/2fa/regenerate-codes', authenticate, UserController.regenerateCodes);

export default router;
