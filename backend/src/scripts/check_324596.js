import { chromium } from 'playwright';

async function check324596() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to FrontEndTendersByOrganisation...');
  await page.goto('https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', { waitUntil: 'domcontentloaded' });
  
  // Enter DC-PDD
  const pddRow = page.locator("table#table tr[id^='informal']").filter({ hasText: 'DC-PDD' });
  const countLink = pddRow.locator("td:nth-child(3) a").first();
  await countLink.click();
  await page.waitForLoadState('domcontentloaded');

  console.log('Searching for 324596 on DC-PDD list...');
  // Find the row for 324596
  let found = false;
  let pageNum = 1;
  while (!found && pageNum <= 10) {
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

    const match = rows.find(r => r.id === '2026_PDD_324596_1');
    if (match) {
      console.log('FOUND ON LIST (Page ' + pageNum + '):', match);
      found = true;

      // Click the link
      const link = page.locator("table.list_table tr[id^='informal']").filter({ hasText: '2026_PDD_324596_1' }).locator("td:nth-child(5) a, a").first();
      await link.click();
      await page.waitForLoadState('domcontentloaded');

      // Inspect details page
      const details = await page.evaluate(() => {
        const allTables = Array.from(document.querySelectorAll('table')).map((t, idx) => ({
          idx,
          text: t.innerText.replace(/\s+/g, ' ').substring(0, 150)
        }));

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

        return {
          allTables,
          publishedDate: getDateByLabel(['Published Date', 'e-Published Date', 'Publish Date']),
          docDownloadStartDate: getDateByLabel(['Document Download / Sale Start Date', 'Document Download Start Date']),
          docDownloadEndDate: getDateByLabel(['Document Download / Sale End Date', 'Document Download End Date']),
          bidOpeningDate: getDateByLabel(['Bid Opening Date']),
          bidSubmissionStartDate: getDateByLabel(['Bid Submission Start Date']),
          bidSubmissionEndDate: getDateByLabel(['Bid Submission End Date']),
        };
      });

      console.log('DETAILS FROM PORTAL:', details);
      break;
    }

    // Next page
    const nextBtn = page.locator("a:has-text('Next >')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForLoadState('domcontentloaded');
      pageNum++;
    } else {
      break;
    }
  }

  await browser.close();
}

check324596().catch(console.error);
