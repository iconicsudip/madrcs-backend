import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkSubscription } from '../middleware/subscription.middleware';

const router = Router();

// All contact routes require authentication & active subscription
router.use(authenticate);
router.use(checkSubscription);

router.get('/', ContactController.getContacts);
router.post('/', ContactController.createContact);
router.post('/import', ContactController.importContacts);
router.delete('/:id', ContactController.deleteContact);
router.post('/batch-delete', ContactController.batchDelete);

export default router;
