import 'dotenv/config';
import { backupService } from '../services/backup.service.js';
import { closeDB } from '../config/db.js';

async function run() {
  const specificPath = process.argv[2] || null;

  console.log('\n======================================================');
  console.log('🔄 Initiating 1-Click Full Disaster Recovery Restore...');
  console.log('📦 Restoring: Complete MongoDB JSON Data + All Cloudflare Documents');
  if (specificPath) {
    console.log(`📍 Archive Target: ${specificPath}`);
  } else {
    console.log('📍 Archive Target: Latest available backup (tenderhub_full_latest.zip)');
  }
  console.log('======================================================\n');

  try {
    const result = await backupService.restoreFullBackup(specificPath);
    console.log('\n======================================================');
    console.log('🎉 FULL SYSTEM RESTORE COMPLETED SUCCESSFULLY!');
    console.log(`📍 Restored From: ${result.restoredFrom}`);
    console.log(`🗄️ Database Collections Restored:`, result.database.collections);
    console.log(`📄 Cloudflare R2 Documents Restored: ${result.documentsRestored} files`);
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Full restore failed:', err);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
