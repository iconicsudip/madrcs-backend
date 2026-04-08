import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';

/**
 * Middleware to restrict campaign-sending actions if the user has zero credits.
 */
export const checkCredits = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        // Fetch latest credit balance from database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { credit_balance: true }
        });

        if (!user || user.credit_balance <= 0) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient credits. You are not allowed to send campaigns because of low credits. Please recharge to continue.',
                errorCode: 'LOW_CREDITS'
            });
        }

        next();
    } catch (err: any) {
        console.error('[Credit Check Middleware Error]:', err);
        res.status(500).json({ success: false, message: 'Error verifying account credits.' });
    }
};
