const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function safeMigrate(migrationName) {
    if (!migrationName) {
        console.error('❌ Please provide a migration name: node prisma/safe-migrate.js <name>');
        process.exit(1);
    }

    try {
        console.log('--- STEP 1: BACKING UP CURRENT DATA ---');
        execSync('node prisma/backup.js', { stdio: 'inherit' });

        // Find the folder we just created
        const backupBase = path.join(__dirname, 'backups');
        const folders = fs.readdirSync(backupBase).sort().reverse();
        const latestBackup = folders[0];
        console.log(`✅ Backup captured in: ${latestBackup}`);

        console.log('\n--- STEP 2: RESETTING DATABASE & APPLYING CHANGES ---');
        // Force reset first to clear interactive prompts, then apply dev migration
        execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { stdio: 'inherit' });
        execSync(`npx prisma migrate dev --name ${migrationName} --skip-seed`, { stdio: 'inherit' });

        console.log('\n--- STEP 3: RESTORING DATA FROM BACKUP ---');
        execSync(`node prisma/restore.js ${latestBackup}`, { stdio: 'inherit' });

        console.log('\n🚀 SAFE MIGRATION COMPLETE! Data synced and schema updated.');

    } catch (err) {
        console.error('\n❌ SAFE MIGRATION FAILED:', err.message);
        console.log('⚠️  Your data is still safe in the prisma/backups folder.');
        process.exit(1);
    }
}

const name = process.argv[2];
safeMigrate(name);
