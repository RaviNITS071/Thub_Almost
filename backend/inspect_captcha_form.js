import { chromium } from 'playwright';

async function inspectForm() {
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

  console.log('Captcha Page URL:', page.url());
  const formHtml = await page.locator('form').evaluateAll(forms => forms.map(f => ({
    name: f.name,
    id: f.id,
    action: f.action,
    method: f.method,
    inputs: Array.from(f.querySelectorAll('input, button, a')).map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      value: el.value,
      text: el.textContent.trim(),
      onclick: el.getAttribute('onclick'),
      href: el.getAttribute('href')
    }))
  })));
  console.log('Form structure:', JSON.stringify(formHtml, null, 2));

  // Also check if there are any iframes or embeds
  const iframes = await page.locator('iframe').count();
  console.log('Number of iframes:', iframes);

  await browser.close();
}

inspectForm().catch(console.error);
