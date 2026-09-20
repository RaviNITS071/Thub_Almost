import 'dotenv/config';
import { backupService } from '../services/backup.service.js';
import { closeDB } from '../config/db.js';

async function run() {
  console.log('🚀 Starting TenderHub Database Backup...');
  try {
    const result = await backupService.createDatabaseBackup();
    console.log('✅ Backup successfully created!');
    console.log(JSON.stringify(result, null, 2));
    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
