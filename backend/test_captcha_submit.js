import { chromium } from 'playwright';

async function testSubmit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    const disposition = response.headers()['content-disposition'] || '';
    if (url.includes('app') || contentType.includes('pdf') || disposition.includes('attachment')) {
      console.log(`[RESPONSE] ${status} | ${contentType} | ${disposition} | ${url}`);
    }
  });

  page.on('download', download => {
    console.log(`[DOWNLOAD EVENT] Suggested filename: ${download.suggestedFilename()}`);
  });

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

  console.log('On DocDownCaptcha page:', page.url());

  // Test submitting with a dummy/test captcha to observe server response behavior
  await page.fill('#captchaText', '12345');
  console.log('Submitting form with 12345...');
  await page.click('#Submit');
  await page.waitForTimeout(3000);

  console.log('URL after submit:', page.url());
  const errorMsg = await page.locator('.error, .errorMessage, font[color="red"]').allInnerTexts().catch(() => []);
  console.log('Error messages on page:', errorMsg);

  const pageText = await page.locator('body').innerText();
  const lines = pageText.split('\n').filter(l => l.toLowerCase().includes('captcha') || l.toLowerCase().includes('invalid'));
  console.log('Captcha related text on page:', lines);

  await browser.close();
}

testSubmit().catch(console.error);
