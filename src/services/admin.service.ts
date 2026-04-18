import bcrypt from "bcrypt";
import prisma from "../config/prisma";
import { formatPhoneNumber } from "../utils/phone.util";

export class AdminService {
  static async getUsers() {
    return await prisma.user.findMany({
      include: { credit_plan: true },
      orderBy: { created_at: "desc" },
    });
  }

  static async createUserByAdmin(userData: any) {
    const { full_name, email, phone_number, password, planId, credit_balance } =
      userData;

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) throw new Error("User with this email already exists");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const formattedPhone = formatPhoneNumber(phone_number);

    return await prisma.user.create({
      data: {
        full_name,
        email,
        phone_number: formattedPhone,
        password: hashedPassword,
        credit_plan_id: planId,
        credit_balance: credit_balance || 0,
        is_verified: true, // Admin created users are verified by default
        role: "user",
      },
    });
  }

  static async updateUserByAdmin(id: string, userData: any) {
    const { full_name, email, phone_number, password, planId, credit_balance, msg91_project_id, is_verified } = userData;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) throw new Error("User not found");

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) throw new Error("Email already in use by another user");
    }

    const updateData: any = {
      full_name,
      email,
      phone_number: phone_number ? formatPhoneNumber(phone_number) : undefined,
      credit_plan_id: planId,
      credit_balance: credit_balance !== undefined ? credit_balance : undefined,
      msg91_project_id,
      is_verified
    };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateData.password = hashedPassword;
    }

    // Filter out undefined values to avoid Prisma errors if some fields aren't provided
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    return await prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  static async approveUserOnboarding(userId: string, planId: string, msg91ProjectId?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // Check if plan exists
    const plan = await prisma.creditPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error("Credit plan not found");

    // Update user: verify and assign plan
    return await prisma.user.update({
      where: { id: userId },
      data: {
        is_verified: true,
        credit_plan_id: planId,
        msg91_project_id: msg91ProjectId
      },
    });
  }

  static async updateOnboardingRequest(
    requestId: string,
    status: "APPROVED" | "REJECTED",
    message?: string,
  ) {
    return await prisma.onboardingRequest.update({
      where: { id: requestId },
      data: {
        status,
        message,
        updated_at: new Date(),
      },
    });
  }

  static async updateMsg91ProjectId(userId: string, msg91ProjectId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    return await prisma.user.update({
      where: { id: userId },
      data: {
        msg91_project_id: msg91ProjectId,
      },
    });
  }

  static async getFinancialStats() {
    // 1. Revenue from Credit Purchases (Recharges)
    const approvedCredits = await prisma.creditRequest.aggregate({
      where: { status: "APPROVED" },
      _sum: { amount: true },
    });

    const totalRevenue = approvedCredits._sum.amount || 0;

    // 2. Monthly Revenue (Last 6 Months) from Credit Purchases
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyCredits = await prisma.creditRequest.findMany({
      where: {
        status: "APPROVED",
        approved_at: { gte: sixMonthsAgo },
      },
      select: {
        amount: true,
        approved_at: true,
      },
    });

    // Group by month
    const revenueByMonth = monthlyCredits.reduce((acc: any, credit) => {
      if (!credit.approved_at) return acc;
      const month = credit.approved_at.toLocaleString("default", {
        month: "short",
      });
      acc[month] = (acc[month] || 0) + credit.amount;
      return acc;
    }, {});

    // 3. Razorpay Balance Estimate
    let razorpayBalance = totalRevenue * 0.98; // Estimated after fee

    return {
      totalRevenue,
      razorpayBalance,
      revenueByMonth: Object.keys(revenueByMonth).map((month) => ({
        month,
        amount: revenueByMonth[month],
      })),
    };
  }
}
