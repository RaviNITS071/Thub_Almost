import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded' });
  const rddRow = page.locator("table#table tr[id^='informal']").filter({ hasText: 'Rural Development' });
  await rddRow.locator('td:nth-child(3) a').first().click();
  await page.waitForLoadState('domcontentloaded');

  const link = page.locator("table.list_table tr[id^='informal']").filter({ hasText: '2026_RDPR_323722_35' }).locator("td:nth-child(5) a, a").first();
  await link.click();
  await page.waitForLoadState('domcontentloaded');

  // Find all elements containing any date or time
  const matches = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const results = [];
    all.forEach(el => {
      if (el.children.length === 0 && el.innerText) {
        const t = el.innerText.trim();
        if (/\d{1,2}-[a-zA-Z]{3}-\d{4}/.test(t)) {
          results.push({
            tag: el.tagName,
            text: t,
            parent: el.parentElement?.tagName,
            parentClass: el.parentElement?.className,
            prevSibling: el.previousElementSibling?.innerText?.trim(),
            parentText: el.parentElement?.innerText?.replace(/\s+/g, ' ')?.substring(0, 150)
          });
        }
      }
    });
    return results;
  });

  console.log('ALL DATE MATCHES ON PAGE:');
  console.log(JSON.stringify(matches, null, 2));

  await browser.close();
}

check().catch(console.error);
