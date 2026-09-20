import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import { captchaService } from './src/services/captcha.service.js';

async function testGeminiVision() {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  console.log(`--- Google Gemini (${model}) Vision Configuration Check ---`);
  const key = process.env.GEMINI_API_KEY || '';
  console.log('GEMINI_API_KEY:', key && key !== 'dummy_key' ? key.slice(0, 7) + '******' + key.slice(-4) : '(not set / dummy_key)');

  if (!key || key === 'dummy_key' || key.includes('YOUR_GEMINI_KEY_HERE')) {
    console.error('\n❌ Missing or dummy GEMINI_API_KEY in backend/.env');
    console.log('Get a free API key from Google AI Studio: https://aistudio.google.com/app/apikey');
    console.log('Then add it to backend/.env like: GEMINI_API_KEY=AIzaSy...');
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

    // Also preprocess image (remove blue dots + upscale)
    const cleanedBuffer = await captchaService.preprocessCaptchaImage(imgBuffer);
    console.log(`✅ Image preprocessed (${cleanedBuffer.length} bytes)!`);

    console.log('\n--- Test 1: Gemini on Cleaned Preprocessed Image ---');
    const startPre = Date.now();
    const solutionPre = await captchaService.solveWithGemini(cleanedBuffer.toString('base64'));
    console.log(`Cleaned Image Solution: "${solutionPre}" in ${Date.now() - startPre}ms`);

    console.log('\n--- Test 2: Gemini on Raw Image ---');
    const startRaw = Date.now();
    const solutionRaw = await captchaService.solveWithGemini(imgBuffer.toString('base64'));
    console.log(`Raw Image Solution: "${solutionRaw}" in ${Date.now() - startRaw}ms`);

    console.log('\n--- Test 3: Local Preprocessed Tesseract OCR ---');
    const startTess = Date.now();
    const solutionTess = await captchaService.solveWithTesseract(imgBuffer.toString('base64'));
    console.log(`Tesseract Solution: "${solutionTess}" in ${Date.now() - startTess}ms`);

    const solution = (solutionPre && solutionPre.length >= 5) ? solutionPre : (solutionRaw && solutionRaw.length >= 5 ? solutionRaw : solutionTess);

    console.log('\n========================================');
    console.log(`Selected Solution: "${solution}"`);
    console.log('========================================\n');

    // Test submitting to JKTenders to confirm portal acceptance!
    console.log(`Submitting "${solution}" to JKTenders to verify portal acceptance...`);
    const inputLocator = page.locator("#captchaText");
    await inputLocator.fill(solution);
    await inputLocator.dispatchEvent('input').catch(() => {});
    await inputLocator.dispatchEvent('change').catch(() => {});

    // 2-second settling pause
    await page.waitForTimeout(2000);

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
      console.log(`✅ PORTAL ACCEPTED! Gemini passed on first attempt!`);
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

testGeminiVision();
