import { Router } from 'express';
import { PlanService } from '../services/plan.service';
import { ShortUrlService } from '../services/short-url.service';

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

// Public endpoint for shortening a URL manually
router.post('/shorten', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }
        const shortCode = await ShortUrlService.getOrCreateShortUrl(url);
        const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
        res.json({ success: true, shortUrl: `${baseUrl}/s/${shortCode}`, shortCode });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
