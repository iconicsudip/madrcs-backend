import prisma from '../config/prisma'; 

export class SubscriptionService {
    static async markInvoicePaid(invoiceId: string, paymentId: string) {
        return await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    status: 'PAID',
                    razorpay_payment_id: paymentId,
                    updated_at: new Date()
                }
            });

            return invoice;
        });
    }

    static async generateRazorpayInvoice(userId: string, amount: number) {
        console.log(`Generating Razorpay invoice for user ${userId} with amount ${amount}`);
        
        return {
            id: `inv_link_${Date.now()}`,
            orderId: `order_${Date.now()}`,
            url: `https://rzp.io/i/mock_link_${Date.now()}`
        };
    }
}
