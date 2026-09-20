/**
 * @file backend/src/scripts/generateDeploymentPdf.js
 * @description Generates an executive, publication-grade Production Deployment & Operations Manual PDF
 * using Playwright Chromium. Outputs to `docs/` and `backend/backups/`.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function generateDeploymentPdf() {
  console.log('🚀 Generating TenderHub Production Deployment & Operations Manual PDF...');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TenderHub Production Deployment & Operations Manual</title>
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
    .header-band {
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 8px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title-group h1 {
      font-size: 18pt;
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
      padding: 2.5px 7px;
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .badge-primary { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .badge-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .badge-neutral { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    h2 {
      font-size: 11.5pt;
      color: #1e3a8a;
      border-left: 3.5px solid #0284c7;
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
    .alert-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .alert-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

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
    tr:nth-child(even) { background: #f8fafc; }

    code, pre {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 8pt;
    }
    .code-block {
      background: #0f172a;
      color: #38bdf8;
      padding: 6px 10px;
      border-radius: 5px;
      margin: 5px 0 8px 0;
      font-weight: 600;
      overflow-x: auto;
    }
    .code-inline {
      background: #f1f5f9;
      color: #0f172a;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
      font-family: monospace;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .meta-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
      border-radius: 5px;
    }
    .meta-item strong {
      display: block;
      font-size: 7.5pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-item span {
      font-size: 8.8pt;
      font-weight: 600;
      color: #0f172a;
    }
    .doc-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <!-- ================= PAGE 1 ================= -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>TenderHub Deployment Manual</h1>
        <p>Production Cloud Architecture, Deployment Blueprint &amp; Operations Guide</p>
      </div>
      <div>
        <span class="badge badge-primary">OFFICIAL SPECIFICATION</span>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <strong>Application Architecture</strong>
        <span>Monorepo: Backend API + Frontend SPA + Admin Panel</span>
      </div>
      <div class="meta-item">
        <strong>Primary Cloud Platform</strong>
        <span>Render / Railway / Cloudflare Pages</span>
      </div>
      <div class="meta-item">
        <strong>Database &amp; Cache</strong>
        <span>MongoDB Atlas (M0/M10) + Upstash Redis</span>
      </div>
      <div class="meta-item">
        <strong>Storage Layer</strong>
        <span>Dual Cloudflare R2 Buckets (Primary &amp; Backup)</span>
      </div>
    </div>

    <h2>1. Production Topology &amp; Service Boundaries</h2>
    <p>
      TenderHub is split into three decoupled components to ensure high availability, fast asset delivery, and operational security:
    </p>

    <table>
      <thead>
        <tr>
          <th>Service Name</th>
          <th>Directory</th>
          <th>Type</th>
          <th>Production Host</th>
          <th>Internal Port</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>tenderhub-api</strong></td>
          <td><span class="code-inline">backend/</span></td>
          <td>Node.js / Express Web Service</td>
          <td>Render / Railway / AWS EC2</td>
          <td>Port 8000</td>
        </tr>
        <tr>
          <td><strong>tenderhub-web</strong></td>
          <td><span class="code-inline">frontend/</span></td>
          <td>React 19 / Vite Static Client</td>
          <td>Cloudflare Pages / Vercel / Render</td>
          <td>Port 5173 / CDN</td>
        </tr>
        <tr>
          <td><strong>tenderhub-admin</strong></td>
          <td><span class="code-inline">admin-panel/</span></td>
          <td>React 19 / Vite Admin Dashboard</td>
          <td>Private Subdomain / Cloudflare Access</td>
          <td>Port 5174 / CDN</td>
        </tr>
        <tr>
          <td><strong>tenderhub-worker</strong></td>
          <td><span class="code-inline">backend/src/workers/</span></td>
          <td>BullMQ Asynchronous Background Worker</td>
          <td>Background Worker / Daemon Process</td>
          <td>Headless Playwright</td>
        </tr>
      </tbody>
    </table>

    <h2>2. Option A: 1-Click Deployment via Render Blueprint (render.yaml)</h2>
    <p>The repository root contains an automated deployment specification (<span class="code-inline">render.yaml</span>).</p>
    <div class="card">
      <p><strong>Deployment Steps:</strong></p>
      <ol>
        <li>Push repository to GitHub: <span class="code-inline">git push origin main</span></li>
        <li>Open <a href="https://dashboard.render.com">Render Dashboard</a> &gt; Click <strong>New +</strong> &gt; Select <strong>Blueprint</strong>.</li>
        <li>Connect repository: Render automatically detects <span class="code-inline">render.yaml</span>.</li>
        <li>Provide required secrets (<span class="code-inline">MONGO_URI</span>, <span class="code-inline">REDIS_URL</span>, <span class="code-inline">R2_*</span>).</li>
        <li>Click <strong>Apply</strong>. Render builds and launches both the Web Service and Static Site concurrently.</li>
      </ol>
    </div>

    <h2>3. Terminal Commands for Generating Both PDF Manuals</h2>
    <div class="alert-box alert-success">
      <strong>Terminal Automation:</strong> You can regenerate either or both instruction manuals anytime directly from the terminal inside the <span class="code-inline">backend</span> directory.
    </div>

    <div class="code-block">
# 1. Generate Disaster Recovery & Backup Manual (PDF):
npm run manual:disaster

# 2. Generate Production Deployment & Operations Manual (PDF):
npm run manual:deployment

# 3. Generate BOTH Official Manuals Simultaneously:
npm run manuals:all
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
        <h1>TenderHub Deployment Manual</h1>
        <p>Environment Variables, Security Hardening &amp; Health Telemetry</p>
      </div>
      <div>
        <span class="badge badge-success">CONFIGURATION &amp; AUDIT</span>
      </div>
    </div>

    <h2>4. Production Environment Variables Reference</h2>
    <table>
      <thead>
        <tr>
          <th>Variable Name</th>
          <th>Service Scope</th>
          <th>Production Value / Recommendation</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="code-inline">PORT</span></td>
          <td>Backend</td>
          <td><span class="code-inline">8000</span> (or auto-assigned by cloud provider)</td>
        </tr>
        <tr>
          <td><span class="code-inline">NODE_ENV</span></td>
          <td>Backend</td>
          <td><span class="code-inline">production</span></td>
        </tr>
        <tr>
          <td><span class="code-inline">MONGO_URI</span></td>
          <td>Backend</td>
          <td>MongoDB Atlas Primary Connection String</td>
        </tr>
        <tr>
          <td><span class="code-inline">SECONDARY_MONGO_URI</span></td>
          <td>Backend</td>
          <td>Automated Fallback Cluster (Instant Failover)</td>
        </tr>
        <tr>
          <td><span class="code-inline">REDIS_URL</span></td>
          <td>Backend / Worker</td>
          <td>Upstash Serverless Redis or Redis Cloud URI</td>
        </tr>
        <tr>
          <td><span class="code-inline">R2_ACCOUNT_ID</span></td>
          <td>Backend</td>
          <td>Primary Cloudflare Account ID (<span class="code-inline">tenderhub</span>)</td>
        </tr>
        <tr>
          <td><span class="code-inline">BACKUP_R2_ACCOUNT_ID</span></td>
          <td>Backend</td>
          <td>Secondary Cloudflare Account ID (<span class="code-inline">tenderhub-backup</span>)</td>
        </tr>
        <tr>
          <td><span class="code-inline">ADMIN_SECRET_KEY</span></td>
          <td>Backend / Admin</td>
          <td>32-character random string for Admin Panel auth</td>
        </tr>
        <tr>
          <td><span class="code-inline">VITE_API_URL</span></td>
          <td>Frontend / Admin</td>
          <td>Public Backend HTTPS URL (e.g. <span class="code-inline">https://api.tenderhub.in</span>)</td>
        </tr>
      </tbody>
    </table>

    <h2>5. Post-Deployment Verification &amp; Health Check Checklist</h2>
    <div class="card">
      <ol>
        <li><strong>Health Endpoint:</strong> Test <span class="code-inline">https://your-backend.com/health</span> (returns 200 OK with uptime).</li>
        <li><strong>Database Connectivity:</strong> Check logs for <span class="code-inline">MongoDB connected successfully [PRIMARY DB]</span>.</li>
        <li><strong>Redis &amp; BullMQ Queues:</strong> Check logs for <span class="code-inline">Redis Connected Successfully</span>.</li>
        <li><strong>Scheduler Confirmation:</strong> Verify all 5 automated scraping slots (09:00, 10:00, 13:00, 15:00, 18:30) and 02:00 AM retention cron are active.</li>
        <li><strong>Verify Admin Panel Telemetry:</strong> Log in to <span class="code-inline">http://localhost:5174</span> or your admin subdomain, open <strong>Telemetry &amp; Health</strong> and <strong>Backup &amp; Recovery</strong>.</li>
      </ol>
    </div>

    <div class="alert-box alert-info">
      <strong>Engineering Support:</strong> Both manual PDFs (<span class="code-inline">TenderHub_Disaster_Recovery_and_Backup_Manual.pdf</span> and <span class="code-inline">TenderHub_Production_Deployment_Manual.pdf</span>) are archived in the <span class="code-inline">docs/</span> folder of the repository.
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

  const primaryPdfPath = path.join(rootDocsDir, 'TenderHub_Production_Deployment_Manual.pdf');
  const backupCopyPdfPath = path.join(backendBackupsDir, 'TenderHub_Production_Deployment_Manual.pdf');

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

  fs.copyFileSync(primaryPdfPath, backupCopyPdfPath);
  await browser.close();

  const stats = fs.statSync(primaryPdfPath);
  console.log('🎉 SUCCESS: TenderHub Production Deployment Manual PDF generated!');
  console.log(`📄 Primary Destination: ${primaryPdfPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`📁 Secondary Copy: ${backupCopyPdfPath}`);
}

generateDeploymentPdf().catch(err => {
  console.error('❌ Failed to generate Deployment PDF:', err);
  process.exit(1);
});
