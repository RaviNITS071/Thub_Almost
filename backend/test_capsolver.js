import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import { captchaService } from './src/services/captcha.service.js';

async function testCapSolver() {
  console.log('--- CapSolver Configuration Check ---');
  const key = process.env.CAPSOLVER_API_KEY || '';
  console.log('CAPSOLVER_API_KEY:', key ? key.slice(0, 8) + '******' + key.slice(-4) : '(not set)');

  if (!key || key.includes('YOUR_CAPSOLVER_KEY_HERE')) {
    console.error('\n❌ Missing or placeholder CAPSOLVER_API_KEY in backend/.env');
    console.log('Please save your key in backend/.env and make sure to press Ctrl + S.');
    process.exit(1);
  }

  // 1. Check account balance
  console.log('\nChecking CapSolver account balance...');
  try {
    const balRes = await fetch('https://api.capsolver.com/getBalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key })
    });
    const balData = await balRes.json();
    if (balData.errorId && balData.errorId !== 0) {
      console.error(`❌ CapSolver Balance Error ${balData.errorCode}: ${balData.errorDescription}`);
      process.exit(1);
    }
    console.log(`💰 Account Balance: $${balData.balance} | Packages:`, balData.packages || 'None');
  } catch (err) {
    console.error('❌ Failed to check balance:', err.message);
  }

  // 2. Test live captcha solve from JKTenders
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
      console.log('Captcha image element not visible on page. Current URL:', page.url());
      await browser.close();
      return;
    }

    const imgBuffer = await captchaImg.screenshot();
    console.log(`✅ Live captcha image captured (${imgBuffer.length} bytes)!`);

    console.log('Sending captcha to CapSolver API...');
    const startTime = Date.now();
    const solution = await captchaService.solveWithCapSolver(imgBuffer.toString('base64'));
    const durationMs = Date.now() - startTime;

    console.log('\n========================================');
    console.log('🎉 CAPSOLVER SOLVED SUCCESSFULLY!');
    console.log(`Solved Text: "${solution}"`);
    console.log(`Duration: ${durationMs}ms`);
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ CapSolver solve error:', err.message);
  } finally {
    await browser.close();
  }
}

testCapSolver();
