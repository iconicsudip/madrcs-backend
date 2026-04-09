import { Router } from 'express';
import { PlanService } from '../services/plan.service';
import { AdminService } from '../services/admin.service';
import { CreditController } from '../controllers/credit.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Middleware to ensure admin only
const checkAdmin = (req: any, res: any, next: any) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        // For development/demo, some systems don't have roles implemented fully
        // if (process.env.NODE_ENV !== 'production') return next();
        res.status(403).json({ message: 'Admin access required' });
    }
};

router.use(authenticate);
// router.use(checkAdmin); // Uncomment when admin roles are set up for real

// Credit Plans
router.get('/plans', async (req, res) => {
    try {
        const plans = await PlanService.getPlans();
        res.json({ success: true, plans });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/plans', async (req, res) => {
    try {
        const plan = await PlanService.createPlan(req.body);
        res.json({ success: true, plan });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/plans/:id', async (req, res) => {
    try {
        const plan = await PlanService.updatePlan(req.params.id, req.body);
        res.json({ success: true, plan });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await AdminService.getUsers();
        res.json({ success: true, users });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/users', async (req, res) => {
    try {
        const user = await AdminService.createUserByAdmin(req.body);
        res.json({ success: true, user });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/users/:userId/project-id', async (req, res) => {
    try {
        const { msg91_project_id } = req.body;
        if (!msg91_project_id) throw new Error('Project ID is required');
        const user = await AdminService.updateMsg91ProjectId(req.params.userId, msg91_project_id);
        res.json({ success: true, message: 'RCS Project ID updated successfully', user });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});


router.post('/approve-onboarding', async (req, res) => {
    const { userId, planId, requestId, msg91ProjectId } = req.body;
    try {
        await AdminService.approveUserOnboarding(userId, planId, msg91ProjectId);
        if (requestId) {
            await AdminService.updateOnboardingRequest(requestId, 'APPROVED', 'Onboarding completed and plan assigned.');
        }
        res.json({ success: true, message: 'User approved and plan assigned.' });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

// Credit Management
router.get('/credits', CreditController.getAllRequests);
router.post('/credits/approve/:requestId', CreditController.approveRequest);

// Financial Reports
router.get('/finance', async (req, res) => {
    try {
        const stats = await AdminService.getFinancialStats();
        res.json({ success: true, stats });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

export default router;
