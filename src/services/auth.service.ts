import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { User, AuthResponse } from '../types';
import { formatPhoneNumber } from '../utils/phone.util';

export class AuthService {
    private static readonly JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
    private static readonly ACCESS_TOKEN_EXPIRY = '15m';
    private static readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

    static async register(userData: Partial<User>): Promise<AuthResponse> {
        const { full_name, email, phone_number, password } = userData;

        if (!email || !password || !full_name || !phone_number) {
            throw new Error('Missing required fields');
        }

        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) throw new Error('User already exists');

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const formattedPhone = formatPhoneNumber(phone_number);

        const newUser = await prisma.user.create({
            data: {
                full_name,
                email,
                phone_number: formattedPhone,
                password: hashedPassword,
                role: 'user'
            }
        });

        const { token, refreshToken } = await this.generateTokens(newUser.id);
        
        const { password: _, ...userWithoutPassword } = newUser;

        return { token, refreshToken, user: userWithoutPassword as any };
    }

    static async login(email: string, password: string): Promise<AuthResponse> {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) throw new Error('Invalid credentials');

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new Error('Invalid credentials');

        if (user.two_fact_enabled) {
            return { mfaRequired: true, userId: user.id };
        }

        const { token, refreshToken } = await this.generateTokens(user.id);
        const { password: _, ...userWithoutPassword } = user;

        return { token, refreshToken, user: userWithoutPassword as any };
    }

    static async verify2FALogin(userId: string, token: string): Promise<AuthResponse> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.two_fact_secret) throw new Error('Authentication failed');

        const verified = require('speakeasy').totp.verify({
            secret: user.two_fact_secret,
            encoding: 'base32',
            token
        });

        if (!verified) throw new Error('Invalid verification code');

        const { token: accessToken, refreshToken } = await this.generateTokens(user.id);
        const { password: _, ...userWithoutPassword } = user;

        return { token: accessToken, refreshToken, user: userWithoutPassword as any };
    }

    static async refreshSession(providedRefreshToken: string): Promise<{ token: string; refreshToken: string }> {
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: providedRefreshToken }
        });

        if (!storedToken) throw new Error('Invalid refresh token');
        if (new Date() > storedToken.expires_at) {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
            throw new Error('Refresh token expired');
        }

        // Rotate token
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return await this.generateTokens(storedToken.user_id);
    }

    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                full_name: true,
                email: true,
                role: true,
                is_verified: true,
                phone_number: true,
                created_at: true,
                company_name: true,
                bio: true,
                msg91_project_id: true,
                two_fact_enabled: true,
                notification_pref: true,
                credit_plan: true,
                credit_balance: true
            }
        });

        if (!user) throw new Error('User not found');

        return {
            ...user,
            campaign_disabled: (user.credit_balance || 0) <= 0
        };
    }

    private static async generateTokens(userId: string): Promise<{ token: string; refreshToken: string }> {
        const token = jwt.sign({ id: userId }, this.JWT_SECRET, { expiresIn: this.ACCESS_TOKEN_EXPIRY });
        
        const refreshTokenStr = uuidv4();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

        await prisma.refreshToken.create({
            data: {
                token: refreshTokenStr,
                user_id: userId,
                expires_at: expiresAt
            }
        });

        return { token, refreshToken: refreshTokenStr };
    }
}
