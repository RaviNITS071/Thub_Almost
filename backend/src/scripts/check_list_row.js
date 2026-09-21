import { chromium } from 'playwright';

async function checkListRow() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded' });
  const pddRow = page.locator("table#table tr[id^='informal']").filter({ hasText: 'DC-PDD' });
  await pddRow.locator("td:nth-child(3) a").first().click();
  await page.waitForLoadState('domcontentloaded');

  let pageNum = 1;
  while (pageNum <= 10) {
    const row = page.locator("table.list_table tr[id^='informal']").filter({ hasText: '2026_PDD_324596_1' });
    if (await row.count() > 0) {
      const tds = await row.first().locator('td').allInnerTexts();
      console.log('LIST ROW TDS FOR 324596:', JSON.stringify(tds));
      break;
    }
    const nextBtn = page.locator("a:has-text('Next >')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForLoadState('domcontentloaded');
      pageNum++;
    } else {
      break;
    }
  }
  await browser.close();
}

checkListRow().catch(console.error);
