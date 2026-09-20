import 'dotenv/config';
import { chromium } from 'playwright';
import { uploadFileToR2, formatTenderStorageKey } from './src/utils/r2Storage.js';
import { connectDB, closeDB } from './src/config/db.js';
import Tender from './src/models/Tender.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function testSingleTender() {
  await connectDB();
  console.log('🚀 Starting 1-Tender In-Session Capture Test...');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized']
  });
  const context = await browser.newContext({ acceptDownloads: true, viewport: null });
  const page = await context.newPage();

  console.log('Navigating to department list...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });

  // Select a department (e.g. DC-PDD or Agriculture)
  const deptLinks = page.locator('table.list_table tr td a');
  const firstDept = deptLinks.first();
  console.log('Opening department:', await firstDept.innerText());
  await firstDept.click();
  await page.waitForLoadState('domcontentloaded');

  // Select first tender
  const tenderLinks = page.locator("table.list_table tr td a[href*='DirectLink']");
  const tenderCount = await tenderLinks.count();
  console.log(`Found ${tenderCount} tenders in this department.`);

  const firstTender = tenderLinks.first();
  console.log('Clicking tender:', await firstTender.innerText());
  await firstTender.click();
  await page.waitForLoadState('domcontentloaded');

  console.log('On Tender Details Page!');

  // Extract tender basic metadata
  const tenderIdMatch = (await page.locator('body').innerText()).match(/Tender ID\s*:\s*([^\n]+)/i) || 
                        (await page.locator('body').innerText()).match(/\[([0-9]{4}_[A-Z]+_[0-9]+_[0-9]+)\]/);
  const tenderId = tenderIdMatch ? tenderIdMatch[1].trim() : `TEST_TENDER_${Date.now()}`;
  const publishedDateText = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll('td'));
    const pubTd = tds.find(t => t.textContent.trim().startsWith('Published Date'));
    return pubTd?.nextElementSibling?.textContent.trim() || new Date().toISOString().split('T')[0];
  });

  const folderKey = formatTenderStorageKey(tenderId, publishedDateText);
  console.log(`📌 Primary Key Directory: tenders/${folderKey}/`);

  const item = {
    sourceTenderId: tenderId,
    publishedDate: publishedDateText,
    r2StorageKey: folderKey,
    pdfUrls: [],
    nitDocuments: [],
    workItemDocuments: [],
    boqFileUrl: null,
  };

  // 1. Download PDF (NIT Notice)
  const pdfLink = page.locator("a:has-text('.pdf'), #docDownoad").first();
  if (await pdfLink.count() > 0) {
    console.log('\n📄 Found PDF link: Clicking to open Captcha download page...');
    await pdfLink.click();
    await page.waitForLoadState('domcontentloaded');

    console.log('\n======================================================');
    console.log(`🔑 [PDF CAPTCHA] Please solve the captcha in the open browser window and click Submit!`);
    console.log('======================================================\n');
    await page.bringToFront().catch(() => {});
    await page.locator("input[name='captchaText'], #captchaText, input[type='text']").first().focus().catch(() => {});

    try {
      const pdfDownload = await page.waitForEvent('download', { timeout: 120000 });
      console.log('✅ PDF download initiated:', pdfDownload.suggestedFilename());
      const tempPdfPath = await pdfDownload.path();
      const pdfFileName = pdfDownload.suggestedFilename() || 'Tendernotice_1.pdf';

      console.log('Uploading PDF to Cloudflare R2 under primary key...');
      const r2Url = await uploadFileToR2({
        filePath: tempPdfPath,
        fileName: pdfFileName,
        tenderId,
        publishedDate: publishedDateText,
        contentType: 'application/pdf',
      });

      if (r2Url) {
        console.log('🎉 PDF Successfully Uploaded to Cloudflare R2:', r2Url);
        item.pdfUrls.push(r2Url);
        item.nitDocuments.push({
          documentName: pdfFileName,
          description: 'TENDER NOTICE',
          fileUrl: r2Url,
        });
      }
    } catch (pdfErr) {
      console.warn('PDF download wait timed out or failed:', pdfErr.message);
    }

    // Go back to Tender Details page
    console.log('Returning to Tender Details page...');
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
  }

  // 2. Download ZIP and Extract .XLS
  const zipLink = page.locator("a:has-text('Download as zip file'), #DirectLink_8").first();
  if (await zipLink.count() > 0) {
    console.log('\n📦 Found "Download as zip file" link: Clicking to open Captcha download page...');
    await zipLink.click();
    await page.waitForLoadState('domcontentloaded');

    console.log('\n======================================================');
    console.log(`🔑 [BOQ ZIP CAPTCHA] Please solve the captcha in the open browser window and click Submit!`);
    console.log('======================================================\n');
    await page.bringToFront().catch(() => {});
    await page.locator("input[name='captchaText'], #captchaText, input[type='text']").first().focus().catch(() => {});

    try {
      const zipDownload = await page.waitForEvent('download', { timeout: 120000 });
      console.log('✅ Zip download initiated:', zipDownload.suggestedFilename());
      const tempZipPath = await zipDownload.path();

      console.log('Reading downloaded zip archive...');
      const zip = new AdmZip(tempZipPath);
      const zipEntries = zip.getEntries();
      console.log(`Zip archive contains ${zipEntries.length} file(s). Searching for .xls / .xlsx...`);

      for (const entry of zipEntries) {
        const lowerName = entry.entryName.toLowerCase();
        if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
          const cleanFileName = entry.name || `BOQ_${tenderId}.xls`;
          const tempExtractPath = path.join(os.tmpdir(), `extracted_${Date.now()}_${cleanFileName}`);
          
          fs.writeFileSync(tempExtractPath, entry.getData());
          console.log(`Extracted BOQ file: ${cleanFileName}`);

          console.log('Uploading .xls to Cloudflare R2 under primary key...');
          const r2Url = await uploadFileToR2({
            filePath: tempExtractPath,
            fileName: cleanFileName,
            tenderId,
            publishedDate: publishedDateText,
            contentType: cleanFileName.endsWith('.xlsx')
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/vnd.ms-excel'
          });

          if (r2Url) {
            console.log('🎉 BOQ XLS Successfully Uploaded to Cloudflare R2:', r2Url);
            item.boqFileUrl = r2Url;
            item.workItemDocuments.push({
              documentType: 'BOQ',
              documentName: cleanFileName,
              description: 'BOQ Schedule',
              fileUrl: r2Url,
            });
          }

          if (fs.existsSync(tempExtractPath)) fs.unlinkSync(tempExtractPath);
        }
      }

      // CRITICAL: Immediately delete local .zip file from disk! Never uploaded to Cloudflare!
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
        console.log('🗑️ Local temporary .zip file deleted from disk.');
      }
    } catch (zipErr) {
      console.warn('Zip download wait timed out or failed:', zipErr.message);
    }
  }

  // Extract tender title
  const tenderTitle = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll('td'));
    const titleTd = tds.find(t => t.textContent.trim().startsWith('Work Description') || t.textContent.trim().startsWith('Tender Title'));
    return titleTd?.nextElementSibling?.textContent.trim() || '';
  });
  item.title = tenderTitle || `Tender ${tenderId}`;

  // Save to MongoDB
  console.log('💾 Saving tender with Cloudflare URLs to MongoDB...');
  const updatedDoc = await Tender.findOneAndUpdate(
    { sourcePortal: 'JK_TENDERS', sourceTenderId: tenderId },
    {
      $set: {
        sourcePortal: 'JK_TENDERS',
        sourceTenderId: tenderId,
        title: item.title,
        publishedDate: item.publishedDate,
        r2StorageKey: folderKey,
        pdfUrls: item.pdfUrls,
        nitDocuments: item.nitDocuments,
        workItemDocuments: item.workItemDocuments,
        boqFileUrl: item.boqFileUrl,
        pdfFetchStatus: item.pdfUrls.length > 0 ? 'COMPLETED' : 'PENDING',
        boqFetchStatus: item.boqFileUrl ? 'COMPLETED' : 'NOT_AVAILABLE',
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log('\n======================================================');
  console.log('🎉 TENDER SAVED TO MONGODB & CLOUDFLARE R2:');
  console.log(`📌 Primary Key Directory: tenders/${folderKey}/`);
  console.log(`📄 PDF URL(s):`, item.pdfUrls);
  console.log(`📊 BOQ XLS URL:`, item.boqFileUrl);
  console.log(`🗄️ MongoDB Document ID:`, updatedDoc._id);
  console.log('======================================================\n');

  await browser.close();
  await closeDB();
}

testSingleTender().catch(e => console.error('Error:', e));
