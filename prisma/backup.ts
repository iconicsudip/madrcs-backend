import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, 'backups', timestamp);

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const models = [
        'user',
        'activity',
        'campaign',
        'contactGroup',
        'contact',
        'creditRequest',
        'onboardingRequest',
        'refreshToken',
        'templateDraft',
        'creditPlan',
        'invoice',
        'campaignEvent'
    ];

    console.log(`🚀 Starting backup to ${backupDir}...`);

    for (const model of models) {
        try {
            console.log(`📦 Backing up ${model}...`);
            // @ts-ignore
            const data = await prisma[model].findMany();
            fs.writeFileSync(
                path.join(backupDir, `${model}.json`),
                JSON.stringify(data, null, 2)
            );
        } catch (err: any) {
            console.error(`❌ Failed to backup ${model}:`, err.message);
        }
    }

    console.log('✅ Backup completed successfully!');
}

backup()
    .catch(err => {
        console.error('CRITICAL BACKUP FAILURE:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
