import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminFullName = process.env.ADMIN_FULL_NAME || 'System Admin';
    const adminPhone = process.env.ADMIN_PHONE || '+910000000000';

    if (!adminEmail || !adminPassword) {
        console.error('❌ Error: ADMIN_EMAIL or ADMIN_PASSWORD not found in environment variables.');
        process.exit(1);
    }

    console.log(`🔍 Checking if admin user exists: ${adminEmail}`);

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail }
    });

    if (existingAdmin) {
        console.log('⚠️ Admin user already exists. Skipping creation.');
    } else {
        console.log('✨ Creating admin user...');
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminPassword, salt);

        const admin = await prisma.user.create({
            data: {
                full_name: adminFullName,
                email: adminEmail,
                password: hashedPassword,
                phone_number: adminPhone,
                role: 'admin',
                is_verified: true,
                credit_balance: 1000000 // Give admin some initial credits
            }
        });

        console.log('✅ Admin user created successfully:', admin.email);
    }

    // You can add more seeding logic here (e.g., initial plans)
    console.log('🌱 Seeding matching Initial Plans...');
    
    const plans = [
        { name: 'Starter', rate_per_message: 0.50, min_credits: 5000 },
        { name: 'Business', rate_per_message: 0.35, min_credits: 25000 },
        { name: 'Enterprise', rate_per_message: 0.25, min_credits: 100000 }
    ];

    for (const plan of plans) {
        await prisma.creditPlan.upsert({
            where: { name: plan.name },
            update: {},
            create: plan
        });
    }
    
    console.log('✅ Initial plans seeded.');
    console.log('🏁 Seeding completed.');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
