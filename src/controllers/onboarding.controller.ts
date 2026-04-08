import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';

export class OnboardingController {
    static async requestOnboarding(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const onboardingRequest = await OnboardingService.createRequest(userId);
            res.status(201).json({ 
                success: true, 
                message: 'Onboarding request generated. Admin will contact soon.',
                data: onboardingRequest 
            });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static async getStatus(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const status = await OnboardingService.getRequestStatus(userId);
            res.status(200).json({ success: true, data: status });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
}
