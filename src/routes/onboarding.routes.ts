import { Router } from 'express';
import { OnboardingController } from '../controllers/onboarding.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/request', authenticate, OnboardingController.requestOnboarding.bind(OnboardingController));
router.get('/status', authenticate, OnboardingController.getStatus.bind(OnboardingController));

export default router;
