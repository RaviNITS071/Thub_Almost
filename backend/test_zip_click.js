import { chromium } from 'playwright';

async function testZipClick() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });
  await page.locator('table.list_table tr td a').first().click();
  await page.waitForLoadState('networkidle');

  await page.locator("table.list_table tr td a[href*='DirectLink']").first().click();
  await page.waitForLoadState('networkidle');

  console.log('Tender Details URL:', page.url());
  const zipLink = page.locator("a:has-text('Download as zip file'), #DirectLink_8").first();
  console.log('Zip link text:', await zipLink.innerText());
  console.log('Zip link href:', await zipLink.getAttribute('href'));

  // Click Zip link and see what happens to page
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    zipLink.click()
  ]);

  console.log('URL after clicking Zip link:', page.url());
  console.log('Has Captcha Image:', await page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").count() > 0);
  console.log('Has Captcha Input:', await page.locator("input[name='captchaText'], #captchaText, input[name*='captcha']").count() > 0);
  console.log('Has Submit button:', await page.locator("input[type='submit'], input[value*='Submit']").count() > 0);

  await browser.close();
}

testZipClick().catch(console.error);
