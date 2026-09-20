/**
 * @file backend/src/scripts/generateFutureConfigPdf.js
 * @description Generates a publication-grade PDF manual documenting:
 * "Future Configurations: Secondary Server Automated Failover & Render Paid Plan Upgrades"
 * Outputs to `docs/` and `backend/backups/`.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function generateFutureConfigPdf() {
  console.log('🚀 Generating TenderHub Future Configurations Manual PDF...');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TenderHub Future Configurations: Secondary Server Failover & Render Upgrades</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
      @bottom-right {
        content: counter(page);
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      line-height: 1.45;
      font-size: 10pt;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .page {
      page-break-after: always;
      position: relative;
    }
    .page:last-child {
      page-break-after: avoid;
    }
    /* Header & Branding */
    .header-band {
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 8px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title-group h1 {
      font-size: 17pt;
      color: #0f172a;
      margin: 0 0 3px 0;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .title-group p {
      font-size: 9pt;
      color: #64748b;
      margin: 0;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .badge-amber { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge-primary { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .badge-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

    /* Content Typography */
    h2 {
      font-size: 11.5pt;
      color: #1e3a8a;
      border-left: 3.5px solid #d97706;
      padding-left: 7px;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 700;
    }
    h3 {
      font-size: 10pt;
      color: #0f172a;
      margin-top: 10px;
      margin-bottom: 3px;
      font-weight: 700;
    }
    p, li {
      font-size: 8.8pt;
      color: #334155;
      margin-top: 3px;
      margin-bottom: 4px;
    }
    ul, ol {
      margin: 3px 0 8px 16px;
      padding: 0;
    }
    li {
      margin-bottom: 3px;
    }

    /* Cards & Containers */
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin: 8px 0;
    }
    .alert-box {
      border-radius: 6px;
      padding: 8px 10px;
      margin: 8px 0;
      font-size: 8.5pt;
    }
    .alert-info {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .alert-warning {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .alert-danger {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 8pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }

    /* Code Blocks */
    .code-inline {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 8pt;
      background: #f1f5f9;
      padding: 1.5px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
      color: #0f172a;
    }
    .code-block {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 7.8pt;
      background: #0f172a;
      color: #f8fafc;
      padding: 8px 10px;
      border-radius: 5px;
      margin: 6px 0;
      white-space: pre-wrap;
      line-height: 1.35;
    }

    .doc-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      font-size: 7.5pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <!-- ================= PAGE 1 ================= -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>TenderHub Future Configurations Manual</h1>
        <p>Secondary Server Automated Failover &amp; Render Paid Plan Upgrade Roadmap</p>
      </div>
      <div>
        <span class="badge badge-amber">FUTURE CONFIGURATION</span>
      </div>
    </div>

    <div class="alert-box alert-warning">
      <strong>Engineering Directive:</strong> Automated switching to the secondary MongoDB cluster is <strong>intentionally disabled</strong>
      under current deployment parameters. The platform operates strictly in single-cluster mode with the primary database. Automatic failover
      will be activated upon upgrading to a Render paid service plan.
    </div>

    <h2>1. Executive Summary &amp; Architecture Context</h2>
    <p>
      TenderHub is engineered with an enterprise-grade disaster recovery and hot-standby architecture. While the platform contains complete code
      and socket redirection logic for automated database failover, this functionality has been deferred until the hosting infrastructure on
      <strong>Render</strong> is upgraded to a dedicated paid plan.
    </p>

    <h2>2. Render Free Tier vs. Paid Plan Technical Matrix</h2>
    <table>
      <thead>
        <tr>
          <th>Architecture Dimension</th>
          <th>Render Free Tier (Current)</th>
          <th>Render Paid Plan (Future Required)</th>
          <th>Impact on Automated Failover</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Process Lifecycle</strong></td>
          <td>Spins down after 15 minutes of inactivity</td>
          <td>Always-On persistent daemon (No idle sleep)</td>
          <td>Free tier wake-up latency mimics database timeouts, causing false failovers.</td>
        </tr>
        <tr>
          <td><strong>Outbound IP Routing</strong></td>
          <td>Dynamic shared IP pool across Render users</td>
          <td>Static Outbound IP / Dedicated Egress</td>
          <td>MongoDB Atlas Network Access requires persistent IP whitelisting for both clusters.</td>
        </tr>
        <tr>
          <td><strong>Connection Pooling</strong></td>
          <td>Limited socket descriptors per dyno</td>
          <td>High-capacity connection pools</td>
          <td>Simultaneous hot socket connections to primary and secondary require dedicated resources.</td>
        </tr>
        <tr>
          <td><strong>Background Workers</strong></td>
          <td>Shared CPU threads, throttled I/O</td>
          <td>Dedicated BullMQ worker dynos</td>
          <td>Scheduled cron purges and synchronization jobs run with guaranteed SLA.</td>
        </tr>
        <tr>
          <td><strong>Zero-Downtime Deploys</strong></td>
          <td>Cold restarts with brief request drop</td>
          <td>Health-checked Blue/Green rolling deploys</td>
          <td>Permits seamless socket migration between primary and secondary database clusters.</td>
        </tr>
      </tbody>
    </table>

    <h2>3. Rationale for Pausing Automated Switching on Free Tier</h2>
    <ul>
      <li><strong>Prevention of False Failovers:</strong> On the free tier, when an application instance sleeps and receives a web request, cold-start initialization can take 20&ndash;50 seconds. A 6-second timeout threshold would trigger unnecessary failovers to the backup server during standard cold starts.</li>
      <li><strong>Split-Brain Avoidance:</strong> Without a paid plan offering dedicated background workers, two separate instances could simultaneously write to different database clusters, leading to state desynchronization.</li>
      <li><strong>Strict Resource Allocation:</strong> Free tier memory limits (512 MB) are optimized for serving active user traffic rather than maintaining two concurrent high-availability database driver pools.</li>
    </ul>

    <h2>4. Current Operational Baseline (Safe Single-Cluster Mode)</h2>
    <div class="card">
      <p><strong>Current Active Configuration in <span class="code-inline">backend/src/config/db.js</span>:</strong></p>
      <ul>
        <li><strong>Primary Cluster:</strong> Exclusively connects to <span class="code-inline">MONGO_URI</span>.</li>
        <li><strong>Automated Switching:</strong> Disabled. If primary cluster is unreachable, server logs the error and gracefully halts without switching sockets.</li>
        <li><strong>Disaster Recovery:</strong> Fully operational on demand via manual runbooks (<span class="code-inline">npm run restore:db</span>, <span class="code-inline">npm run backup:full</span>).</li>
        <li><strong>Secondary Cloudflare R2:</strong> Actively receiving async document mirrors and zero-delay expired tender purges.</li>
      </ul>
    </div>

    <div class="doc-footer">
      <span>TenderHub Jammu &amp; Kashmir Operations</span>
      <span>Page 1 of 2</span>
    </div>
  </div>

  <!-- ================= PAGE 2 ================= -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>TenderHub Future Configurations Manual</h1>
        <p>Implementation Blueprint &amp; Step-by-Step Enablement Runbook</p>
      </div>
      <div>
        <span class="badge badge-primary">ACTIVATION RUNBOOK</span>
      </div>
    </div>

    <h2>5. The Automated Switching Logic (Technical Blueprint)</h2>
    <p>
      When the Render paid plan is acquired, the automated switching logic inside <span class="code-inline">backend/src/config/db.js</span>
      will be activated using the following battle-tested architecture:
    </p>

    <div class="code-block">
// backend/src/config/db.js - Automated Failover Blueprint
try {
  logger.info('[Database] Connecting to Primary MongoDB cluster...');
  activeMongoUri = primaryUri;
  isUsingSecondaryDb = false;
  await mongoose.connect(primaryUri, { serverSelectionTimeoutMS: 6000 });
} catch (primaryError) {
  logger.error(\`❌ Primary MongoDB Connection Failed: \${primaryError.message}\`);
  if (secondaryUri && secondaryUri.trim()) {
    logger.warn(\`⚠️ [FAILOVER ACTIVATED] Switching to Secondary MongoDB Cluster...\`);
    activeMongoUri = secondaryUri;
    isUsingSecondaryDb = true;
    await mongoose.connect(secondaryUri, { serverSelectionTimeoutMS: 8000 });
    logger.info(\`🎉 [FAILOVER SUCCESS] Online using Secondary MongoDB Cluster!\`);
    return;
  }
  process.exit(1);
}
    </div>

    <h2>6. Render Paid Plan Upgrade Requirements</h2>
    <p>Before activating automated switching, ensure the following Render configurations are completed:</p>
    <ol>
      <li><strong>Upgrade Web Service to Starter ($7/mo) or Standard ($25/mo):</strong>
        <ul>
          <li>Disables auto-sleep completely (ensures 100% uptime with 0s wake-up latency).</li>
          <li>Provides 1 GB to 2 GB dedicated RAM and 0.5 to 1 dedicated vCPU.</li>
        </ul>
      </li>
      <li><strong>Configure Secondary MongoDB Atlas Whitelisting:</strong>
        <ul>
          <li>Add Render outbound IP addresses to the Network Access whitelist of the secondary MongoDB cluster.</li>
        </ul>
      </li>
      <li><strong>Set Environment Variables in Render Dashboard:</strong>
        <div class="code-block">
# Render Dashboard -> Environment Variables
MONGO_URI=mongodb+srv://primary_user:pass@cluster0.mongodb.net/tenderhub
SECONDARY_MONGO_URI=mongodb+srv://backup_user:pass@cluster-secondary.mongodb.net/tenderhub
ENABLE_AUTOMATED_DB_FAILOVER=true
        </div>
      </li>
    </ol>

    <h2>7. Step-by-Step Activation Runbook</h2>
    <table>
      <thead>
        <tr>
          <th>Step #</th>
          <th>Action</th>
          <th>Command / Procedure</th>
          <th>Expected Outcome</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Step 1</strong></td>
          <td>Purchase Render Paid Plan</td>
          <td>Render Dashboard &rarr; Service Settings &rarr; Upgrade Plan (Starter/Standard)</td>
          <td>Application is always-on; idle spin-down is permanently disabled.</td>
        </tr>
        <tr>
          <td><strong>Step 2</strong></td>
          <td>Provision Secondary Database</td>
          <td>MongoDB Atlas &rarr; Deploy secondary M0/M10 cluster</td>
          <td>Obtain <span class="code-inline">SECONDARY_MONGO_URI</span> connection string.</td>
        </tr>
        <tr>
          <td><strong>Step 3</strong></td>
          <td>Sync Baseline Data</td>
          <td><span class="code-inline">MONGO_URI="secondary_uri" npm run restore:db</span></td>
          <td>Secondary cluster populated with latest snapshot from secondary R2.</td>
        </tr>
        <tr>
          <td><strong>Step 4</strong></td>
          <td>Notify Engineering &amp; Enable</td>
          <td>Instruct agent to re-enable automated failover in <span class="code-inline">db.js</span></td>
          <td>6-second timeout threshold activated with automatic socket switching.</td>
        </tr>
        <tr>
          <td><strong>Step 5</strong></td>
          <td>Execute Controlled Failover Drill</td>
          <td>Temporarily pause primary cluster in Atlas dashboard</td>
          <td>Server automatically logs <span class="code-inline">[FAILOVER ACTIVATED]</span> and stays online.</td>
        </tr>
      </tbody>
    </table>

    <div class="alert-box alert-info" style="margin-top: 14px;">
      <strong>Authoritative Sign-Off:</strong> This future configuration roadmap has been officially cataloged in the TenderHub architecture repository.
      All technical prerequisites and code changes are isolated, documented, and ready for immediate deployment upon instruction.
    </div>

    <div class="doc-footer">
      <span>TenderHub Jammu &amp; Kashmir Operations</span>
      <span>Page 2 of 2</span>
    </div>
  </div>

</body>
</html>
`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const rootDocsDir = path.resolve(process.cwd(), '../docs');
  const backendBackupsDir = path.resolve(process.cwd(), 'backups');

  if (!fs.existsSync(rootDocsDir)) {
    fs.mkdirSync(rootDocsDir, { recursive: true });
  }
  if (!fs.existsSync(backendBackupsDir)) {
    fs.mkdirSync(backendBackupsDir, { recursive: true });
  }

  const primaryPdfPath = path.join(rootDocsDir, 'TenderHub_Future_Configurations_Render_and_Failover.pdf');
  const backupCopyPdfPath = path.join(backendBackupsDir, 'TenderHub_Future_Configurations_Render_and_Failover.pdf');

  await page.pdf({
    path: primaryPdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm',
    },
  });

  // Also copy to backend/backups for self-contained controller serving
  fs.copyFileSync(primaryPdfPath, backupCopyPdfPath);

  await browser.close();

  const stats = fs.statSync(primaryPdfPath);
  console.log('🎉 SUCCESS: Complete 2-Page Future Configurations Manual PDF generated!');
  console.log(`📄 Primary Destination: ${primaryPdfPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`📁 Secondary Copy: ${backupCopyPdfPath}`);
}

generateFutureConfigPdf().catch(err => {
  console.error('❌ Failed to generate Future Config PDF:', err);
  process.exit(1);
});
