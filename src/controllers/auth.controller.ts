import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import prisma from '../config/prisma';

export class AuthController {
    static async register(req: Request, res: Response): Promise<void> {
        try {
            const { full_name, email, phone_number, password } = req.body;
            const result = await AuthService.register({ full_name, email, phone_number, password });
            
            // Log activity
            if (result.user) {
                await prisma.activity.create({
                    data: {
                        user_id: result.user.id,
                        type: 'SIGNUP',
                        title: 'Welcome to MadRCS!',
                        description: `Account created with email ${email}`,
                        color: '#8b5cf6'
                    }
                });
            }

            res.status(201).json(result);
        } catch (err: any) {
            console.error(err);
            res.status(400).json({ message: err.message });
        }
    }

    static async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;
            const result = await AuthService.login(email, password);
            
            // Log activity
            if (result.user) {
                await prisma.activity.create({
                    data: {
                        user_id: result.user.id,
                        type: 'LOGIN',
                        title: 'System Login',
                        description: 'Logged into the RCS Dashboard',
                        color: '#3b82f6'
                    }
                });
            }

            res.status(200).json(result);
        } catch (err: any) {
            console.error(err);
            res.status(401).json({ message: err.message });
        }
    }

    static async getProfile(req: Request, res: Response): Promise<void> {
        try {
            const userId = (req as any).user.id;
            const user = await AuthService.getProfile(userId);
            res.status(200).json({ success: true, user });
        } catch (err: any) {
            console.error(err);
            res.status(401).json({ message: err.message });
        }
    }

    static async refresh(req: Request, res: Response): Promise<void> {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) throw new Error('Refresh token is required');
            const result = await AuthService.refreshSession(refreshToken);
            res.status(200).json(result);
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    static async verify2FALogin(req: Request, res: Response): Promise<void> {
        try {
            const { userId, token } = req.body;
            if (!userId || !token) throw new Error('Missing requirements');
            const result = await AuthService.verify2FALogin(userId, token);
            res.status(200).json(result);
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }
}
