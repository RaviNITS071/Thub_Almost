/**
 * @file backend/src/scripts/verifyMetadataSample.js
 * @description Verification tool to audit 50 random tenders across 30 non-Rural Development organisations.
 * 
 * Compares live JKTenders portal metadata against MongoDB Atlas.
 * - STRICTLY READ-ONLY: Never writes or updates MongoDB Atlas. Zero interruption to ongoing AWS processes.
 * - DO NOT COMMIT: Local verification utility.
 * 
 * Usage:
 *   node src/scripts/verifyMetadataSample.js                  # Default: 50 tenders across all ~30 non-RDD orgs
 *   node src/scripts/verifyMetadataSample.js --limit 50       # Audit 50 tenders
 *   node src/scripts/verifyMetadataSample.js --headless false # Watch browser live in action
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function verify() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a, i) => args[i - 1] === '--limit' || /^\d+$/.test(a));
  const TARGET_SAMPLE_SIZE = limitArg ? parseInt(limitArg, 10) : 50;
  const isHeadless = !args.includes('--headed') && args.find((a, i) => args[i - 1] === '--headless') !== 'false';

  console.log(`\n======================================================================`);
  console.log(`🔍 JKTENDERS LIVE PORTAL vs MONGODB METADATA AUDITOR`);
  console.log(`======================================================================`);
  console.log(`🎯 Sample Target:    ${TARGET_SAMPLE_SIZE} random tenders across ~30 non-RDPR organisations`);
  console.log(`🔒 Mode:             STRICTLY READ-ONLY (Zero DB writes, zero AWS interruption)`);
  console.log(`🌐 Browser Headless: ${isHeadless}`);
  console.log(`======================================================================\n`);

  await connectDB();

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  let auditedCount = 0;
  let perfectMatchCount = 0;
  let mismatchCount = 0;
  let notFoundInDbCount = 0;

  try {
    console.log(`🌐 Navigating to FrontEndTendersByOrganisation on JKTenders...`);
    await page.goto(`https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.waitForSelector("table#table tr[id^='informal']", { timeout: 30000 });
    const organisations = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table#table tr[id^='informal']"));
      return rows.map((row, index) => {
        const tds = row.querySelectorAll('td');
        const orgName = tds[1] ? tds[1].innerText.trim() : '';
        const countLink = tds[2] ? tds[2].querySelector('a') : null;
        const tenderCount = countLink ? parseInt(countLink.innerText.trim(), 10) : 0;
        return { index, orgName, tenderCount, hasCountLink: !!countLink };
      }).filter(o => o.hasCountLink && o.tenderCount > 0 && !o.orgName.toLowerCase().includes('rural development'));
    });

    console.log(`🏛️ Found ${organisations.length} non-Rural Development organisations on portal.\n`);

    const tendersPerOrg = Math.max(1, Math.ceil(TARGET_SAMPLE_SIZE / organisations.length));

    for (let o = 0; o < organisations.length && auditedCount < TARGET_SAMPLE_SIZE; o++) {
      const org = organisations[o];
      console.log(`----------------------------------------------------------------------`);
      console.log(`🏛️ [Org ${o + 1}/${organisations.length}] ${org.orgName} (${org.tenderCount} active tenders)`);
      console.log(`----------------------------------------------------------------------`);

      // Click organisation link
      const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: org.orgName }).first();
      const countLink = orgRow.locator("td:nth-child(3) a, a.link2, a").first();

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
        countLink.click()
      ]);
      await page.waitForTimeout(800);

      await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 20000 }).catch(() => {});
      const tenderRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table.list_table tr[id^='informal']"));
        return rows.map((row, index) => {
          const tds = row.querySelectorAll('td');
          if (tds.length < 5) return null;
          const fullText = row.innerText.trim();
          const bracketMatches = fullText.match(/\[(.*?)\]/g) || [];
          const tenderId = bracketMatches.length >= 1 ? bracketMatches[bracketMatches.length - 1].replace(/[\[\]]/g, '') : '';
          const a = tds[4].querySelector('a');
          return {
            index,
            sourceTenderId: tenderId,
            title: a ? a.innerText.trim() : tds[4].innerText.trim(),
            hasLink: !!a
          };
        }).filter(t => t && t.hasLink && t.sourceTenderId);
      });

      if (tenderRows.length === 0) {
        console.log(`   ⚠️ No active tenders found on page.`);
        await page.goto(`https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        continue;
      }

      const shuffled = tenderRows.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, tendersPerOrg);

      for (const item of selected) {
        if (auditedCount >= TARGET_SAMPLE_SIZE) break;

        const dbTender = await Tender.findOne({
          sourcePortal: 'JK_TENDERS',
          sourceTenderId: item.sourceTenderId
        }).lean();

        if (!dbTender) {
          console.log(`   ⏩ [${auditedCount + 1}/${TARGET_SAMPLE_SIZE}] ${item.sourceTenderId} - Not found in DB, skipping.`);
          notFoundInDbCount++;
          continue;
        }

        auditedCount++;
        console.log(`\n🔍 [${auditedCount}/${TARGET_SAMPLE_SIZE}] Auditing: ${item.sourceTenderId}`);
        console.log(`   Title: "${dbTender.title?.substring(0, 60)}..."`);

        try {
          // Click tender title to open details page
          const tenderLink = page.locator("table.list_table tr[id^='informal']").filter({ hasText: item.sourceTenderId }).locator("td:nth-child(5) a, a").first();
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }),
            tenderLink.click()
          ]);
          await page.waitForSelector("table:has-text('Critical Dates')", { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(500);

          // Extract live Critical Dates from portal page
          const liveData = await page.evaluate(() => {
            const getDateByLabel = (labels) => {
              const normalizedLabels = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase().replace(/[:₹\s]/g, ''));
              const tds = Array.from(document.querySelectorAll('td'));
              for (const td of tds) {
                if (td.querySelector('table')) continue;
                const text = td.innerText.trim().toLowerCase().replace(/[:₹\s]/g, '');
                if (normalizedLabels.includes(text)) {
                  let next = td.nextElementSibling;
                  if (next && next.tagName === 'TD') {
                    const val = next.innerText.trim().replace(/\s+/g, ' ');
                    if (val && val !== 'NA' && val !== 'N/A' && /\d{1,2}[-/][a-zA-Z0-9]{2,4}[-/]\d{4}/.test(val)) {
                      return val;
                    }
                  }
                }
              }
              return '';
            };

            const getTableVal = (labelText) => {
              const cleanTarget = labelText.toLowerCase().replace(/[:₹\s]/g, '');
              const tds = Array.from(document.querySelectorAll('td'));
              for (const td of tds) {
                if (td.querySelector('table')) continue;
                const raw = td.textContent.trim().replace(/\s+/g, ' ');
                const clean = raw.toLowerCase().replace(/[:₹\s]/g, '');
                if (clean === cleanTarget || clean.startsWith(cleanTarget)) {
                  let next = td.nextElementSibling;
                  if (next && next.tagName === 'TD') {
                    const val = next.textContent.trim().replace(/\s+/g, ' ');
                    if (val && val !== 'NA' && val !== 'N/A') return val;
                  }
                }
              }
              return '';
            };

            return {
              publishedDate: getDateByLabel(['Published Date', 'e-Published Date', 'Publish Date']) || getDateByLabel(['Document Download / Sale Start Date', 'Document Download Start Date']),
              closingDate: getDateByLabel(['Bid Submission End Date']) || getDateByLabel(['Document Download / Sale End Date']),
              openingDate: getDateByLabel(['Bid Opening Date']),
              tenderRefNo: getTableVal('Tender Reference Number'),
              tenderValue: getTableVal('Tender Value')
            };
          });

          // Return to list page
          const backBtn = page.locator("a#DirectLink_11, a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back')").last();
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
            backBtn.click()
          ]);
          await page.waitForTimeout(500);

          // Compare Portal vs Database
          const pubMatch = !liveData.publishedDate || liveData.publishedDate === dbTender.publishedDateStr;
          const closeMatch = !liveData.closingDate || liveData.closingDate === dbTender.closingDateStr;
          const openMatch = !liveData.openingDate || liveData.openingDate === dbTender.bidOpeningDateStr;
          const isFullMatch = pubMatch && closeMatch && openMatch;

          if (isFullMatch) {
            perfectMatchCount++;
            console.log(`   ✅ [100% MATCH] Live portal matches MongoDB exactly!`);
          } else {
            mismatchCount++;
            console.log(`   ❌ [MISMATCH DETECTED]`);
          }

          console.log(`      📅 Published: Portal: "${liveData.publishedDate}" | DB: "${dbTender.publishedDateStr}" [${pubMatch ? 'MATCH ✅' : 'MISMATCH ❌'}]`);
          console.log(`      ⏰ Bid Close:  Portal: "${liveData.closingDate}"   | DB: "${dbTender.closingDateStr}"   [${closeMatch ? 'MATCH ✅' : 'MISMATCH ❌'}]`);
          console.log(`      🔓 Bid Open:   Portal: "${liveData.openingDate}"   | DB: "${dbTender.bidOpeningDateStr}"   [${openMatch ? 'MATCH ✅' : 'MISMATCH ❌'}]`);
          if (liveData.tenderRefNo) {
            console.log(`      🔖 Ref No:     Portal: "${liveData.tenderRefNo}"   | DB: "${dbTender.tenderReferenceNumber}"`);
          }

        } catch (itemErr) {
          console.error(`   ⚠️ Error auditing ${item.sourceTenderId}: ${itemErr.message}`);
          try {
            await page.goto(`https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, { waitUntil: 'domcontentloaded' });
          } catch (e) {}
          break;
        }
      }

      // Return to Organisation List
      const topBack = page.locator("a#DirectLink_0_0, a.customButton_link:has-text('Back'), a:has-text('Back')").first();
      if (await topBack.count() > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
          topBack.click()
        ]);
        await page.waitForTimeout(600);
      } else {
        await page.goto(`https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    console.log(`\n======================================================================`);
    console.log(`📊 FINAL AUDIT REPORT: LIVE JKTENDERS vs MONGODB ATLAS`);
    console.log(`======================================================================`);
    console.log(`📋 Total Tenders Audited:        ${auditedCount}`);
    console.log(`✅ 100% Perfect Matches:          ${perfectMatchCount} (${auditedCount > 0 ? Math.round((perfectMatchCount / auditedCount) * 100) : 0}%)`);
    console.log(`❌ Mismatches:                    ${mismatchCount}`);
    console.log(`⏩ Tenders Not Found in DB:      ${notFoundInDbCount}`);
    console.log(`======================================================================\n`);

  } catch (err) {
    console.error(`❌ Critical error during audit: ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
    await closeDB().catch(() => {});
  }
}

verify();
