import { chromium } from 'playwright';

async function inspectTenderId() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'networkidle' });
  
  // 1. Inspect all departments
  const depts = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.list_table tr'));
    return rows.map((r, idx) => {
      const a = r.querySelector('td a');
      const tds = Array.from(r.querySelectorAll('td')).map(t => t.textContent.trim());
      return {
        idx,
        text: a ? a.textContent.trim() : null,
        href: a ? a.getAttribute('href') : null,
        allTds: tds
      };
    }).filter(d => d.href);
  });
  console.log(`Found ${depts.length} departments:`);
  depts.slice(0, 8).forEach(d => console.log(` [${d.idx}] ${d.allTds.join(' | ')} => ${d.href}`));

  // 2. Open first department
  await page.goto('https://jktenders.gov.in' + depts[0].href, { waitUntil: 'networkidle' });
  
  // 3. Inspect first tender row in table
  const firstRow = await page.evaluate(() => {
    const row = document.querySelector("table.list_table tr:nth-child(2)");
    return {
      text: row ? row.innerText : '',
      html: row ? row.innerHTML : '',
      aHref: row ? row.querySelector('a')?.getAttribute('href') : ''
    };
  });
  console.log('\nFirst tender row in table:\n', firstRow.text);

  // 4. Open tender details
  await page.goto('https://jktenders.gov.in' + firstRow.aHref, { waitUntil: 'networkidle' });
  
  const pageDetails = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll('td'));
    const rows = [];
    tds.forEach(td => {
      const text = td.textContent.trim();
      if (text.toLowerCase().includes('tender id') || 
          text.toLowerCase().includes('tender ref') || 
          text.toLowerCase().includes('published date') ||
          text.toLowerCase().includes('tender title')) {
        rows.push({ label: text, next: td.nextElementSibling?.textContent.trim() });
      }
    });
    return rows;
  });
  console.log('\nTender details page fields:\n', JSON.stringify(pageDetails, null, 2));

  await browser.close();
}

inspectTenderId().catch(console.error);
