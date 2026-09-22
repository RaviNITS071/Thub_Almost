import { chromium } from 'playwright';

async function checkLive() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to FrontEndTendersByOrganisation...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded' });
  
  const rddRow = page.locator("table#table tr[id^='informal']").filter({ hasText: 'Rural Development' });
  const countLink = rddRow.locator("td:nth-child(3) a").first();
  await countLink.click();
  await page.waitForLoadState('domcontentloaded');

  console.log('Searching for 324703_22 on RDD list...');
  let found = false;
  let pageNum = 1;
  while (!found && pageNum <= 30) {
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("table.list_table tr[id^='informal']"));
      return trs.map(tr => {
        const tds = tr.querySelectorAll('td');
        return {
          id: tr.innerText.match(/\[(.*?)\]/g)?.pop()?.replace(/[\[\]]/g, ''),
          tds: Array.from(tds).map(td => td.innerText.trim().replace(/\s+/g, ' '))
        };
      });
    });

    const match = rows.find(r => r.id === '2026_RDPR_324703_22');
    if (match) {
      console.log(`FOUND ON LIST (Page ${pageNum}):`, JSON.stringify(match, null, 2));
      found = true;

      // Click the link to view details
      const link = page.locator("table.list_table tr[id^='informal']").filter({ hasText: '2026_RDPR_324703_22' }).locator("td:nth-child(5) a, a").first();
      await link.click();
      await page.waitForLoadState('domcontentloaded');

      const details = await page.evaluate(() => {
        const getDateByLabel = (labels) => {
          const normalizedLabels = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase().replace(/[:₹\s]/g, ''));
          const tds = Array.from(document.querySelectorAll('td'));
          for (const td of tds) {
            if (td.querySelector('table')) continue;
            const text = td.innerText.trim().toLowerCase().replace(/[:₹\s]/g, '');
            if (normalizedLabels.includes(text)) {
              let next = td.nextElementSibling;
              if (next && next.tagName === 'TD') {
                const val = next.innerText.trim().replace(/\s+/g, ' ');
                if (val && val !== 'NA' && val !== 'N/A') return val;
              }
            }
          }
          return '';
        };

        const allCriticalDates = {};
        const allTds = Array.from(document.querySelectorAll('td'));
        allTds.forEach(td => {
          const t = td.innerText.trim();
          if (t.includes('Date') && td.nextElementSibling) {
            allCriticalDates[t] = td.nextElementSibling.innerText.trim().replace(/\s+/g, ' ');
          }
        });

        return {
          publishedDate: getDateByLabel(['Published Date', 'e-Published Date', 'Publish Date']),
          docDownloadStartDate: getDateByLabel(['Document Download / Sale Start Date', 'Document Download Start Date']),
          bidSubmissionStartDate: getDateByLabel(['Bid Submission Start Date']),
          allCriticalDates
        };
      });

      console.log('DETAILS FROM PORTAL:', JSON.stringify(details, null, 2));
      break;
    }

    const nextBtn = page.locator("a:has-text('Next >')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForLoadState('domcontentloaded');
      pageNum++;
    } else {
      break;
    }
  }

  if (!found) {
    console.log('Tender 2026_RDPR_323722_35 was not found in first 30 pages.');
  }

  await browser.close();
}

checkLive().catch(console.error);
