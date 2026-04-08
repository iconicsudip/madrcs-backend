import prisma from '../config/prisma';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { formatPhoneNumber } from '../utils/phone.util';

export class UserService {
    private static readonly userSelect = {
        id: true,
        full_name: true,
        email: true,
        phone_number: true,
        company_name: true,
        bio: true,
        role: true,
        is_verified: true,
        two_fact_enabled: true,
        notification_pref: true,
        credit_plan_id: true,
        credit_plan: true,
        created_at: true
    };

    static async updateProfile(userId: string, data: { full_name?: string; phone_number?: string; company_name?: string; bio?: string }) {
        const updateData: any = { ...data };
        if (updateData.phone_number) {
            updateData.phone_number = formatPhoneNumber(updateData.phone_number);
        }
        
        return await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: this.userSelect
        });
    }

    static async updatePassword(userId: string, currentPass: string, newPass: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const isMatch = await bcrypt.compare(currentPass, user.password);
        if (!isMatch) throw new Error('Incorrect current password');

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPass, salt);

        return await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
    }

    static async updateNotifications(userId: string, preferences: any) {
        return await prisma.user.update({
            where: { id: userId },
            data: { notification_pref: preferences },
            select: this.userSelect
        });
    }

    static async setup2FA(userId: string) {
        const secret = speakeasy.generateSecret({
            name: `MadRCS Account`
        });

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl
        };
    }

    static async verifyAndEnable2FA(userId: string, token: string, secret: string) {
        const verified = speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token
        });

        if (!verified) throw new Error('Invalid verification code');

        return await prisma.user.update({
            where: { id: userId },
            data: {
                two_fact_enabled: true,
                two_fact_secret: secret
            },
            select: this.userSelect
        });
    }

    static async disable2FA(userId: string) {
        return await prisma.user.update({
            where: { id: userId },
            data: {
                two_fact_enabled: false,
                two_fact_secret: null,
                recovery_codes: []
            },
            select: this.userSelect
        });
    }

    static async getRecoveryCodes(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { recovery_codes: true }
        });

        if (user && user.recovery_codes.length > 0) {
            return user.recovery_codes;
        }

        // Generate new if none exist
        return await this.regenerateRecoveryCodes(userId);
    }

    static async regenerateRecoveryCodes(userId: string) {
        const crypto = require('crypto');
        const newCodes = Array.from({ length: 10 }, () => 
            crypto.randomBytes(4).toString('hex').toUpperCase()
        );

        await prisma.user.update({
            where: { id: userId },
            data: { recovery_codes: newCodes }
        });

        return newCodes;
    }
}
