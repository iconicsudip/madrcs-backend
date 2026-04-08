import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
    static async updateProfile(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const user = await UserService.updateProfile(userId, req.body);
            res.status(200).json({ success: true, user });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async updatePassword(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { currentPassword, newPassword } = req.body;
            await UserService.updatePassword(userId, currentPassword, newPassword);
            res.status(200).json({ success: true, message: 'Password updated successfully' });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async updateNotifications(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { preferences } = req.body;
            const user = await UserService.updateNotifications(userId, preferences);
            res.status(200).json({ success: true, user });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async setup2FA(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const result = await UserService.setup2FA(userId);
            res.status(200).json({ success: true, ...result });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async verify2FA(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { token, secret } = req.body;
            const user = await UserService.verifyAndEnable2FA(userId, token, secret);
            res.status(200).json({ success: true, user });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async disable2FA(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const user = await UserService.disable2FA(userId);
            res.status(200).json({ success: true, user });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async getRecoveryCodes(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const codes = await UserService.getRecoveryCodes(userId);
            res.status(200).json({ success: true, codes });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async regenerateCodes(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const codes = await UserService.regenerateRecoveryCodes(userId);
            res.status(200).json({ success: true, codes });
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }
}
