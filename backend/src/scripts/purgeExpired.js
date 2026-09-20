import 'dotenv/config';
import { retentionService } from '../services/retention.service.js';
import { closeDB } from '../config/db.js';

async function run() {
  console.log('\n======================================================');
  console.log('🧹 Starting Purge of Expired Tenders (Zero Retention Stay)');
  console.log('📍 Primary Storage: MongoDB Atlas & Primary Cloudflare R2');
  console.log('☁️  Backup Server:   Secondary Cloudflare R2');
  console.log('======================================================\n');
  try {
    const result = await retentionService.purgeExpiredTenders('CLI_PURGE');
    console.log('\n🎉 PURGE OPERATION COMPLETED SUCCESSFULLY:');
    console.log(`📋 Expired Tenders Identified: ${result.totalFound}`);
    console.log(`🗄️  Deleted from MongoDB:        ${result.purgedCount}`);
    console.log(`📁 Deleted from Primary R2:     ${result.primaryFilesDeleted || 0} file(s)`);
    console.log(`☁️  Deleted from Backup Server:  ${result.backupFilesDeleted || 0} file(s)`);
    console.log(`🗑️  Total R2 Files Purged:       ${result.totalR2FilesDeleted || 0} file(s)`);
    if (result.backupSweptFolders > 0) {
      console.log(`🧹 Backup Server Swept Folders: ${result.backupSweptFolders}`);
    }
    console.log('\n======================================================\n');
    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Purge failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
