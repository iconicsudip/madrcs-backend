import { Router } from 'express';
import { CreditController } from '../controllers/credit.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// User Actions
router.post('/request', authenticate, CreditController.createRequest);
router.post('/verify', authenticate, CreditController.verifyPayment);
router.get('/my-requests', authenticate, CreditController.getMyRequests);


// Admin Action (Simplified: In production, add isAdmin middleware)
router.post('/approve/:requestId', authenticate, CreditController.approveRequest);

export default router;
