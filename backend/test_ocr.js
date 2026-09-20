import { chromium } from 'playwright';
import { createWorker } from 'tesseract.js';

async function testCaptchaOcr() {
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

  const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
  const imgBuffer = await captchaImg.screenshot();
  console.log('Captcha image captured, byte size:', imgBuffer.length);

  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  });
  const ret = await worker.recognize(imgBuffer);
  console.log('Tesseract OCR Result:', `"${ret.data.text.trim()}"`);
  console.log('Confidence:', ret.data.confidence);
  await worker.terminate();

  await browser.close();
}

testCaptchaOcr().catch(console.error);
