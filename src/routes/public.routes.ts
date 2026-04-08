import { Router } from 'express';
import { PlanService } from '../services/plan.service';

const router = Router();

// Public endpoint for pricing plans
router.get('/plans', async (req, res) => {
    try {
        const plans = await PlanService.getPlans();
        res.json({ success: true, plans });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
