/**
 * @file backend/src/scripts/enrichExistingTenders.js
 * @description Backfills and enriches all existing MongoDB tenders with complete,
 * comprehensive metadata extracted directly from JKTenders (Basic Details,
 * Fee & EMD, Work Execution Location, Critical Dates, Covers & Offline Instruments).
 * Zero re-download of files - preserves existing PDF and BOQ Cloudflare links.
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { extractDeptCode, formatTenderStorageKey, uploadJsonToR2 } from '../utils/r2Storage.js';

async function enrichAll() {
  console.log('\n======================================================');
  console.log('🚀 JKTenders Comprehensive Metadata Enrichment Engine');
  console.log('📌 Populates: Basic Details, Fee & EMD, Critical Dates,');
  console.log('             Work Execution Location, Covers & Payment Instruments');
  console.log('======================================================\n');

  await connectDB();

  // Find all tenders in MongoDB
  const tenders = await Tender.find({ sourcePortal: 'JK_TENDERS' }).lean();
  console.log(`Found ${tenders.length} tender(s) in MongoDB to check/enrich.`);

  const tenderMap = new Map();
  tenders.forEach(t => {
    tenderMap.set(t.sourceTenderId, t);
  });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('\nNavigating to JKTenders Department Directory...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle', timeout: 45000 });

  const departments = await page.evaluate(() => {
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
    }).filter(d => d.href && d.tenderCount > 0);
  });

  console.log(`Found ${departments.length} departments with active tenders.`);

  let enrichedCount = 0;

  for (let d = 0; d < departments.length; d++) {
    const dept = departments[d];
    console.log(`\n🏢 Inspecting [${d + 1}/${departments.length}]: "${dept.name}" (${dept.tenderCount} tenders)`);

    const fullDeptUrl = dept.href.startsWith('http') ? dept.href : `https://jktenders.gov.in${dept.href}`;
    await page.goto(fullDeptUrl, { waitUntil: 'networkidle', timeout: 45000 });

    let hasMorePages = true;
    let pageNum = 1;

    while (hasMorePages) {
      const tenderLinks = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table.list_table tr"));
        const list = [];
        rows.forEach(r => {
          const a = r.querySelector("td a[href*='DirectLink']");
          if (a && a.href) {
            list.push({ title: a.innerText.trim(), href: a.href });
          }
        });
        return list;
      });

      console.log(`   Page ${pageNum}: Found ${tenderLinks.length} tenders.`);
      if (tenderLinks.length === 0) break;

      for (const tLink of tenderLinks) {
        const tenderTab = await context.newPage();
        try {
          await tenderTab.goto(tLink.href, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await tenderTab.waitForTimeout(600);

          const fullData = await tenderTab.evaluate(() => {
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
            // Target innermost table whose header contains Instrument Type
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
            // Target innermost table whose header contains Cover No and Cover Type
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

          const officialId = fullData.tenderId;
          if (officialId && tenderMap.has(officialId)) {
            const existingTender = tenderMap.get(officialId);
            const deptCode = extractDeptCode(officialId, fullData.organisationChain || dept.name);
            const deptName = dept.name || (fullData.organisationChain ? fullData.organisationChain.split('||')[0].trim() : 'General');
            const publishedDate = fullData.publishedDate || existingTender.publishedDate || new Date();
            const folderKey = formatTenderStorageKey(officialId, publishedDate, deptCode);

            const updateFields = {
              ...fullData,
              title: fullData.workDescription || fullData.title || existingTender.title,
              departmentCode: deptCode,
              departmentName: deptName,
              r2StorageKey: folderKey,
              publishedDate,
              detailsUrl: tLink.href,
              updatedAt: new Date()
            };

            const updatedDoc = await Tender.findByIdAndUpdate(
              existingTender._id,
              { $set: updateFields },
              { returnDocument: 'after' }
            );

            // Also upload fresh self-describing tender.json package to Cloudflare R2
            await uploadJsonToR2({
              jsonData: updatedDoc.toObject ? updatedDoc.toObject() : updatedDoc,
              tenderId: officialId,
              publishedDate,
              deptCode,
            });

            enrichedCount++;
            console.log(`   ✨ [${enrichedCount}] ENRICHED: ${officialId} | Value: ₹${fullData.estimatedValue || 0} | Cat: ${fullData.productCategory || 'N/A'}`);
          }
        } catch (tenderErr) {
          console.warn(`   ⚠️ Error reading tender ${tLink.title.slice(0, 30)}:`, tenderErr.message);
        } finally {
          await tenderTab.close().catch(() => {});
        }
      }

      // Check next page
      const hasNext = await page.evaluate((nextPg) => {
        const links = Array.from(document.querySelectorAll("table.list_table ~ * a, a"));
        const target = links.find(l => l.textContent.trim() === String(nextPg) || l.textContent.trim() === 'Next >');
        if (target) {
          target.click();
          return true;
        }
        return false;
      }, pageNum + 1);

      if (hasNext) {
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1500);
        pageNum++;
      } else {
        hasMorePages = false;
      }
    }
  }

  console.log('\n======================================================');
  console.log(`🎉 ENRICHMENT FINISHED: Successfully enriched ${enrichedCount} tenders!`);
  console.log('======================================================\n');

  await browser.close();
  await closeDB();
  process.exit(0);
}

enrichAll().catch(err => {
  console.error('\n❌ Enrichment script failed:', err);
  process.exit(1);
});
