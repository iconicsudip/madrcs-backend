import prisma from '../config/prisma';

export class PlanService {
    static async createPlan(data: { name: string, rate_per_message: number, min_credits?: number }) {
        return await prisma.creditPlan.create({
            data: {
                name: data.name,
                rate_per_message: data.rate_per_message,
                min_credits: data.min_credits || 10000
            }
        });
    }

    static async getPlans() {
        return await prisma.creditPlan.findMany({
            orderBy: { rate_per_message: 'asc' }
        });
    }

    static async updatePlan(id: string, data: Partial<{ name: string, rate_per_message: number, min_credits: number }>) {
        return await prisma.creditPlan.update({
            where: { id },
            data
        });
    }

    static async deletePlan(id: string) {
        return await prisma.creditPlan.delete({
            where: { id }
        });
    }

    static async seedDefaultPlans() {
        const defaults = [
            { name: 'Starter', rate: 0.30 },
            { name: 'Pro', rate: 0.28 },
            { name: 'Enterprise', rate: 0.25 }
        ];

        for (const plan of defaults) {
            await prisma.creditPlan.upsert({
                where: { name: plan.name },
                update: {},
                create: {
                    name: plan.name,
                    rate_per_message: plan.rate
                }
            });
        }
    }
}
