/**
 * @file backend/src/scripts/generateAdaptersGuidePdf.js
 * @description Generates a publication-grade, executive architectural PDF guide
 * documenting all tender fetching adapters present in the TenderHub project,
 * their technical specifications, execution commands, lifecycle, and operational rules.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function generateAdaptersGuidePdf() {
  console.log('🚀 Generating TenderHub Ingestion Adapters Architecture Guide PDF...');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TenderHub - Ingestion Adapters Architecture & Operations Guide</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm 12mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      line-height: 1.42;
      font-size: 9pt;
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
    
    /* Header Band */
    .header-band {
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 6px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title-group h1 {
      font-size: 15.5pt;
      color: #0f172a;
      margin: 0 0 2px 0;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .title-group .subtitle {
      font-size: 8.5pt;
      color: #475569;
      font-weight: 500;
    }
    .badge-group {
      text-align: right;
    }
    .badge {
      display: inline-block;
      padding: 2.5px 7px;
      font-size: 7pt;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 4px;
    }
    .badge-primary { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-amber { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; }

    /* Meta Box */
    .meta-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 6px 10px;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      font-size: 8pt;
    }
    .meta-item strong { display: block; color: #64748b; font-size: 7pt; text-transform: uppercase; }
    .meta-item span { font-weight: 700; color: #0f172a; font-family: monospace; font-size: 8.5pt; }

    /* Headings */
    h2 {
      font-size: 11pt;
      color: #1e3a8a;
      border-left: 3.5px solid #1e3a8a;
      padding-left: 7px;
      margin: 10px 0 6px 0;
      font-weight: 700;
    }
    h3 {
      font-size: 9.5pt;
      color: #334155;
      margin: 7px 0 3px 0;
      font-weight: 700;
    }
    p { margin: 0 0 5px 0; color: #334155; }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 10px 0;
      font-size: 8pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4.5px 6px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7pt;
      letter-spacing: 0.3px;
    }
    tr:nth-child(even) { background: #f8fafc; }
    .num { text-align: right; font-family: monospace; font-weight: 700; }
    .code-inline {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 7.5pt;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
      color: #0f172a;
    }

    /* Cards & Grids */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 7px 9px;
      background: #ffffff;
    }
    .card-highlight {
      border-color: #93c5fd;
      background: #f8fbff;
    }
    .card-title {
      font-size: 8.5pt;
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card p { font-size: 7.8pt; margin-bottom: 4px; }

    /* Code Blocks */
    .cmd-box {
      background: #0f172a;
      color: #f8fafc;
      padding: 6px 9px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 7.5pt;
      line-height: 1.35;
      margin: 4px 0 6px 0;
      overflow-x: auto;
      border: 1px solid #334155;
    }
    .cmd-box .prompt { color: #38bdf8; font-weight: 700; }
    .cmd-box .comment { color: #94a3b8; font-style: italic; }

    /* Alerts */
    .alert {
      border-radius: 4px;
      padding: 6px 9px;
      margin: 6px 0;
      font-size: 8pt;
    }
    .alert-info {
      background: #eff6ff;
      border-left: 3.5px solid #2563eb;
      color: #1e40af;
    }
    .alert-warning {
      background: #fffbeb;
      border-left: 3.5px solid #d97706;
      color: #92400e;
    }
    .alert-success {
      background: #ecfdf5;
      border-left: 3.5px solid #059669;
      color: #065f46;
    }

    /* Footer */
    .page-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #cbd5e1;
      padding-top: 4px;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #64748b;
    }
    .page-footer strong { color: #1e3a8a; }

    ul { margin: 0 0 6px 14px; padding: 0; }
    li { margin-bottom: 2.5px; }
  </style>
</head>
<body>

  <!-- ====================================================================== -->
  <!-- PAGE 1: EXECUTIVE OVERVIEW & ADAPTER MATRIX                           -->
  <!-- ====================================================================== -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>TenderHub Ingestion Adapters Guide</h1>
        <div class="subtitle">Architecture, Specifications, Capabilities & Operations Manual</div>
      </div>
      <div class="badge-group">
        <span class="badge badge-primary">Version 2.4</span>
        <span class="badge badge-success">Production Grade</span>
      </div>
    </div>

    <div class="meta-box">
      <div class="meta-item">
        <strong>Architecture</strong>
        <span>Hexagonal / Adapter</span>
      </div>
      <div class="meta-item">
        <strong>Total Adapters</strong>
        <span>5 Specialized Classes</span>
      </div>
      <div class="meta-item">
        <strong>Engine Stack</strong>
        <span>Playwright + Ghostscript</span>
      </div>
      <div class="meta-item">
        <strong>Cloud Persistence</strong>
        <span>Atlas + Cloudflare R2</span>
      </div>
    </div>

    <h2>1. Executive Architecture & Ingestion Philosophy</h2>
    <p>
      TenderHub implements a decoupled <strong>Adapter Architecture</strong> to communicate with the Jammu & Kashmir e-Procurement Portal (<code>jktenders.gov.in</code>). Crawling state-level government infrastructure requires handling multi-department hierarchies, nested NIT work packages (sibling tenders), variable captcha formats, asynchronous document opening windows, and large tender dossiers (>5MB).
    </p>
    <p>
      To maximize reliability, throughput, and minimize server overhead, the ingestion engine enforces a <strong>strict separation of roles</strong>:
    </p>

    <div class="alert alert-info">
      <strong>Core Architectural Rule:</strong> <code>JKTenderAdapter</code> is used <em>strictly and exclusively</em> when crawling the entire catalog of active tenders across all 31 government organisations. In all other operational workflows (daily incremental syncs, scheduled cron cycles, targeted date backfills, and missing PDF document recovery), the system <em>always</em> utilizes <code>JKTenderDateAdapter</code>.
    </div>

    <h2>2. Complete Adapter Landscape & Capability Matrix</h2>
    <table>
      <thead>
        <tr>
          <th>Adapter Class</th>
          <th>Primary Role & Target Use Case</th>
          <th>Portal Target</th>
          <th>Docs & BOQ</th>
          <th>R2 Archive</th>
          <th>Execution Model</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong><code>JKTenderAdapter</code></strong></td>
          <td><strong>Bulk Active Crawler:</strong> Scrapes all active tenders across all 31 organisations. Handles multi-tender sub-tables.</td>
          <td><code>FrontEndTendersByOrganisation</code></td>
          <td><span style="color:#059669; font-weight:700;">YES</span> (Ghostscript >5MB)</td>
          <td><span style="color:#059669; font-weight:700;">YES</span> (Docs + <code>tender.json</code>)</td>
          <td>Heavy Bulk Script (Manual / Quarterly)</td>
        </tr>
        <tr>
          <td><strong><code>JKTenderDateAdapter</code></strong></td>
          <td><strong>Targeted Date & Recovery Engine:</strong> Ingests tenders for a specific published date; recovers pending docs.</td>
          <td><code>FrontEndTendersByOrganisation</code> (Date Filtered)</td>
          <td><span style="color:#059669; font-weight:700;">YES</span> (Ghostscript >5MB)</td>
          <td><span style="color:#059669; font-weight:700;">YES</span> (Docs + <code>tender.json</code>)</td>
          <td>Automated Crons (5x Daily) & Worker</td>
        </tr>
        <tr>
          <td><strong><code>JKTenderMetadataAdapter</code></strong></td>
          <td><strong>Metadata Enrichment Engine:</strong> Fast table & date extraction without downloading binaries or solving PDF captchas.</td>
          <td>Direct Tender Detail Pages</td>
          <td><span style="color:#b45309; font-weight:700;">NO</span> (Preserves R2 links)</td>
          <td><span style="color:#059669; font-weight:700;">YES</span> (Fresh <code>tender.json</code>)</td>
          <td>Maintenance & Date Repair Utility</td>
        </tr>
        <tr>
          <td><strong><code>DummyTenderAdapter</code></strong></td>
          <td><strong>Sandbox Mock Adapter:</strong> Generates realistic synthetic tenders with simulated network delays for offline testing.</td>
          <td>Synthetic In-Memory</td>
          <td><span style="color:#64748b;">NO</span> (Mock URLs)</td>
          <td><span style="color:#64748b;">NO</span> (Offline)</td>
          <td>CI/CD Pipelines & Frontend Development</td>
        </tr>
        <tr>
          <td><strong><code>TenderSourceAdapter</code></strong></td>
          <td><strong>Abstract Interface:</strong> Enforces contract compliance (<code>fetchList</code>, <code>fetchDetail</code>, <code>normalize</code>).</td>
          <td>Abstract Contract</td>
          <td>N/A</td>
          <td>N/A</td>
          <td>Base Class Inheritance Blueprint</td>
        </tr>
      </tbody>
    </table>

    <h2>3. End-to-End Ingestion Pipeline Architecture</h2>
    <div class="card-grid">
      <div class="card card-highlight">
        <div class="card-title">1. Portal Crawl & Captcha Resolution</div>
        <p>Headless Playwright Chromium navigates portal tables. Live captchas are solved using a triple-redundancy pipeline: <strong>Google Gemini Flash Vision</strong> &rarr; <strong>Hugging Face Router Vision</strong> &rarr; <strong>Local Tesseract OCR</strong>.</p>
      </div>
      <div class="card card-highlight">
        <div class="card-title">2. Document Download & Compression</div>
        <p>PDFs, ZIPs, and XLS BOQ files are streamed into memory. PDFs exceeding 5MB are automatically compressed via <strong>Ghostscript (150 DPI)</strong>, preventing network bloat while preserving clarity.</p>
      </div>
      <div class="card card-highlight">
        <div class="card-title">3. Atomic MongoDB Atlas Upsert</div>
        <p>Tenders are persisted via <code>findOneAndUpdate</code>. Subdocument arrays (<code>nitDocuments</code>, <code>workItemDocuments</code>) are merged without duplicates. Sibling packages are linked via <code>baseTenderId</code>.</p>
      </div>
      <div class="card card-highlight">
        <div class="card-title">4. Cloudflare R2 Hierarchical Archiving</div>
        <p>Documents and self-describing <code>tender.json</code> bundles are mirrored into deterministic S3/R2 keys: <code>tenders/{deptCode}/{tenderId}_{publishedDate}/{file}</code> for zero-dependency disaster recovery.</p>
      </div>
    </div>

    <div class="page-footer">
      <span>TenderHub Technical Documentation Series &bull; Confidential & Proprietary</span>
      <span>Page <strong>1</strong> of <strong>4</strong></span>
    </div>
  </div>

  <!-- ====================================================================== -->
  <!-- PAGE 2: JKTENDERADAPTER & JKTENDERDATEADAPTER DEEP DIVE               -->
  <!-- ====================================================================== -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>Core Crawling Engines: Detailed Specifications</h1>
        <div class="subtitle">JKTenderAdapter (Organisation Active) vs. JKTenderDateAdapter (Date & Recovery)</div>
      </div>
      <div class="badge-group">
        <span class="badge badge-purple">Core Crawlers</span>
        <span class="badge badge-success">Playwright v1.62+</span>
      </div>
    </div>

    <h2>1. <code>JKTenderAdapter</code> &mdash; Bulk Active Organisation Crawler</h2>
    <p>
      <strong>File:</strong> <span class="code-inline">backend/src/services/adapters/JKTenderAdapter.js</span> (~103 KB)<br>
      <strong>Role:</strong> Full-breadth catalog crawler designed to traverse all 31 government organisations listed on <code>FrontEndTendersByOrganisation</code>, discover every active tender, download all associated documents, compress oversized files, and save the data to MongoDB Atlas and Cloudflare R2.
    </p>

    <h3>Key Capabilities & Hardening</h3>
    <ul>
      <li><strong>Intermediate Multi-Tender Sub-Table Traversal:</strong> Detects when a clicked tender expands into an intermediate "Tender List : Open Tender" sub-table. Iterates every individual work package, extracts metadata, downloads documents, establishes sibling linkages, and executes <code>navigateBackFromTenderDetails(page)</code> to ensure complete package processing.</li>
      <li><strong>100% Critical Date Accuracy & Reference Clamping:</strong> Extracts Critical Dates directly from innermost table nodes. Clamps <code>publishedDate</code> to not exceed document download start or bid submission start dates, guarding against session captcha clock leak.</li>
      <li><strong>Mandatory Bidder Checklist:</strong> Extracts <code>otherImportantDocuments</code> (Standard Bidder Certificate checklist tables).</li>
      <li><strong>Ghostscript Compression:</strong> Automatically intercepts downloaded PDFs &gt;5MB and runs <code>compressPDF()</code> via Ghostscript, shrinking files by up to 75% before R2 upload.</li>
      <li><strong>Self-Describing <code>tender.json</code>:</strong> Directly executes <code>saveTenderAndUploadR2(item, hasDocuments, docReason)</code> to persist an atomic upsert in MongoDB Atlas and archive an immutable JSON manifest into Cloudflare R2.</li>
    </ul>

    <h3>Execution Commands & NPM Scripts</h3>
    <div class="cmd-box">
      <span class="comment"># 1. Full portal crawl across all 31 active organisations (Default production run)</span><br>
      <span class="prompt">$</span> npm run scrape:all<br>
      <span class="comment"># Underlying command: node src/scripts/fetchAllActiveTenders.js</span><br><br>
      <span class="comment"># 2. Quick organization scrape with custom department filtering</span><br>
      <span class="prompt">$</span> npm run scrape:tenders -- --dept="PWD" --limit=20<br>
      <span class="comment"># Underlying command: node src/scripts/fetchTenders.js</span><br><br>
      <span class="comment"># 3. Interactive debugging run with visible browser window</span><br>
      <span class="prompt">$</span> node src/scripts/fetchAllActiveTenders.js --headless=false --limit=5
    </div>

    <h2>2. <code>JKTenderDateAdapter</code> &mdash; Targeted Date & Recovery Engine</h2>
    <p>
      <strong>File:</strong> <span class="code-inline">backend/src/services/adapters/JKTenderDateAdapter.js</span> (~86 KB)<br>
      <strong>Role:</strong> The daily workhorse of TenderHub. Designed for pinpoint date-based ingestion, scheduled cron jobs, and post-opening document recovery.
    </p>

    <h3>Key Capabilities & Hardening</h3>
    <ul>
      <li><strong>Targeted Date Filtering:</strong> Accepts <code>targetDate: 'today'</code> or explicit dates like <code>'23-Sep-2026'</code>. Filters organization rows at the portal list level, skipping historical records and reducing crawl times from hours to minutes.</li>
      <li><strong>Automated Document Recovery (<code>fetchPendingDocuments</code>):</strong> Tenders published prior to their document download start date are recorded in <code>PendingDocumentTender</code>. This adapter scans that queue, visits opening tenders once their window unlocks, retrieves all PDFs/BOQs, and updates MongoDB/R2.</li>
      <li><strong>Worker Queue Integration:</strong> Powers the BullMQ background worker (<span class="code-inline">tenderSync.worker.js</span>) across 5 automated daily ingestion windows: <strong>9:00 AM, 10:00 AM, 1:00 PM, 3:00 PM, 6:30 PM IST</strong>, plus hourly document retry sweeps.</li>
      <li><strong>Deterministic Storage Keys:</strong> Passes explicit <code>deptCode</code> to guarantee canonical R2 storage paths: <code>tenders/{deptCode}/{tenderId}_{publishedDate}/{file}</code>.</li>
    </ul>

    <h3>Execution Commands & NPM Scripts</h3>
    <div class="cmd-box">
      <span class="comment"># 1. Ingest all active tenders published today (Daily production run)</span><br>
      <span class="prompt">$</span> npm run scrape:latest<br>
      <span class="comment"># Underlying command: node src/scripts/fetchLatestDailyTenders.js</span><br><br>
      <span class="comment"># 2. Ingest tenders for a specific calendar date (Backfill / Historical catchup)</span><br>
      <span class="prompt">$</span> npm run scrape:date -- --date="22-Sep-2026" --limit=100<br>
      <span class="comment"># Underlying command: node src/scripts/fetchTendersByDate.js</span><br><br>
      <span class="comment"># 3. Recover missing documents for tenders whose download windows have opened</span><br>
      <span class="prompt">$</span> npm run fetch:pending-docs<br>
      <span class="comment"># Underlying command: node src/scripts/fetchPendingDocTenders.js</span><br><br>
      <span class="comment"># 4. Start the BullMQ background sync worker (Runs all scheduled crawls)</span><br>
      <span class="prompt">$</span> npm run worker
    </div>

    <div class="page-footer">
      <span>TenderHub Technical Documentation Series &bull; Confidential & Proprietary</span>
      <span>Page <strong>2</strong> of <strong>4</strong></span>
    </div>
  </div>

  <!-- ====================================================================== -->
  <!-- PAGE 3: SPECIALIZED ADAPTERS & ARCHITECTURAL CONTRACTS                -->
  <!-- ====================================================================== -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>Specialized Adapters & Architectural Contracts</h1>
        <div class="subtitle">JKTenderMetadataAdapter, DummyTenderAdapter & TenderSourceAdapter Base Class</div>
      </div>
      <div class="badge-group">
        <span class="badge badge-amber">Utility Engines</span>
        <span class="badge badge-primary">Schema Integrity</span>
      </div>
    </div>

    <h2>1. <code>JKTenderMetadataAdapter</code> &mdash; High-Speed Metadata Engine</h2>
    <p>
      <strong>File:</strong> <span class="code-inline">backend/src/services/adapters/JKTenderMetadataAdapter.js</span> (~28 KB)<br>
      <strong>Role:</strong> High-throughput, non-intrusive metadata synchronization engine. Used when schema fields, tender status, critical dates, or authority details must be refreshed across hundreds of existing database records without incurring the overhead of downloading multi-megabyte PDFs or solving download captchas.
    </p>

    <h3>Key Capabilities & Performance Benefits</h3>
    <ul>
      <li><strong>Binary Download Bypass:</strong> Completely skips PDF/ZIP/XLS document downloading. By avoiding file transfers and download captchas, it processes tenders at <strong>10x to 15x higher velocity</strong> than full crawlers.</li>
      <li><strong>R2 Link Preservation:</strong> Strictly preserves all existing Cloudflare R2 links (<code>pdfUrls</code>, <code>nitDocuments</code>, <code>workItemDocuments</code>) stored in MongoDB, updating only textual metadata, tender value, closing dates, and authority contacts.</li>
      <li><strong>Cloudflare R2 JSON Refresh:</strong> Packages updated metadata into a fresh <code>tender.json</code> and uploads it directly to the tender's Cloudflare R2 archive, keeping Cloudflare synchronized with MongoDB Atlas.</li>
      <li><strong>Guaranteed Date Extraction:</strong> Specifically engineered to prevent session clock leaks by parsing inner date tables and rejecting top-level header timestamp fallbacks.</li>
    </ul>

    <h3>Execution Commands & NPM Scripts</h3>
    <div class="cmd-box">
      <span class="comment"># 1. Enrich existing MongoDB tenders with updated metadata & fresh tender.json in R2</span><br>
      <span class="prompt">$</span> npm run enrich:metadata<br>
      <span class="comment"># Underlying command: node src/scripts/enrichExistingTenders.js</span><br><br>
      <span class="comment"># 2. Enrich tenders with a specific batch limit</span><br>
      <span class="prompt">$</span> node src/scripts/enrichExistingTenders.js --limit=50<br><br>
      <span class="comment"># 3. Synchronize all portal metadata directly without modifying documents</span><br>
      <span class="prompt">$</span> node src/scripts/syncAllMetadata.js
    </div>

    <h2>2. <code>DummyTenderAdapter</code> &mdash; Mock Sandbox & Testing Adapter</h2>
    <p>
      <strong>File:</strong> <span class="code-inline">backend/src/services/adapters/DummyTenderAdapter.js</span> (~2.5 KB)<br>
      <strong>Role:</strong> Sandbox adapter that produces synthetic tender structures matching the exact Mongoose schema.
    </p>

    <h3>Capabilities & Use Cases</h3>
    <ul>
      <li><strong>Offline Development:</strong> Enables full frontend UI, backend API, and search filtering development without requiring internet connectivity or risking portal IP blocks.</li>
      <li><strong>Network Latency Simulation:</strong> Injects a configurable 1.5-second async delay to emulate realistic portal latency for testing frontend loading spinners, skeletons, and error boundaries.</li>
      <li><strong>CI/CD Test Suites:</strong> Used in automated unit testing pipelines where live portal scraping is prohibited.</li>
    </ul>

    <h3>Code Usage Example</h3>
    <div class="cmd-box">
      <span class="comment">// Usage in test suites or local seed scripts</span><br>
      <span class="prompt">import</span> { DummyTenderAdapter } <span class="prompt">from</span> './src/services/adapters/DummyTenderAdapter.js';<br>
      <span class="prompt">const</span> adapter = <span class="prompt">new</span> DummyTenderAdapter();<br>
      <span class="prompt">const</span> mockTenders = <span class="prompt">await</span> adapter.fetchList(1);<br>
      <span class="prompt">const</span> normalized = adapter.normalize(mockTenders[0]);
    </div>

    <h2>3. <code>TenderSourceAdapter</code> &mdash; Abstract Base Contract</h2>
    <p>
      <strong>File:</strong> <span class="code-inline">backend/src/services/adapters/TenderSourceAdapter.js</span> (~0.6 KB)<br>
      <strong>Role:</strong> The abstract interface that enforces uniform contracts across all current and future tender portals (e.g., GeM, Central CPPP, Railway e-Procurement).
    </p>

    <h3>Contract Methods</h3>
    <table>
      <thead>
        <tr>
          <th>Method Signature</th>
          <th>Contract Requirement</th>
          <th>Return Type</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>constructor(portalName)</code></td>
          <td>Initializes portal identifier; prevents direct instantiation of abstract class.</td>
          <td><code>void</code></td>
        </tr>
        <tr>
          <td><code>fetchList(page, filters)</code></td>
          <td>Navigates catalog tables and returns raw tender listings for a page.</td>
          <td><code>Promise&lt;Array&gt;</code></td>
        </tr>
        <tr>
          <td><code>fetchDetail(sourceTenderId)</code></td>
          <td>Navigates to detail page, solves captchas, extracts full metadata and documents.</td>
          <td><code>Promise&lt;Object&gt;</code></td>
        </tr>
        <tr>
          <td><code>normalize(rawTenderData)</code></td>
          <td>Transforms portal-specific DOM keys into standardized TenderHub Mongoose schema.</td>
          <td><code>Object</code> (Schema Compliant)</td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <span>TenderHub Technical Documentation Series &bull; Confidential & Proprietary</span>
      <span>Page <strong>3</strong> of <strong>4</strong></span>
    </div>
  </div>

  <!-- ====================================================================== -->
  <!-- PAGE 4: OPERATIONAL PLAYBOOK & CLI CHEAT-SHEET                        -->
  <!-- ====================================================================== -->
  <div class="page">
    <div class="header-band">
      <div class="title-group">
        <h1>Operational Playbook & CLI Cheat-Sheet</h1>
        <div class="subtitle">Production Workflows, Scenario Guides & Environment Reference</div>
      </div>
      <div class="badge-group">
        <span class="badge badge-success">Runbook Ready</span>
        <span class="badge badge-primary">Node.js v22+</span>
      </div>
    </div>

    <h2>1. Scenario-Based Command Cheat-Sheet</h2>
    <table>
      <thead>
        <tr>
          <th>Operational Scenario</th>
          <th>Recommended Command</th>
          <th>Active Adapter</th>
          <th>Expected Outcome</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Daily Automated Sync</strong></td>
          <td><code>npm run scrape:latest</code></td>
          <td><code>JKTenderDateAdapter</code></td>
          <td>Ingests all active tenders published today across all 31 orgs.</td>
        </tr>
        <tr>
          <td><strong>Complete Portal Refresh</strong></td>
          <td><code>npm run scrape:all</code></td>
          <td><code>JKTenderAdapter</code></td>
          <td>Comprehensive bulk crawl of all active tenders and multi-work packages.</td>
        </tr>
        <tr>
          <td><strong>Date Range Backfill</strong></td>
          <td><code>npm run scrape:date -- --date="DD-MMM-YYYY"</code></td>
          <td><code>JKTenderDateAdapter</code></td>
          <td>Ingests tenders for a specific past date (e.g. 20-Sep-2026).</td>
        </tr>
        <tr>
          <td><strong>Unlock Pending Documents</strong></td>
          <td><code>npm run fetch:pending-docs</code></td>
          <td><code>JKTenderDateAdapter</code></td>
          <td>Backfills PDFs/BOQs for tenders whose download window opened today.</td>
        </tr>
        <tr>
          <td><strong>Metadata Schema Refresh</strong></td>
          <td><code>npm run enrich:metadata</code></td>
          <td><code>JKTenderMetadataAdapter</code></td>
          <td>Refreshes critical dates & metadata; updates <code>tender.json</code> in R2.</td>
        </tr>
        <tr>
          <td><strong>Continuous Daemon Worker</strong></td>
          <td><code>npm run worker</code></td>
          <td><code>JKTenderDateAdapter</code></td>
          <td>Background BullMQ runner executing 5 daily crawl slots + retry crons.</td>
        </tr>
        <tr>
          <td><strong>Inspect Sibling Tenders</strong></td>
          <td><code>node src/scripts/listMultiTenders.js</code></td>
          <td>MongoDB Aggregation</td>
          <td>Lists all multi-tender groups sharing base NIT IDs in the database.</td>
        </tr>
        <tr>
          <td><strong>Adapter Parity Regression</strong></td>
          <td><code>node tests/adapter_parity.test.js</code></td>
          <td>Integrity Test</td>
          <td>Verifies method parity, R2 key generation, and schema normalization.</td>
        </tr>
      </tbody>
    </table>

    <h2>2. Disaster Recovery & Manual Generation Commands</h2>
    <div class="cmd-box">
      <span class="comment"># Generate all executive documentation manuals (Deployment, Disaster Recovery, Crawl & Adapters)</span><br>
      <span class="prompt">$</span> npm run manuals:all<br><br>
      <span class="comment"># Individual PDF manual generators</span><br>
      <span class="prompt">$</span> npm run manual:adapters <span class="comment"># Generates this Architecture & Operations Guide PDF</span><br>
      <span class="prompt">$</span> npm run manual:disaster <span class="comment"># Generates Disaster Recovery & Failover Manual PDF</span><br>
      <span class="prompt">$</span> npm run manual:deployment <span class="comment"># Generates Production Deployment Playbook PDF</span><br>
      <span class="prompt">$</span> npm run report:pdf <span class="comment"># Generates Executive Crawl Report PDF</span>
    </div>

    <h2>3. Mandatory Environment Variables Configuration</h2>
    <table>
      <thead>
        <tr>
          <th>Variable Key</th>
          <th>Required By</th>
          <th>Description & Example</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>MONGO_URI</code></td>
          <td>All Adapters</td>
          <td>Primary MongoDB Atlas connection string (Cluster0).</td>
        </tr>
        <tr>
          <td><code>REDIS_URL</code></td>
          <td>Worker & Queue</td>
          <td>Upstash / local Redis URL for BullMQ job queue management.</td>
        </tr>
        <tr>
          <td><code>R2_ACCESS_KEY_ID</code> / <code>R2_SECRET_ACCESS_KEY</code></td>
          <td>All Adapters</td>
          <td>Cloudflare R2 API credentials for document and JSON uploads.</td>
        </tr>
        <tr>
          <td><code>R2_BUCKET_NAME</code></td>
          <td>All Adapters</td>
          <td>Target R2 bucket name (e.g. <code>tenderhub-production</code>).</td>
        </tr>
        <tr>
          <td><code>GEMINI_API_KEY</code> / <code>GEMINI_MODEL</code></td>
          <td>Captcha Service</td>
          <td>Google Gemini Flash Vision API key (primary captcha solver).</td>
        </tr>
        <tr>
          <td><code>HF_TOKEN</code> / <code>HF_MODEL</code></td>
          <td>Captcha Service</td>
          <td>Hugging Face Router Vision token (secondary captcha solver fallback).</td>
        </tr>
        <tr>
          <td><code>SCRAPER_HEADLESS</code></td>
          <td>All Adapters</td>
          <td>Set to <code>false</code> for visual browser debugging; defaults to <code>true</code>.</td>
        </tr>
      </tbody>
    </table>

    <div class="alert alert-success" style="margin-top: 8px;">
      <strong>System Health Verification:</strong> All adapters run under Node.js v22+ and require Playwright Chromium binaries. Ghostscript (<code>gswin64c.exe</code> or <code>gs</code>) must be installed on the system path for PDF compression (>5MB).
    </div>

    <div class="page-footer">
      <span>TenderHub Technical Documentation Series &bull; Confidential & Proprietary</span>
      <span>Page <strong>4</strong> of <strong>4</strong></span>
    </div>
  </div>

</body>
</html>
  `;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
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

  const primaryPdfPath = path.join(rootDocsDir, 'TenderHub_Adapters_Architecture_Guide.pdf');
  const backupPdfPath = path.join(backendBackupsDir, 'TenderHub_Adapters_Architecture_Guide.pdf');

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

  fs.copyFileSync(primaryPdfPath, backupPdfPath);
  await browser.close();

  const stats = fs.statSync(primaryPdfPath);
  console.log('🎉 SUCCESS: TenderHub Ingestion Adapters Architecture Guide PDF generated!');
  console.log(`📄 Primary Destination: ${primaryPdfPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`📁 Secondary Copy:        ${backupPdfPath}`);
}

generateAdaptersGuidePdf().catch(err => {
  console.error('❌ Failed to generate Adapters Guide PDF:', err);
  process.exit(1);
});
