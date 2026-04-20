const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function restore(backupTimestamp) {
    if (!backupTimestamp) {
        console.error('❌ Please provide a backup timestamp directory name (e.g., 2026-04-20T08-47-36-581Z)');
        return;
    }

    const backupDir = path.join(__dirname, 'backups', backupTimestamp);

    if (!fs.existsSync(backupDir)) {
        console.error(`❌ Backup directory not found: ${backupDir}`);
        return;
    }

    console.log(`📡 Starting restore from ${backupDir}...`);

    // Order matters for relational integrity
    const models = [
        'creditPlan',
        'user',
        'contactGroup',
        'contact',
        'campaign',
        'activity',
        'creditRequest',
        'onboardingRequest',
        'refreshToken',
        'templateDraft',
        'invoice',
        'campaignEvent'
    ];

    console.log('🧹 Cleaning existing data for fresh restore...');
    for (const model of [...models].reverse()) {
        try {
            await prisma[model].deleteMany({});
        } catch (e) {
            console.log(`⚠️  Could not clear ${model}: ${e.message}`);
        }
    }

    for (const model of models) {
        try {
            const filePath = path.join(backupDir, `${model}.json`);
            if (!fs.existsSync(filePath)) continue;

            console.log(`📥 Restoring ${model}...`);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            for (const item of data) {
                // Use upsert to avoid duplicate key errors if some data exists
                // Note: This assumes models have 'id' fields. Adjust if necessary.
                await prisma[model].upsert({
                    where: { id: item.id },
                    update: item,
                    create: item
                });
            }
        } catch (err) {
            console.error(`❌ Failed to restore ${model}:`, err.message);
        }
    }

    console.log('✅ Restore completed successfully!');
}

const arg = process.argv[2];
restore(arg)
    .catch(err => {
        console.error('CRITICAL RESTORE FAILURE:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
