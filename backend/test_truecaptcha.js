import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import { captchaService } from './src/services/captcha.service.js';

async function testTrueCaptchaLive() {
  console.log('--- TrueCaptcha Configuration Check ---');
  console.log('TRUECAPTCHA_USER_ID:', process.env.TRUECAPTCHA_USER_ID || '(not set)');
  console.log('TRUECAPTCHA_API_KEY:', process.env.TRUECAPTCHA_API_KEY ? '******' + process.env.TRUECAPTCHA_API_KEY.slice(-4) : '(not set)');

  if (!process.env.TRUECAPTCHA_USER_ID || !process.env.TRUECAPTCHA_API_KEY) {
    console.error('\n❌ Missing TRUECAPTCHA_USER_ID or TRUECAPTCHA_API_KEY in backend/.env');
    process.exit(1);
  }

  console.log('\nLaunching headless browser to capture a real portal captcha...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Find first organization link
    const orgLink = page.locator('table.list_table tr td a').first();
    await orgLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Find first tender link
    const tenderLink = page.locator("table.list_table tr td a[href*='DirectLink']").first();
    await tenderLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Find PDF / Doc download link
    const pdfLink = page.locator("a:has-text('.pdf'), #docDownoad").first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      pdfLink.click()
    ]);

    const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
    const isVisible = await captchaImg.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      console.log('Captcha image element not visible on page. Current URL:', page.url());
      await browser.close();
      return;
    }

    const imgBuffer = await captchaImg.screenshot();
    console.log(`✅ Real captcha image captured from JKTenders (${imgBuffer.length} bytes)!`);

    console.log('Sending real captcha to TrueCaptcha API...');
    const result = await captchaService.solveWithTrueCaptcha(imgBuffer.toString('base64'));

    console.log('\n========================================');
    console.log('🎉 TRUECAPTCHA SOLVED SUCCESSFULLY!');
    console.log('Solved Text:', `"${result}"`);
    console.log('Provider:', 'TRUECAPTCHA');
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testTrueCaptchaLive();
