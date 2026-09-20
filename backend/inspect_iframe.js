import { chromium } from 'playwright';

async function inspectIframe() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });
  await page.locator('table.list_table tr td a').first().click();
  await page.waitForLoadState('networkidle');

  await page.locator("table.list_table tr td a[href*='DirectLink']").first().click();
  await page.waitForLoadState('networkidle');

  const pdfLink = page.locator("a:has-text('.pdf'), #docDownoad").first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    pdfLink.click()
  ]);

  const fn = await page.evaluate(() => window.validateCaptcha ? window.validateCaptcha.toString() : 'Not found');
  console.log('validateCaptcha function:\n', fn);

  // Check what happens on submit
  const formHtml = await page.locator('#frmCaptcha').innerHTML();
  console.log('Form innerHTML length:', formHtml.length);

  await browser.close();
}

inspectIframe().catch(console.error);
