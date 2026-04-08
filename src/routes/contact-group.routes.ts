import { Router } from 'express';
import { ContactGroupController } from '../controllers/contact-group.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkSubscription } from '../middleware/subscription.middleware';

const router = Router();

// All group routes require authentication & subscription
router.use(authenticate);
router.use(checkSubscription);

router.get('/', ContactGroupController.getGroups);
router.post('/', ContactGroupController.createGroup);
router.put('/:id', ContactGroupController.updateGroup);
router.delete('/:id', ContactGroupController.deleteGroup);
router.post('/:id/contacts', ContactGroupController.addContactsToGroup);
router.delete('/:id/contacts', ContactGroupController.removeContactsFromGroup);

export default router;
