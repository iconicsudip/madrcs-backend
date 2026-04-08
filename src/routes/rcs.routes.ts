import { Router } from 'express';
import { RcsController } from '../controllers/rcs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkCredits } from '../middleware/credit.middleware';

const router = Router();

// Apply auth middleware to protect all RCS routes
router.use(authenticate);

router.get('/templates', RcsController.getTemplates);
router.post('/templates', RcsController.createTemplate);
router.post('/send', checkCredits, RcsController.sendMessage);
router.get('/logs', RcsController.getLogs);

// Draft templates
router.post('/drafts', RcsController.saveDraft);
router.get('/drafts', RcsController.getDrafts);
router.delete('/drafts/:id', RcsController.deleteDraft);

// Campaigns
router.get('/campaigns/check-name', RcsController.checkCampaignName);
router.get('/campaigns', RcsController.getCampaigns);
router.post('/campaigns', checkCredits, RcsController.createCampaign);
router.get('/campaigns/stats', RcsController.getCampaignStats);
router.get('/campaigns/:id/stats', RcsController.getCampaignStatsSingle);
router.get('/campaigns/:id/events', RcsController.getCampaignEvents);
router.post('/campaigns/:id/resend', checkCredits, RcsController.resendCampaign);
router.get('/activities', RcsController.getActivity);
router.get('/campaigns/volume', RcsController.getVolumeData);
router.patch('/campaigns/:id', RcsController.updateCampaignStatus);

export default router;
