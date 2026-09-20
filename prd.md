# TenderHub — Product Requirements Document (PRD)

## 1. Executive Summary & Mission
**TenderHub** is an enterprise-grade government tender aggregation, intelligence, and document distribution platform tailored specifically for Jammu & Kashmir e-procurement (`jktenders.gov.in`). The system automates the ingestion of tenders, solves complex portal captchas with zero external API dependencies, downloads and secures tender notices (NIT PDFs) and bill-of-quantities (BOQ ZIPs) in Cloudflare R2 object storage, and provides contractors and businesses with a modern, fast, searchable interface.

---

## 2. Target User Personas
1. **Contractors & Bidders**:
   - Need real-time visibility into active tenders across J&K government departments (APD, PDD, PWD, JSD, etc.).
   - Require fast one-click downloads of verified NIT documents and BOQ spreadsheets without navigating sluggish government portals or solving captchas manually.
2. **Operations & Content Admins**:
   - Manage scheduled and on-demand scraping jobs.
   - Monitor system health, worker queues, database latency, and storage integrity via a dedicated operations dashboard.
3. **Enterprise / System Owners**:
   - Demand zero data loss, automated disaster recovery, and dual-account cloud backups.

---

## 3. Core Functional Requirements

### 3.1 Portal Ingestion & Web Scraping
- **Sources**: Automated crawling of `jktenders.gov.in` via two primary entry points:
  - *Tenders by Organisation* (`FrontEndTendersByOrganisation`) for exhaustive departmental aggregation.
  - *Latest Active Tenders* (`FrontEndLatestActiveTenders`) for real-time notice updates.
- **Two Operational Modes**:
  - **Command 1: Full Initial Crawl (`npm run scrape:all [limit]`)**:
    - Script: `backend/src/scripts/fetchAllActiveTenders.js`
    - Scope: Traverses all organisations and departments on *Tenders by Organisation* to backfill all active tenders before Monday 6:00 AM.
    - Idempotency & Resumption: Persists progress to `.crawl_checkpoint.json` (organisation index, page number, last tender ID). Automatically skips tenders where `pdfFetchStatus === 'COMPLETED'`, resuming directly from the exact interruption point.
  - **Command 2: Incremental Daily Crawl (`npm run scrape:latest [limit]`)**:
    - Script: `backend/src/scripts/fetchLatestDailyTenders.js`
    - Scope: Traverses organisations on *Tenders by Organisation* to fetch newly published active tenders (500–600 tenders/day).
    - Cutoff & Catch-up: Compares published date/time with previous scraping time, skips already-ingested tenders, and halts for each department with "tenders are latest" upon finding 5 consecutive already-scraped tenders.
- **Headless & Headed Execution**: Controlled via `SCRAPER_HEADLESS` (`false` for debugging/visual tracking, `true` for automated server execution).
- **Session Continuity**: Reuses HTTP session cookies across requests to reduce repeated captcha challenges.

### 3.2 Automated Captcha Resolution
- **Accuracy Requirement**: 100% case-sensitive recognition (JKTenders strictly requires exact uppercase and lowercase alphanumeric letters).
- **Primary AI Engine (Hugging Face Router Vision)**:
  - Endpoint: `https://router.huggingface.co/v1/chat/completions` (Serverless OpenAI-compatible).
  - Models: `zai-org/GLM-4.5V` (default) or `Qwen/Qwen2.5-VL-72B-Instruct` via `HF_TOKEN`.
  - Zero ongoing commercial captcha costs using serverless Hugging Face infrastructure.
  - Alphanumeric regex filtering preserving exact uppercase/lowercase characters.
- **Local Engine (Preprocessed Tesseract OCR)**:
  - Uses `sharp` to eliminate colored noise dots (`blue > 100` and `b > r + 20`) and binarize black text against pure white.
  - 2.5x Lanczos upscaling with 15px white border padding.
  - Feeds into `tesseract.js` with character whitelist `[0-9a-zA-Z]`.
  - Zero ongoing cost, runs completely offline on local CPU in ~280ms with 100% case accuracy.
- **Secondary AI Fallback (Google Gemini 3.6 Flash Vision)**:
  - Model: `gemini-3.6-flash` via Google AI Studio API key (`GEMINI_API_KEY`).
  - Zero ongoing cost under Google's generous free tier.
  - Runs on preprocessed image buffer if earlier solvers extract < 5 characters.
- **Robustness**: 10-attempt automated retry loop (`maxAttempts = 10`) with automatic captcha refresh on portal rejection.
- **Human Timing**: 1,800ms stabilization wait before capture; 2,000ms pause after text entry before form submission.

### 3.3 Document Acquisition & Storage
- **NIT Notice Documents (.pdf)**: Downloaded directly via Playwright, compressed via Ghostscript (ebook quality), and uploaded to Cloudflare R2.
- **BOQ Spreadsheets & Archives (.zip)**: Streamed directly to Cloudflare R2 without local disk extraction.
- **Deterministic Storage Hierarchy**:
  ```text
  {departmentCode}/{sourceTenderId}_{publishedDate}/{fileName}
  Example: APD/2026_APD_325192_1_2026-09-18/NIT_Document.pdf
  ```
- **Deduplication**: Re-running ingestion never duplicates files; existing R2 keys are cleanly updated.

### 3.4 Database & Deduplication
- **MongoDB Unique Index**: Enforced compound index on `{ sourcePortal: 1, sourceTenderId: 1 }`.
- **Atomic Upsert**: `findOneAndUpdate(..., { $set: normalized }, { upsert: true })`.
- **Array Merging**: NIT documents, work documents, and PDF URLs are deduplicated during updates.

### 3.5 Disaster Recovery & Backup
- **Primary Database**: MongoDB Atlas Primary Cluster.
- **Secondary Failover**: Automated connection failover to secondary cluster if configured.
- **Secondary Cloudflare R2 Mirror**: `syncR2Buckets()` replicates all primary R2 objects to an isolated backup Cloudflare account, skipping already-synchronized keys.
- **Automated Disaster Recovery Manuals**: PDF generators (`generateDisasterRecoveryPdf.js`, `generateDeploymentPdf.js`) compile documentation for cold-start server rebuilds.

### 3.6 User Experience & Search
- **Client Portal**: Fast search by tender ID, title, department, closing date, and estimated tender value.
- **Admin Dashboard**: Dedicated portal on port 5174 featuring:
  - System telemetry and intelligent diagnostic remediations.
  - Multi-section ingestion management: Full Active Crawl (Command 1), Daily Latest Crawl (Command 2), Missing Documents Recovery, and Automated Cron Cycles.
  - Live Ingestion Telemetry & Terminal Console located directly beneath fetch controls, streaming real-time logs, KPI counters (+saved, skipped, PDFs, BOQs), active target department, and stop controls.

### 3.7 Real-Time Mobile & Telegram Notification Subsystem
- **Purpose**: Mobile alerts delivered directly to system administrators and operators during background crawling on cloud infrastructure (e.g. AWS Mumbai EC2).
- **Triggers & Lifecycle**:
  - **Crawl Started**: Portal target, limit, resume checkpoint info.
  - **Milestone Progress**: Periodic throttled updates upon completing organisations with count of saved tenders, skipped tenders, PDFs downloaded, and elapsed duration.
  - **Crawl Completed**: Full summary breakdown and confirmation of storage into Cloudflare R2 and MongoDB.
  - **Crawl Interrupted / Error**: Immediate alert with error details and confirmation of saved disk checkpoint (`.crawl_checkpoint.json`).
- **Zero Cost**: Built using Telegram Bot API (`@BotFather`) and native Node.js `fetch` ($0 API cost, zero external npm dependencies).

---

## 4. Non-Functional Requirements
- **Reliability**: 99.9% uptime for document downloads.
- **Performance**: Sub-second search responses; tender document streaming < 2s.
- **Security**: JWT access & refresh tokens in HTTP-only cookies, Google OAuth 2.0 OpenID Connect, Brevo transactional emails for OTP verification, rate limiting via Redis.
- **Zero Data Loss**: Dual R2 bucket replication and automated MongoDB dump scripts.
