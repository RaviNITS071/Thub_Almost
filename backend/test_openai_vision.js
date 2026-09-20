import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import { captchaService } from './src/services/captcha.service.js';

async function testOpenAIVision() {
  console.log('--- OpenAI Vision Configuration Check ---');
  const key = process.env.OPENAI_API_KEY || '';
  console.log('OPENAI_API_KEY:', key && key !== 'dummy_key' ? key.slice(0, 7) + '******' + key.slice(-4) : '(not set / dummy_key)');

  if (!key || key === 'dummy_key' || key.includes('YOUR_OPENAI_KEY_HERE')) {
    console.error('\n❌ Missing or dummy OPENAI_API_KEY in backend/.env');
    console.log('Please get your API key from https://platform.openai.com/api-keys and save it in backend/.env');
    process.exit(1);
  }

  console.log('\nLaunching headless browser to capture a live JKTenders portal captcha...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('table.list_table tr td a').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.locator("table.list_table tr td a[href*='DirectLink']").first().click();
    await page.waitForLoadState('domcontentloaded');
    const pdfLink = page.locator("a:has-text('.pdf'), #docDownoad").first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      pdfLink.click()
    ]);

    const captchaImg = page.locator("img[name='captchaImage'], #captchaImage, img[src*='captcha']").first();
    const isVisible = await captchaImg.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      console.log('Captcha image element not visible. URL:', page.url());
      await browser.close();
      return;
    }

    const imgBuffer = await captchaImg.screenshot();
    console.log(`✅ Live captcha image captured (${imgBuffer.length} bytes)!`);

    console.log('Sending captcha to OpenAI gpt-4o-mini Vision...');
    const startTime = Date.now();
    const solution = await captchaService.solveWithOpenAI(imgBuffer.toString('base64'));
    const durationMs = Date.now() - startTime;

    console.log('\n========================================');
    console.log('🎉 OPENAI VISION SOLVED SUCCESSFULLY!');
    console.log(`Solved Text: "${solution}" (exact case preserved)`);
    console.log(`Duration: ${durationMs}ms`);
    console.log('========================================\n');

    // Test submitting to JKTenders to confirm portal acceptance!
    console.log(`Submitting "${solution}" to JKTenders to verify portal acceptance...`);
    const inputLocator = page.locator("#captchaText");
    await inputLocator.fill(solution);
    await inputLocator.dispatchEvent('input').catch(() => {});
    await inputLocator.dispatchEvent('change').catch(() => {});

    const submitBtn = page.locator("#Submit");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
      submitBtn.click({ force: true })
    ]);

    await page.waitForTimeout(2000);

    const stillCaptcha = await page.locator("img[name='captchaImage'], #captchaImage").isVisible({ timeout: 2000 }).catch(() => false);
    const hasTenderDetails = await page.locator("a[href*='download'], a.customButton_link, table.list_table").isVisible({ timeout: 2000 }).catch(() => false);

    if (!stillCaptcha || hasTenderDetails) {
      console.log('======================================================');
      console.log(`✅ PORTAL ACCEPTED! Captcha passed on first attempt!`);
      console.log('======================================================\n');
    } else {
      const errorMsg = await page.locator('.error, .errorMessage, font[color="red"]').allInnerTexts().catch(() => []);
      console.log(`⚠️ Portal response:`, errorMsg);
    }

  } catch (err) {
    console.error('❌ Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testOpenAIVision();
