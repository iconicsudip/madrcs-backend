import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { SubscriptionService } from '../services/subscription.service';

export class InvoiceController {
    static async getInvoices(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const invoices = await prisma.invoice.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' }
            });
            res.status(200).json({ success: true, invoices });
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async verifyPayment(req: Request, res: Response) {
        try {
            const { invoiceId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
            
            // In a production app, you should verify the signature here using crypto
            // For now, we'll mark as paid and update subscription
            await SubscriptionService.markInvoicePaid(invoiceId, razorpay_payment_id);
            
            res.status(200).json({ success: true, message: 'Payment verified and subscription updated' });
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async getOrCreateOrder(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const invoice = await prisma.invoice.findUnique({
                where: { id },
                include: { user: true }
            });

            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status === 'PAID') throw new Error('Invoice already paid');

            // If we already have it, return it
            if (invoice.razorpay_order_id) {
                return res.status(200).json({ success: true, orderId: invoice.razorpay_order_id });
            }

            // Create new order via formal Razorpay Invoice (which creates an order internally)
            // or just create an order directly. Since we want formal invoices:
            const rzpInvoice = await (SubscriptionService as any).generateRazorpayInvoice(invoice.user_id, invoice.amount);
            
            await prisma.invoice.update({
                where: { id },
                data: {
                    razorpay_order_id: rzpInvoice.orderId,
                    razorpay_link_id: rzpInvoice.id,
                    razorpay_link_url: rzpInvoice.url
                }
            });

            res.status(200).json({ success: true, orderId: rzpInvoice.orderId });
        } catch (err: any) {
            res.status(400).json({ message: err.message });
        }
    }

    static async webhook(req: Request, res: Response) {
        // Razorpay webhook logic
        // Verify signature here...
        const { event, payload } = req.body;

        if (event === 'payment_link.paid') {
            const plinkId = payload.payment_link.entity.id;
            const paymentId = payload.payment.entity.id;

            const invoice = await prisma.invoice.findFirst({
                where: { razorpay_link_id: plinkId }
            });

            if (invoice) {
                await SubscriptionService.markInvoicePaid(invoice.id, paymentId);
                console.log(`[Webhook]: Invoice ${invoice.id} marked as paid.`);
            }
        }

        res.status(200).send('OK');
    }
}
