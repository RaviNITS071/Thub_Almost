import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('1. Loading department list...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });
  
  const firstDept = page.locator('table.list_table tr td a').first();
  const deptHref = await firstDept.getAttribute('href');
  console.log('2. Opening department:', deptHref);
  await firstDept.click();
  await page.waitForLoadState('networkidle');

  const tenderLink = page.locator("table.list_table tr td a[href*='DirectLink']").first();
  const href = await tenderLink.getAttribute('href');
  console.log('3. Tender link href:', href);

  // Test 1: Click directly
  await tenderLink.click();
  await page.waitForLoadState('networkidle');
  console.log('4. URL after click on SAME page:', page.url());
  const bodyText1 = await page.locator('body').innerText();
  console.log('   Has Tender ID after click:', bodyText1.includes('Tender ID'));
  console.log('   PDF link count:', await page.locator("a:has-text('.pdf')").count());
  console.log('   Zip link count:', await page.locator("a:has-text('Download as zip file')").count());

  // Test 2: In a new tab/page with goto
  const page2 = await context.newPage();
  console.log('5. Navigating in NEW tab using page2.goto...');
  const fullUrl = href.startsWith('http') ? href : `https://jktenders.gov.in${href}`;
  await page2.goto(fullUrl, { waitUntil: 'networkidle' });
  console.log('   URL in new tab:', page2.url());
  const bodyText2 = await page2.locator('body').innerText();
  console.log('   Has Tender ID in new tab:', bodyText2.includes('Tender ID'));
  console.log('   PDF link count in new tab:', await page2.locator("a:has-text('.pdf')").count());
  console.log('   Zip link count in new tab:', await page2.locator("a:has-text('Download as zip file')").count());
  if (bodyText2.includes('stale') || bodyText2.includes('Session') || bodyText2.includes('expired')) {
    console.log('   ⚠️ Stale / Expired session detected in new tab!');
  }

  await browser.close();
}

test().catch(console.error);
