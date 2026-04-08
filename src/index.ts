import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import onboardingRoutes from './routes/onboarding.routes';
import userRoutes from './routes/user.routes';
import contactRoutes from './routes/contact.routes';
import contactGroupRoutes from './routes/contact-group.routes';
import creditRoutes from './routes/credit.routes';
import adminRoutes from './routes/admin.routes';
import rcsRoutes from './routes/rcs.routes';
import uploadRoutes from './routes/upload.routes';
import publicRoutes from './routes/public.routes';
import webhookRoutes from './routes/webhook.routes';
import { PlanService } from './services/plan.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/webhooks', webhookRoutes); // Publicly accessible for MSG91 reports
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-groups', contactGroupRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rcs', rcsRoutes);
app.use('/api/upload', uploadRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'up', message: 'API is running' });
});

// For development: run once on start after delay
if (process.env.NODE_ENV !== 'production') {
    setTimeout(async () => {
        console.log('[Dev]: Seeding plans...');
        await PlanService.seedDefaultPlans();
    }, 5000);
}

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
