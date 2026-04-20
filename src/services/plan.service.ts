import prisma from '../config/prisma';

export class PlanService {
    static async createPlan(data: { 
        name: string, 
        rate_per_message: number, 
        min_credits?: number,
        is_active?: boolean,
        use_ios_surcharge?: boolean,
        ios_rate_extra?: number
    }) {
        return await prisma.creditPlan.create({
            data: {
                name: data.name,
                rate_per_message: Number(data.rate_per_message),
                min_credits: Number(data.min_credits || 10000),
                is_active: data.is_active ?? true,
                use_ios_surcharge: data.use_ios_surcharge || false,
                ios_rate_extra: Number(data.ios_rate_extra || 0.10)
            }
        });
    }

    static async getPlans(onlyActive: boolean = false) {
        const where = onlyActive ? { is_active: true } : {};
        return await prisma.creditPlan.findMany({
            where,
            orderBy: { created_at: 'desc' }
        });
    }

    static async updatePlan(id: string, data: Partial<{ 
        name: string, 
        rate_per_message: number, 
        min_credits: number,
        is_active: boolean,
        use_ios_surcharge: boolean,
        ios_rate_extra: number
    }>) {
        return await prisma.creditPlan.update({
            where: { id },
            data: {
                ...data,
                rate_per_message: data.rate_per_message !== undefined ? Number(data.rate_per_message) : undefined,
                min_credits: data.min_credits !== undefined ? Number(data.min_credits) : undefined,
                ios_rate_extra: data.ios_rate_extra !== undefined ? Number(data.ios_rate_extra) : undefined
            }
        });
    }

    static async deletePlan(id: string) {
        return await prisma.creditPlan.delete({
            where: { id }
        });
    }

    static async seedDefaultPlans() {
        const defaults = [
            { name: 'Enterprise', rate: 0.25, min: 100000 },
            { name: 'Pro', rate: 0.28, min: 50000 },
            { name: 'Starter', rate: 0.30, min: 25000 },
            { name: 'Business', rate: 0.35, min: 10000 }
        ];

        for (const plan of defaults) {
            await prisma.creditPlan.upsert({
                where: { name: plan.name },
                update: {
                    rate_per_message: plan.rate,
                    min_credits: plan.min
                },
                create: {
                    name: plan.name,
                    rate_per_message: plan.rate,
                    min_credits: plan.min
                }
            });
        }
    }
}
