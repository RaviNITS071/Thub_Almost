import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to jktenders...');
  await page.goto('https://jktenders.gov.in/nicgep/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Click Tenders by Organisation
  const orgLink = page.locator("a:has-text('Tenders by Organisation'), a[title*='Tenders by Organisation'], a#PageLink_0").first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    orgLink.click()
  ]);
  
  await page.waitForSelector("table#table tr[id^='informal']", { timeout: 20000 });
  
  // Click first organisation tender count link
  const countLink = page.locator("table#table tr[id^='informal']").first().locator("td:nth-child(3) a, a.link2").first();
  console.log('Clicking count link...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    countLink.click()
  ]);
  
  await page.waitForSelector("table#table tr[id^='informal']", { timeout: 20000 });
  
  // Click first tender link
  const firstTender = page.locator("table#table tr[id^='informal']").first().locator("a[href*='FrontEndTenderDetails'], td a").first();
  console.log('Clicking tender link...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    firstTender.click()
  ]);
  
  // Now on Tender Details page! Let's inspect all tables, captions, subheads, and their contents!
  const pageInfo = await page.evaluate(() => {
    const result = {};
    
    // Find all tables
    const tables = Array.from(document.querySelectorAll('table'));
    result.tables = tables.map((t, idx) => {
      const rows = Array.from(t.querySelectorAll('tr')).map(r => 
        Array.from(r.querySelectorAll('td, th')).map(c => c.textContent.trim().replace(/\s+/g, ' '))
      ).filter(r => r.length > 0 && r.some(c => c.length > 0));
      
      return {
        idx,
        id: t.id,
        className: t.className,
        rowCount: rows.length,
        rows
      };
    }).filter(t => t.rowCount >= 1 && t.rowCount < 50);

    return result;
  });

  console.log('--- FOUND TABLES ---');
  for (const t of pageInfo.tables) {
    console.log(`\nTable ${t.idx} (id: "${t.id}", class: "${t.className}", rows: ${t.rowCount}):`);
    t.rows.forEach((r, rIdx) => {
      console.log(`  Row ${rIdx}: ${JSON.stringify(r)}`);
    });
  }

  await browser.close();
}

main().catch(console.error);
