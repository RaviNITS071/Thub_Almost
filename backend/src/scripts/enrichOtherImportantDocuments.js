/**
 * @file backend/src/scripts/enrichOtherImportantDocuments.js
 * @description Dedicated, high-speed backfill runner that ONLY extracts the
 * "Other Important Documents List" (Mandatory Bidder Checklist) for existing tenders.
 * 
 * Key Advantages:
 * 1. Zero binary downloads - does NOT download PDFs or BOQ ZIPs.
 * 2. Zero captchas - reads directly from the public Tender Details page.
 * 3. 100% Non-destructive - strictly preserves all existing dates, titles, and R2 document links.
 * 4. Fast: Takes ~1-2 seconds per tender.
 * 5. Syncs updated tender.json directly to Cloudflare R2.
 * 
 * Usage:
 *   # Enrich all tenders published on 22-Sep-2026:
 *   node src/scripts/enrichOtherImportantDocuments.js --date "22-Sep-2026"
 * 
 *   # Enrich with limit:
 *   node src/scripts/enrichOtherImportantDocuments.js --limit 50
 * 
 *   # Filter by organisation:
 *   node src/scripts/enrichOtherImportantDocuments.js --org "Rural Development"
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { uploadJsonToR2, extractDeptCode } from '../utils/r2Storage.js';

async function main() {
  const args = process.argv.slice(2);
  let dateArg = null;
  let orgFilter = null;
  let limit = Infinity;
  let isHeadless = process.env.SCRAPER_HEADLESS !== 'false';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--date' || a === '-d') && args[i + 1]) {
      dateArg = args[i + 1];
      i++;
    } else if ((a === '--org' || a === '-o') && args[i + 1]) {
      orgFilter = args[i + 1];
      i++;
    } else if ((a === '--limit' || a === '-l') && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (a === '--headed') {
      isHeadless = false;
    }
  }

  console.log('\n======================================================================');
  console.log('📋 JKTENDERS "OTHER IMPORTANT DOCUMENTS" (OID) ENRICHMENT ENGINE');
  console.log('======================================================================');
  console.log(`🎯 Target Date Filter:    ${dateArg || 'ALL EXISTING TENDERS'}`);
  console.log(`🏛️ Organisation Filter:   ${orgFilter || 'ALL ORGANISATIONS'}`);
  console.log(`🎯 Limit:                 ${limit === Infinity ? 'Unlimited' : limit}`);
  console.log(`🌐 Headless:              ${isHeadless}`);
  console.log('⚡ Mode:                  Fast HTML Table Scan (NO captchas, NO file downloads)');
  console.log('======================================================================\n');

  await connectDB();

  // Find target tenders in MongoDB that need OID
  const query = { sourcePortal: 'JK_TENDERS' };
  if (dateArg) {
    query.publishedDateStr = { $regex: `^${dateArg}` };
  }
  if (orgFilter) {
    query.organisationChain = { $regex: orgFilter, $options: 'i' };
  }

  // Target tenders where otherImportantDocuments is missing or empty
  query.$or = [
    { otherImportantDocuments: { $exists: false } },
    { otherImportantDocuments: { $size: 0 } }
  ];

  const candidateTenders = await Tender.find(query).select('sourceTenderId organisationChain publishedDate publishedDateStr departmentCode').lean();
  console.log(`📊 Found ${candidateTenders.length} tender(s) in DB missing Other Important Documents list.`);

  if (candidateTenders.length === 0) {
    console.log('✅ All matching tenders already have Other Important Documents populated! Exiting.');
    await closeDB();
    process.exit(0);
  }

  const targetIdSet = new Set(candidateTenders.map(t => t.sourceTenderId));
  const tenderDbMap = new Map(candidateTenders.map(t => [t.sourceTenderId, t]));

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  let totalChecked = 0;
  let totalEnrichedWithOid = 0;
  let totalWithoutOidTable = 0;

  try {
    console.log('🌐 Navigating to FrontEndTendersByOrganisation...');
    await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForSelector("table#table tr[id^='informal']", { timeout: 35000 });

    const organisations = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table#table tr[id^='informal']"));
      return rows.map((row, index) => {
        const tds = row.querySelectorAll('td');
        const orgName = tds[1] ? tds[1].innerText.trim() : '';
        const countLink = tds[2] ? tds[2].querySelector('a') : null;
        const tenderCount = countLink ? parseInt(countLink.innerText.trim(), 10) : 0;
        return { index, orgName, tenderCount, hasCountLink: !!countLink };
      }).filter(o => o.hasCountLink && o.tenderCount > 0);
    });

    console.log(`🏛️ Found ${organisations.length} active organisations on portal.\n`);

    for (let o = 0; o < organisations.length && totalChecked < limit; o++) {
      const org = organisations[o];
      if (orgFilter && !org.orgName.toLowerCase().includes(orgFilter.toLowerCase())) {
        continue;
      }

      console.log(`\n----------------------------------------------------------------------`);
      console.log(`🏛️ [${o + 1}/${organisations.length}] Checking: "${org.orgName}" (${org.tenderCount} active)`);
      console.log(`----------------------------------------------------------------------`);

      const orgRow = page.locator("table#table tr[id^='informal']").filter({ hasText: org.orgName }).first();
      const countLink = orgRow.locator("td:nth-child(3) a, a.link2, a").first();

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        countLink.click({ noWaitAfter: true, timeout: 20000 }).catch(() => countLink.click({ force: true, noWaitAfter: true }))
      ]);
      await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 35000 }).catch(() => {});

      let orgHasMore = true;
      let orgPageNum = 1;

      while (orgHasMore && totalChecked < limit) {
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
              publishedDateStr: tds[1] ? tds[1].innerText.trim() : '',
              hasLink: !!a
            };
          }).filter(t => t && t.hasLink && t.sourceTenderId);
        });

        for (let t = 0; t < tenderRows.length && totalChecked < limit; t++) {
          const row = tenderRows[t];
          if (!targetIdSet.has(row.sourceTenderId)) {
            continue; // Not in target list or already has OID
          }

          console.log(`\n🔍 [${totalChecked + 1}] Inspecting OID Table for: ${row.sourceTenderId}`);

          // Locate row strictly
          let tenderRowLoc = page.locator("table.list_table tr[id^='informal']").filter({ hasText: `[${row.sourceTenderId}]` }).first();
          let link = tenderRowLoc.locator("td:nth-child(5) a, a").first();

          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
              link.click({ noWaitAfter: true, timeout: 15000 }).catch(() => link.click({ force: true, noWaitAfter: true }))
            ]);
            await page.waitForSelector("table:has-text('Basic Details'), table:has-text('Critical Dates')", { timeout: 30000 }).catch(() => {});

            // Extract ONLY the "Other Important Documents List" table
            const oidList = await page.evaluate(() => {
              const allTables = Array.from(document.querySelectorAll('table'));
              const oidTable = allTables.find(tbl => 
                tbl.innerText &&
                (tbl.innerText.includes('Other Important Documents') || tbl.innerText.includes('Other Important Documents List')) &&
                tbl.innerText.includes('Sub Category')
              );
              if (!oidTable) return [];

              const docs = [];
              const trs = Array.from(oidTable.querySelectorAll('tr'));
              for (const tr of trs) {
                if (tr.querySelector('th') || (tr.textContent.includes('Sub Category') && tr.textContent.includes('Category'))) {
                  continue;
                }
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 4) {
                  const sNo = parseInt(tds[0].innerText.trim(), 10);
                  const category = tds[1].innerText.trim().replace(/\s+/g, ' ');
                  const subCategory = tds[2].innerText.trim().replace(/\s+/g, ' ');
                  const description = tds[3].innerText.trim().replace(/\s+/g, ' ');
                  const format = tds[4] ? tds[4].innerText.trim().replace(/\s+/g, ' ') : '';
                  if (!isNaN(sNo) && (category || subCategory)) {
                    docs.push({ sNo, category, subCategory, description, format });
                  }
                }
              }
              return docs;
            });

            totalChecked++;

            if (oidList.length > 0) {
              totalEnrichedWithOid++;
              console.log(`   ✅ Found ${oidList.length} Mandatory Document(s) in OID list:`);
              oidList.forEach(d => console.log(`      - [${d.category}] ${d.subCategory}: ${d.description}`));

              // Update in MongoDB
              const updated = await Tender.findOneAndUpdate(
                { sourceTenderId: row.sourceTenderId },
                { $set: { otherImportantDocuments: oidList, updatedAt: new Date() } },
                { returnDocument: 'after' }
              ).lean();

              // Sync updated tender.json to R2
              if (updated) {
                try {
                  const deptCode = updated.departmentCode || extractDeptCode(updated.sourceTenderId, updated.organisationChain);
                  await uploadJsonToR2({
                    jsonData: updated,
                    fileName: 'tender.json',
                    tenderId: updated.sourceTenderId,
                    publishedDate: updated.publishedDate,
                    deptCode
                  });
                } catch {}
              }
            } else {
              totalWithoutOidTable++;
              console.log(`   ℹ️ No "Other Important Documents" configured for this tender.`);
              // Mark with empty array so it is not re-checked
              await Tender.updateOne(
                { sourceTenderId: row.sourceTenderId },
                { $set: { otherImportantDocuments: [] } }
              );
            }

            // Navigate back to listing
            const backBtn = page.locator("a.customButton_link:has-text('Back'), a[title='Back'], a:has-text('Back')").last();
            if (await backBtn.count() > 0) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
                backBtn.click({ timeout: 5000 }).catch(() => {})
              ]);
            } else {
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
            }
            await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 20000 }).catch(() => {});

          } catch (e) {
            console.warn(`   ⚠️ Error inspecting tender ${row.sourceTenderId}: ${e.message}`);
            // Attempt to return to list
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        }

        // Check for next page in organisation
        const nextLink = page.locator("a#loadNext, a:has-text('Next >'), a[title='Next']").first();
        const hasNext = (await nextLink.count().catch(() => 0)) > 0;
        if (hasNext) {
          orgPageNum++;
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}),
            nextLink.click({ noWaitAfter: true }).catch(() => {})
          ]);
          await page.waitForSelector("table.list_table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
        } else {
          orgHasMore = false;
        }
      }

      // Return to organisation directory
      await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      }).catch(() => {});
      await page.waitForSelector("table#table tr[id^='informal']", { timeout: 25000 }).catch(() => {});
    }

    console.log('\n======================================================================');
    console.log('🏁 "OTHER IMPORTANT DOCUMENTS" ENRICHMENT SUMMARY');
    console.log('======================================================================');
    console.log(`📋 Total Tenders Inspected:           ${totalChecked}`);
    console.log(`✅ Tenders with OID Checklist Added:  ${totalEnrichedWithOid}`);
    console.log(`ℹ️ Tenders with No OID Table:         ${totalWithoutOidTable}`);
    console.log('======================================================================\n');

  } finally {
    await browser.close().catch(() => {});
    await closeDB();
  }
}

main().catch(async err => {
  console.error('Fatal error:', err);
  await closeDB();
  process.exit(1);
});
