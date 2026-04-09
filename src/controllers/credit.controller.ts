import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { Request, Response } from "express";
import Razorpay from "razorpay";

const prisma = new PrismaClient();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export class CreditController {
  static async createRequest(req: Request, res: Response) {
    try {
      const { credits, amount } = req.body;
      const userId = (req as any).user.id;

      if (!credits || !amount) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid credits or amount" });
      }

      // Create Razorpay Order
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `cr_${Date.now()}`,
      });

      // Create Credit Request in DB
      const creditRequest = await prisma.creditRequest.create({
        data: {
          user_id: userId,
          credits: parseInt(credits),
          amount: parseFloat(amount),
          status: "PENDING",
          razorpay_order_id: order.id,
        },
      });

      res.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        requestId: creditRequest.id,
      });
    } catch (error: any) {
      console.error("Create credit request error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async verifyPayment(req: Request, res: Response) {
    try {
      const {
        requestId,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      } = req.body;

      // Simple verification for development (In production, use signature verification)
      const generated_signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

      if (generated_signature !== razorpay_signature) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payment signature" });
      }

      // Update credit request status to PAID
      const creditRequest = await prisma.creditRequest.update({
        where: { id: requestId },
        data: {
          status: "PAID",
          razorpay_payment_id,
          paid_at: new Date(),
        },
        include: { user: true },
      });

      // LOGIC: Notify admin here (e.g., via email or a notification table)
      console.log(
        `[ADMIN NOTIFICATION SENT]: New Credit Recharge of ${creditRequest.credits} credits from ${creditRequest.user.email}. Requires manual approval.`,
      );

      res.json({
        success: true,
        message: "Payment verified successfully. Awaiting admin approval.",
      });
    } catch (error: any) {
      console.error("Verify credit payment error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Admin Action: Approve a credit request and add credits to user balance
  static async approveRequest(req: Request, res: Response) {
    try {
      const requestId = req.params.requestId as string;

      const creditRequest = await prisma.creditRequest.findUnique({
        where: { id: requestId },
        include: { user: true },
      });

      if (!creditRequest || creditRequest.status !== "PAID") {
        return res
          .status(400)
          .json({ success: false, message: "Invalid or unpaid request" });
      }

      // Use transaction to ensure both updates succeed
      await prisma.$transaction([
        prisma.creditRequest.update({
          where: { id: requestId },
          data: {
            status: "APPROVED",
            approved_at: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: creditRequest.user_id },
          data: {
            credit_balance: {
              increment: creditRequest.credits,
            },
          },
        }),
      ]);

      res.json({
        success: true,
        message: "Credit request approved and balance updated.",
      });
    } catch (error: any) {
      console.error("Approve credit request error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getMyRequests(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const requests = await prisma.creditRequest.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
      });
      res.json({ success: true, requests });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllRequests(req: Request, res: Response) {
    try {
      const requests = await prisma.creditRequest.findMany({
        include: { user: true },
        orderBy: { created_at: "desc" },
      });
      res.json({ success: true, requests });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
