import 'dotenv/config';
import { backupService } from '../services/backup.service.js';
import { closeDB } from '../config/db.js';

async function run() {
  console.log('\n======================================================');
  console.log('🚀 Initiating Full Disaster Recovery Backup...');
  console.log('📦 Includes: Complete MongoDB JSON Data + All Cloudflare Documents');
  console.log('======================================================\n');

  try {
    const result = await backupService.createFullBackup();
    console.log('\n======================================================');
    console.log('🎉 FULL SYSTEM BACKUP COMPLETED SUCCESSFULLY!');
    console.log(`📁 Archive Created: ${result.archiveFile}`);
    console.log(`📍 Local File Path: ${result.archivePath}`);
    console.log(`⚡ Pointer to Latest: ${result.latestPath}`);
    console.log(`💾 Size: ${result.sizeMB} MB (Completed in ${result.durationSeconds}s)`);
    console.log(`🗄️ Database: ${result.manifest.database.totalDocuments} documents across ${result.manifest.database.totalCollections} collections`);
    console.log(`📄 Cloudflare Documents: ${result.manifest.documents.totalFiles} files (${result.manifest.documents.totalMB} MB)`);
    if (result.secondaryR2Upload?.success) {
      console.log(`☁️ Mirrored to Secondary Cloudflare R2: ${result.secondaryR2Upload.key}`);
    } else {
      console.log('ℹ️ Secondary Cloudflare mirroring: Preserved on local disk and OneDrive.');
    }
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Full backup failed:', err);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
