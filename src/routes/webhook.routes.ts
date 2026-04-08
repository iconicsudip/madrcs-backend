import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Publicly accessible webhook for MSG91 RCS delivery reports.
 * Should be configured as its own route in entry (e.g., /api/webhooks).
 */
router.post('/rcs/msg91', WebhookController.handleMsg91Rcs);

export default router;
