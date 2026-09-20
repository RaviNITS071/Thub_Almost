import 'dotenv/config';
import { backupService } from '../services/backup.service.js';
import { closeDB } from '../config/db.js';

async function run() {
  console.log('🔄 Starting TenderHub Database Restore (Disaster Recovery Relaunch)...');
  const targetPath = process.argv[2] || null;
  try {
    const result = await backupService.restoreDatabaseFromBackup(targetPath);
    console.log('🎉 Database successfully restored!');
    console.log(JSON.stringify(result, null, 2));
    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Restore failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
