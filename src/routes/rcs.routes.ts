import { Router } from 'express';
import { RcsController } from '../controllers/rcs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkCredits } from '../middleware/credit.middleware';
import { ProviderConfigController } from '../controllers/provider-config.controller';

const router = Router();

// Apply auth middleware to protect all RCS routes
router.use(authenticate);

router.get('/provider-config', ProviderConfigController.getConfig);
router.get('/templates', RcsController.getTemplates);
router.post('/templates', RcsController.createTemplate);
router.delete('/templates/:id', RcsController.deleteTemplate);
router.post('/templates/:id/restore', RcsController.restoreTemplate);
router.post('/send', checkCredits, RcsController.sendMessage); //TODO - JioCX
router.get('/logs', RcsController.getLogs); //TODO - JioCX

// Draft templates
router.post('/drafts', RcsController.saveDraft); //TODO - JioCX
router.delete('/drafts/:id', RcsController.deleteDraft); //TODO - JioCX
router.post('/drafts/:id/restore', RcsController.restoreDraft);

// Campaigns
router.get('/campaigns', RcsController.getCampaigns); //TODO - JioCX
router.post('/campaigns', checkCredits, RcsController.createCampaign); //TODO - JioCX
router.get('/campaigns/stats', RcsController.getCampaignStats); //TODO - JioCX
router.get('/campaigns/:id/stats', RcsController.getCampaignStatsSingle); //TODO - JioCX
router.get('/campaigns/:id/events', RcsController.getCampaignEvents); //TODO - JioCX
router.post('/campaigns/:id/resend', checkCredits, RcsController.resendCampaign); //TODO - JioCX
router.get('/activities', RcsController.getActivity); //TODO - JioCX
router.get('/campaigns/volume', RcsController.getVolumeData); //TODO - JioCX
router.patch('/campaigns/:id', RcsController.updateCampaignStatus); //TODO - JioCX

// Number capability check
router.post('/check-capability', RcsController.checkCapability);
router.post('/campaign-precheck', RcsController.campaignPrecheck);

// User Replies
router.get('/user-messages', RcsController.getUserMessages);
router.get('/conversations', RcsController.getConversations);

export default router;
