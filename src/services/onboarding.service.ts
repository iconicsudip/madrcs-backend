import prisma from '../config/prisma';

export class OnboardingService {
    static async createRequest(userId: string) {
        // Check if a pending request already exists
        const existingRequest = await prisma.onboardingRequest.findFirst({
            where: {
                user_id: userId,
                status: 'PENDING'
            }
        });

        if (existingRequest) {
            throw new Error('Onboarding request already generated. Admin will contact soon.');
        }

        return await prisma.onboardingRequest.create({
            data: {
                user_id: userId,
                status: 'PENDING'
            }
        });
    }

    static async getRequestStatus(userId: string) {
        return await prisma.onboardingRequest.findFirst({
            where: {
                user_id: userId
            },
            orderBy: {
                created_at: 'desc'
            }
        });
    }
}
