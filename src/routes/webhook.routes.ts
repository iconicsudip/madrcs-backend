import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Generic routes to handle all providers dynamically (/rcs/msg91, /rcs/jiocx)
 */
router.get('/rcs/:provider', WebhookController.verifyGenericRcs);
router.post('/rcs/:provider', WebhookController.handleGenericRcs);

/**
 * Catch-all route for any other webhooks
 */
router.all('/*', WebhookController.handleUnknownWebhook);

export default router;
