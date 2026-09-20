import 'dotenv/config';
import { chromium } from 'playwright';
import { uploadFileToR2, uploadJsonToR2, formatTenderStorageKey, extractDeptCode } from './src/utils/r2Storage.js';
import { connectDB, closeDB } from './src/config/db.js';
import Tender from './src/models/Tender.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Robust Captcha Resolver & Downloader:
 * - Listens for direct download (zero captcha when session unlocked)
 * - If captcha is presented, gives user complete calm time (no 2-second rush)
 * - Listens for user pressing Enter or clicking Submit
 * - Detects invalid captcha errors and allows retry
 */
async function solveCaptchaAndCaptureDownload(page, tenderId, docType, existingDownloadPromise = null) {
  const inputLocator = page.locator("input[name='captchaText'], #captchaText, input[type='text']").first();
  const hasInput = await inputLocator.count();

  if (hasInput > 0) {
    console.log('\n======================================================');
    console.log(`🔑 [${docType} CAPTCHA] Tender: ${tenderId}`);
    console.log(`👉 In the open browser window: Type the captcha characters.`);
    console.log(`👉 Take all the time you need. Press ENTER or click SUBMIT when ready.`);
    console.log('======================================================\n');

    await page.bringToFront().catch(() => {});
    await inputLocator.focus().catch(() => {});
  } else {
    console.log(`ℹ️ Waiting for ${docType} download to start...`);
  }

  const downloadPromise = existingDownloadPromise || page.waitForEvent('download', { timeout: 300000 }).catch(() => null);

  try {
    const dl = await downloadPromise;
    if (dl) {
      console.log(`✅ ${docType} download captured: ${dl.suggestedFilename()}`);
      return dl;
    }
  } catch (err) {
    console.warn(`⚠️ Download wait timed out or failed: ${err.message}`);
  }

  return null;
}

/**
 * Cleanly processes a single tender in its own dedicated page (tab):
 * - Extracts official canonical Tender ID and exact metadata
 * - Checks deduplication (replaces old data in-place, zero duplicates)
 * - Downloads PDF Notice and BOQ Zip
 * - Extracts .xls, uploads to R2 under primary key, discards .zip immediately
 */
async function processTenderInTab(context, tenderUrl, tenderTitleFallback, tenderIndex, totalTarget = 50, currentDeptInfo = null) {
  console.log(`\n------------------------------------------------------`);
  console.log(`📋 Processing Tender #${tenderIndex + 1} of ${totalTarget}...`);
  console.log(`------------------------------------------------------`);

  const tenderPage = await context.newPage();

  try {
    console.log(`Opening tender page: ${tenderUrl}`);
    await tenderPage.goto(tenderUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await tenderPage.waitForTimeout(800);

    // 1. Extract official canonical metadata from details table
    const metadata = await tenderPage.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const map = {};
      const trs = Array.from(document.querySelectorAll('tr'));
      trs.forEach(tr => {
        const tds = Array.from(tr.children).filter(el => el.tagName === 'TD');
        for (let i = 0; i < tds.length - 1; i += 2) {
          const k = clean(tds[i]?.innerText);
          const v = clean(tds[i + 1]?.innerText);
          if (k && k.length < 60 && !k.includes('\n')) {
            map[k] = v;
          }
        }
      });

      const offlineInstruments = [];
      const offlineTable = Array.from(document.querySelectorAll('table')).find(t => 
        t.querySelectorAll('table').length === 0 &&
        t.innerText.includes('Instrument Type') && 
        t.innerText.includes('S.No')
      ) || Array.from(document.querySelectorAll('table')).find(t => 
        t.innerText.includes('Instrument Type') && t.innerText.includes('S.No')
      );

      if (offlineTable) {
        const instRows = Array.from(offlineTable.querySelectorAll('tr')).slice(1);
        let idx = 1;
        instRows.forEach(row => {
          const tds = Array.from(row.querySelectorAll('td'));
          if (tds.length >= 2) {
            const sNo = parseInt(clean(tds[0].innerText), 10);
            const instrumentType = clean(tds[1].innerText);
            const lower = instrumentType.toLowerCase();
            const isDocument = /\.(pdf|xls|xlsx|zip|rar|doc|docx)$/i.test(lower) ||
              lower.includes('tendernotice') || lower.includes('.pdf') || lower.includes('.xls') || lower === 'boq' ||
              lower.includes('prequal') || lower.includes('technical') || lower.includes('finance') || lower.startsWith('cover');
            
            if (!isNaN(sNo) && instrumentType && !instrumentType.includes('Search |') && !isDocument && sNo <= 10) {
              offlineInstruments.push({ sNo: idx++, instrumentType });
            }
          }
        });
      }

      const coversInfo = [];
      const coversTable = Array.from(document.querySelectorAll('table')).find(t => 
        t.querySelectorAll('table').length === 0 &&
        t.innerText.includes('Cover No') && 
        t.innerText.includes('Cover Type')
      ) || Array.from(document.querySelectorAll('table')).find(t => 
        t.innerText.includes('Cover No') && t.innerText.includes('Cover Type')
      );

      if (coversTable) {
        const coverRows = Array.from(coversTable.querySelectorAll('tr')).slice(1);
        let cIdx = 1;
        coverRows.forEach(row => {
          const tds = Array.from(row.querySelectorAll('td'));
          if (tds.length >= 3) {
            const coverNo = parseInt(clean(tds[0].innerText), 10);
            const coverType = clean(tds[1].innerText);
            const documentType = clean(tds[2].innerText);
            const description = tds[3] ? clean(tds[3].innerText) : '';
            const lowerType = coverType.toLowerCase();
            const lowerDoc = documentType.toLowerCase();
            const isDocument = lowerType.includes('tendernotice') || lowerType === 'boq' || lowerType.includes('tender document') ||
              lowerDoc === 'nit' || lowerDoc === 'tender notice' ||
              (/\.(pdf|xls|xlsx|zip|rar)$/i.test(lowerType) && !lowerType.includes('technical') && !lowerType.includes('finance'));

            if (!isNaN(coverNo) && coverType && !coverType.includes('Search |') && !isDocument && coverNo <= 10) {
              coversInfo.push({ coverNo: cIdx++, coverType, documentType, description });
            }
          }
        });
      }

      const parseDate = (dStr) => {
        if (!dStr || dStr === 'NA' || dStr === 'N/A') return null;
        try {
          const ts = Date.parse(dStr.replace(/-/g, ' '));
          return isNaN(ts) ? null : new Date(ts);
        } catch {
          return null;
        }
      };

      const parseNum = (str) => {
        if (!str || str === 'NA' || str === 'N/A') return 0;
        const v = parseFloat(String(str).replace(/,/g, '').replace(/[^0-9.]/g, ''));
        return isNaN(v) ? 0 : v;
      };

      return {
        tenderId: map['Tender ID'],
        tenderRef: map['Tender Reference Number'],
        organisationChain: map['Organisation Chain'],
        withdrawalAllowed: map['Withdrawal Allowed'],
        tenderType: map['Tender Type'],
        formOfContract: map['Form Of Contract'],
        tenderCategory: map['Tender Category'],
        noOfCovers: parseInt(map['No. of Covers']) || 2,
        generalTechnicalEvaluationAllowed: map['General Technical Evaluation Allowed'],
        itemWiseTechnicalEvaluationAllowed: map['ItemWise Technical Evaluation Allowed'],
        paymentMode: map['Payment Mode'],
        isMultiCurrencyAllowedForBOQ: map['Is Multi Currency Allowed For BOQ'],
        isMultiCurrencyAllowedForFee: map['Is Multi Currency Allowed For Fee'],
        allowTwoStageBidding: map['Allow Two Stage Bidding'],

        tenderFee: parseNum(map['Tender Fee in ₹']),
        feePayableTo: map['Fee Payable To'],
        feePayableAt: map['Fee Payable At'],
        tenderFeeExemptionAllowed: map['Tender Fee Exemption Allowed'],

        emdAmount: parseNum(map['EMD Amount in ₹']),
        emdExemptionAllowed: map['EMD Exemption Allowed'],
        emdFeeType: map['EMD Fee Type'],
        emdPercentage: map['EMD Percentage'],
        emdPayableTo: map['EMD Payable To'],
        emdPayableAt: map['EMD Payable At'],

        title: map['Title'] || map['Work Description'],
        workDescription: map['Work Description'] || map['Title'],
        ndaPreQualification: map['NDA/Pre Qualification'],
        independentExternalMonitorRemarks: map['Independent External Monitor/Remarks'],
        estimatedValue: parseNum(map['Tender Value in ₹']),
        productCategory: map['Product Category'],
        subCategory: map['Sub category'],
        contractType: map['Contract Type'],
        bidValidityDays: parseInt(map['Bid Validity(Days)']) || 0,
        periodOfWorkDays: parseInt(map['Period Of Work(Days)']) || 0,
        location: map['Location'],
        pincode: map['Pincode'],
        preBidMeetingPlace: map['Pre Bid Meeting Place'],
        preBidMeetingAddress: map['Pre Bid Meeting Address'],
        preBidMeetingDate: parseDate(map['Pre Bid Meeting Date']),
        bidOpeningPlace: map['Bid Opening Place'],
        shouldAllowNDATender: map['Should Allow NDA Tender'],
        allowPreferentialBidder: map['Allow Preferential Bidder'],

        publishedDate: parseDate(map['Published Date']),
        bidOpeningDate: parseDate(map['Bid Opening Date']),
        documentDownloadStartDate: parseDate(map['Document Download / Sale Start Date']),
        documentDownloadEndDate: parseDate(map['Document Download / Sale End Date']),
        clarificationStartDate: map['Clarification Start Date'],
        clarificationEndDate: map['Clarification End Date'],
        bidSubmissionStartDate: parseDate(map['Bid Submission Start Date']),
        bidSubmissionEndDate: parseDate(map['Bid Submission End Date']),
        closingDate: parseDate(map['Bid Submission End Date']) || parseDate(map['Document Download / Sale End Date']),

        invitingAuthorityName: map['Name'],
        invitingAuthorityAddress: map['Address'],
        offlineInstruments,
        coversInfo
      };
    });

    // Determine official Tender ID
    let tenderId = metadata.tenderId;
    if (!tenderId) {
      const bracketMatches = tenderTitleFallback.match(/\[(.*?)\]/g) || [];
      tenderId = bracketMatches.length >= 1 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '').trim() : '';
    }
    if (!tenderId) {
      const bodyText = await tenderPage.locator('body').innerText().catch(() => '');
      const m = bodyText.match(/Tender ID\s*[\n\r\t ]*([^\n\r\t ]+)/i);
      tenderId = m ? m[1].trim() : `TENDER_${Date.now()}`;
    }

    const deptCode = extractDeptCode(tenderId, metadata.organisationChain || currentDeptInfo?.name, currentDeptInfo?.code);
    const deptName = currentDeptInfo?.name || (metadata.organisationChain ? metadata.organisationChain.split('||')[0].trim() : 'General');
    const publishedDate = metadata.publishedDate || new Date();
    const folderKey = formatTenderStorageKey(tenderId, publishedDate, deptCode);
    const title = metadata.workDescription || metadata.title || tenderTitleFallback || `Tender ${tenderId}`;

    console.log(`📌 Official Tender ID: ${tenderId} (Dept: ${deptCode})`);
    console.log(`📌 Primary Key: tenders/${folderKey}/`);
    console.log(`📌 Title: ${title.slice(0, 70)}...`);

    // 2. DEDUPLICATION CHECK: If tender already has both PDF and BOQ XLS, update metadata in-place
    const existing = await Tender.findOne({ sourcePortal: 'JK_TENDERS', sourceTenderId: tenderId });
    if (existing && existing.pdfUrls && existing.pdfUrls.length > 0 && existing.boqFileUrl) {
      console.log(`⚡ [DUPLICATE DETECTED] Tender ${tenderId} already fully ingested with PDF & BOQ XLS!`);
      console.log(`   Updating complete metadata in MongoDB without re-downloading files.`);
      const updateData = {
        ...metadata,
        title,
        departmentCode: deptCode,
        departmentName: deptName,
        r2StorageKey: folderKey,
        publishedDate,
        updatedAt: new Date()
      };
      const updatedDoc = await Tender.findOneAndUpdate(
        { sourcePortal: 'JK_TENDERS', sourceTenderId: tenderId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      // Refresh self-describing tender.json in Cloudflare R2
      await uploadJsonToR2({
        jsonData: updatedDoc?.toObject ? updatedDoc.toObject() : updatedDoc,
        tenderId,
        publishedDate,
        deptCode,
      });

      return updatedDoc;
    }

    const item = {
      sourcePortal: 'JK_TENDERS',
      sourceTenderId: tenderId,
      departmentCode: deptCode,
      departmentName: deptName,
      r2StorageKey: folderKey,
      ...metadata,
      title,
      publishedDate,
      pdfUrls: existing?.pdfUrls || [],
      nitDocuments: existing?.nitDocuments || [],
      workItemDocuments: existing?.workItemDocuments || [],
      boqFileUrl: existing?.boqFileUrl || null,
    };

    // 3. Download PDF Notice (Listen before click to catch direct downloads instantly)
    const pdfLink = tenderPage.locator("a:has-text('.pdf'), #docDownoad").first();
    if (await pdfLink.count() > 0) {
      console.log('\n📄 Found Tender Notice (.pdf) link. Opening download...');
      
      const pdfDownloadPromise = tenderPage.waitForEvent('download', { timeout: 300000 }).catch(() => null);
      await pdfLink.click();

      try {
        const quickDl = await Promise.race([
          pdfDownloadPromise,
          new Promise(r => setTimeout(r, 2500)).then(() => null)
        ]);
        let pdfDownload = quickDl;

        if (!pdfDownload) {
          await tenderPage.waitForLoadState('domcontentloaded').catch(() => {});
          pdfDownload = await solveCaptchaAndCaptureDownload(tenderPage, tenderId, 'PDF NOTICE', pdfDownloadPromise);
        } else {
          console.log(`⚡ [SESSION UNLOCKED] Direct download initiated for PDF NOTICE without captcha!`);
        }

        if (pdfDownload) {
          const tempPdfPath = await pdfDownload.path();
          const pdfFileName = pdfDownload.suggestedFilename() || 'Tendernotice_1.pdf';

          console.log(`Uploading PDF (${pdfFileName}) to Cloudflare R2...`);
          const r2Url = await uploadFileToR2({
            filePath: tempPdfPath,
            fileName: pdfFileName,
            tenderId,
            publishedDate,
            deptCode,
            contentType: 'application/pdf',
          });

          if (r2Url) {
            console.log(`🎉 PDF Uploaded to R2: ${r2Url}`);
            item.pdfUrls = [r2Url]; // replace with fresh URL
            item.nitDocuments = [{
              documentName: pdfFileName,
              description: 'Tender Notice Document',
              fileUrl: r2Url,
            }];
          }
        }
      } catch (pdfErr) {
        console.warn('PDF download timed out or failed:', pdfErr.message);
      }
    }

    // 4. Reload Tender Details cleanly to download BOQ ZIP
    console.log('\nReloading Tender Details page to access BOQ Schedule...');
    await tenderPage.goto(tenderUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await tenderPage.waitForTimeout(800);

    const zipLink = tenderPage.locator("a:has-text('Download as zip file'), #DirectLink_8").first();
    if (await zipLink.count() > 0) {
      console.log('📦 Found "Download as zip file" link. Opening download...');
      
      const zipDownloadPromise = tenderPage.waitForEvent('download', { timeout: 300000 }).catch(() => null);
      await zipLink.click();

      try {
        const quickZipDl = await Promise.race([
          zipDownloadPromise,
          new Promise(r => setTimeout(r, 2500)).then(() => null)
        ]);
        let zipDownload = quickZipDl;

        if (!zipDownload) {
          await tenderPage.waitForLoadState('domcontentloaded').catch(() => {});
          zipDownload = await solveCaptchaAndCaptureDownload(tenderPage, tenderId, 'BOQ ZIP', zipDownloadPromise);
        } else {
          console.log(`⚡ [SESSION UNLOCKED] Direct download initiated for BOQ ZIP without captcha!`);
        }

        if (zipDownload) {
          const tempZipPath = await zipDownload.path();
          const zip = new AdmZip(tempZipPath);
          const zipEntries = zip.getEntries().filter(e => !e.isDirectory);
          console.log(`Zip archive contains ${zipEntries.length} file(s). Extracting and storing ALL documents (.xls, .pdf, etc.)...`);

          for (const entry of zipEntries) {
            const fileName = path.basename(entry.entryName);
            const lowerName = fileName.toLowerCase();
            if (!lowerName || lowerName.startsWith('.') || lowerName.startsWith('__macosx')) continue;

            const tempExtractPath = path.join(os.tmpdir(), `extracted_${Date.now()}_${fileName}`);
            fs.writeFileSync(tempExtractPath, entry.getData());
            const fileSizeKb = Math.round(entry.header.size / 1024);
            console.log(`📂 Extracted from zip: "${fileName}" (${fileSizeKb} KB)`);

            let contentType = 'application/octet-stream';
            let isBoq = false;
            let isPdf = false;

            if (lowerName.endsWith('.xls')) {
              contentType = 'application/vnd.ms-excel';
              isBoq = true;
            } else if (lowerName.endsWith('.xlsx')) {
              contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
              isBoq = true;
            } else if (lowerName.endsWith('.pdf')) {
              contentType = 'application/pdf';
              isPdf = true;
            } else if (lowerName.endsWith('.doc')) {
              contentType = 'application/msword';
            } else if (lowerName.endsWith('.docx')) {
              contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }

            console.log(`Uploading extracted document (${fileName}) to Cloudflare R2...`);
            const r2Url = await uploadFileToR2({
              filePath: tempExtractPath,
              fileName,
              tenderId,
              publishedDate,
              deptCode,
              contentType,
            });

            if (r2Url) {
              console.log(`🎉 Document Stored in Cloudflare R2: ${r2Url}`);

              if (isBoq) {
                item.boqFileUrl = r2Url;
                item.workItemDocuments.push({
                  documentType: 'BOQ',
                  documentName: fileName,
                  description: 'BOQ Schedule (Extracted from Zip)',
                  documentSizeKb: fileSizeKb,
                  fileUrl: r2Url,
                });
              } else if (isPdf) {
                if (!item.pdfUrls.includes(r2Url)) {
                  item.pdfUrls.push(r2Url);
                }
                item.workItemDocuments.push({
                  documentType: 'TECHNICAL_DOCUMENT',
                  documentName: fileName,
                  description: 'Technical Specification / Drawing (Extracted from Zip)',
                  documentSizeKb: fileSizeKb,
                  fileUrl: r2Url,
                });
              } else {
                item.workItemDocuments.push({
                  documentType: 'ATTACHMENT',
                  documentName: fileName,
                  description: 'Tender Attachment (Extracted from Zip)',
                  documentSizeKb: fileSizeKb,
                  fileUrl: r2Url,
                });
              }
            }

            if (fs.existsSync(tempExtractPath)) fs.unlinkSync(tempExtractPath);
          }

          // CRITICAL: Immediately delete local .zip file! Never uploaded to Cloudflare!
          if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
            console.log('🗑️ Local temporary .zip file deleted from disk.');
          }
        }
      } catch (zipErr) {
        console.warn('Zip download timed out or failed:', zipErr.message);
      }
    }

    // 5. Save Tender to MongoDB (In-place Upsert, never duplicate)
    item.pdfFetchStatus = item.pdfUrls.length > 0 ? 'COMPLETED' : 'PENDING';
    item.boqFetchStatus = item.boqFileUrl ? 'COMPLETED' : 'NOT_AVAILABLE';

    const saved = await Tender.findOneAndUpdate(
      { sourcePortal: 'JK_TENDERS', sourceTenderId: tenderId },
      { $set: item },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`\n💾 Saved Tender ${tenderId} to MongoDB! (Doc ID: ${saved._id})`);
    console.log(`   📄 PDFs: ${item.pdfUrls.length} | 📊 BOQ XLS: ${item.boqFileUrl ? 'Yes' : 'No'}`);

    // 6. Upload self-describing tender.json package to Cloudflare R2
    await uploadJsonToR2({
      jsonData: saved?.toObject ? saved.toObject() : saved,
      tenderId,
      publishedDate,
      deptCode,
    });

    return item;
  } finally {
    // Close the tender tab, leaving the department list untouched!
    await tenderPage.close().catch(() => {});
  }
}

/**
 * Main Multi-Department Ingestion Pipeline
 */
async function runBatch() {
  const targetCount = parseInt(process.argv[2], 10) || 50;
  console.log('\n======================================================');
  console.log(`🚀 JKTenders Multi-Tender Ingestion Pipeline (${targetCount} Tenders)`);
  console.log('📌 Primary Key: tenders/{tenderId}_{publishedDate}/');
  console.log('📌 Documents: .pdf (Notice) & .xls (BOQ extracted from zip)');
  console.log('📌 Zero Duplicate Policy: In-place update for MongoDB & Cloudflare');
  console.log('======================================================\n');

  await connectDB();

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });
  const context = await browser.newContext({ acceptDownloads: true, viewport: null });
  const deptPage = await context.newPage();

  console.log('Navigating to department list...');
  await deptPage.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });

  // Extract all departments available on the portal
  const departments = await deptPage.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.list_table tr'));
    return rows.map((r, idx) => {
      const a = r.querySelector('td a');
      const tds = Array.from(r.querySelectorAll('td')).map(t => t.textContent.trim());
      return {
        idx,
        name: a ? a.textContent.trim() : (tds[1] || `Dept ${idx}`),
        href: a ? a.getAttribute('href') : null,
        tenderCount: parseInt(tds[tds.length - 1] || '0', 10) || 0
      };
    }).filter(d => d.href);
  });

  console.log(`Found ${departments.length} departments available on portal.`);

  let processedCount = 0;

  // Outer loop: Iterate through departments until targetCount is reached
  for (let d = 0; d < departments.length; d++) {
    if (processedCount >= targetCount) break;

    const dept = departments[d];
    console.log(`\n======================================================`);
    console.log(`🏢 [Department ${d + 1}/${departments.length}] Opening: "${dept.name}" (${dept.tenderCount} tenders)`);
    console.log(`======================================================\n`);

    const fullDeptUrl = dept.href.startsWith('http') 
      ? dept.href 
      : `https://jktenders.gov.in${dept.href}`;

    await deptPage.goto(fullDeptUrl, { waitUntil: 'networkidle', timeout: 45000 });

    let hasMoreDeptPages = true;
    let deptPageNum = 1;

    while (processedCount < targetCount && hasMoreDeptPages) {
      console.log(`--- Inspecting "${dept.name}" (Page ${deptPageNum}) ---`);

      // Extract all tenders on this page of the department
      const tendersOnPage = await deptPage.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table.list_table tr"));
        const extracted = [];
        rows.forEach(row => {
          const anchor = row.querySelector("td a[href*='DirectLink']");
          if (anchor && anchor.href) {
            extracted.push({
              title: anchor.innerText.trim(),
              href: anchor.href
            });
          }
        });
        return extracted;
      });

      console.log(`Found ${tendersOnPage.length} tenders on page ${deptPageNum}.`);
      if (tendersOnPage.length === 0) break;

      for (let i = 0; i < tendersOnPage.length; i++) {
        if (processedCount >= targetCount) break;

        const tenderInfo = tendersOnPage[i];
        console.log(`\n➡️ [${processedCount + 1}/${targetCount}] Processing: "${tenderInfo.title.slice(0, 55)}..."`);

        await processTenderInTab(
          context,
          tenderInfo.href,
          tenderInfo.title,
          processedCount,
          targetCount,
          dept
        );

        processedCount++;
      }

      // Check for next page in this department
      if (processedCount < targetCount) {
        const nextPageTarget = deptPageNum + 1;
        const hasNext = await deptPage.evaluate((nextPg) => {
          const links = Array.from(document.querySelectorAll("table.list_table ~ * a, a"));
          const targetLink = links.find(l => l.textContent.trim() === String(nextPg) || l.textContent.trim() === 'Next >');
          if (targetLink) {
            targetLink.click();
            return true;
          }
          return false;
        }, nextPageTarget);

        if (hasNext) {
          console.log(`Advancing to "${dept.name}" Page ${nextPageTarget}...`);
          await deptPage.waitForLoadState('networkidle');
          await deptPage.waitForTimeout(2000);
          deptPageNum++;
        } else {
          console.log(`No more pages in "${dept.name}". Advancing to next department...`);
          hasMoreDeptPages = false;
        }
      }
    }
  }

  console.log('\n======================================================');
  console.log(`🎉 INGESTION PIPELINE FINISHED: ${processedCount} tenders processed!`);
  console.log('======================================================\n');

  await browser.close();
  await closeDB();
  process.exit(0);
}

runBatch().catch(err => {
  console.error('Batch run error:', err);
  process.exit(1);
});
