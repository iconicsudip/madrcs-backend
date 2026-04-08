import { Request, Response, NextFunction } from 'express';

import prisma from '../config/prisma';

export const checkSubscription = async (req: Request, res: Response, next: NextFunction) => {
    const userPayload = (req as any).user;

    if (!userPayload) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userPayload.id },
            select: { id: true}
        });

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Add user status to request for convenience
        (req as any).userStatus = user;

        next();
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
