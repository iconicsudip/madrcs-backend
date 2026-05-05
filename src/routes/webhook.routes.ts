import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * MSG91 RCS delivery reports.
 */
router.post('/rcs/msg91', WebhookController.handleMsg91Rcs);

/**
 * Google RBM Events
 * GET for verification, POST for events
 */
router.get('/rcs/google', WebhookController.verifyGoogleRcs);
router.post('/rcs/google', WebhookController.handleGoogleRcs);

/**
 * Dotgo RCS delivery reports.
 */
router.post('/rcs/dotgo', WebhookController.handleDotgoRcs);

export default router;
