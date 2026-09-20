# TenderHub — Tasks & Project Progress

## 1. Completed Milestones ✅

### 1.1 Ingestion Engine & Crawler
- [x] Implemented `JKTenderAdapter.js` using Playwright with support for both headless and headed execution.
- [x] Built departmental crawler (`FrontEndTendersByOrganisation`) and latest notices crawler (`FrontEndLatestActiveTenders`).
- [x] Added humanized interaction delays (`humanDelay`) to avoid IP rate-limiting.
- [x] Streamed `.zip` archives (BOQ and work item packages) directly to Cloudflare R2 without local disk extraction.
- [x] Integrated Ghostscript PDF compression (`compressPDF`) with 2-minute safety timeouts.
- [x] **Command 1 (Full Initial Crawl)**: Built `fetchAllActiveTenders.js` (`npm run scrape:all`) with persistent disk checkpointing (`.crawl_checkpoint.json`). Remembers exact organisation, page number, and last tender ID upon interruption; resumes seamlessly from where it stopped (or restarts with `--reset`).
- [x] **Command 2 (Incremental Daily Crawl)**: Built `fetchLatestDailyTenders.js` (`npm run scrape:latest`) using *Tenders by Organisation*, checking published date/time against previous scrape time, skipping existing tenders, and concluding with "tenders are latest" upon encountering 5 consecutive already-scraped tenders in an organisation.

### 1.2 Captcha Solving Breakthrough
- [x] Diagnosed that JKTenders captchas are strictly **case-sensitive** (e.g. `b5D8DE` is rejected if submitted as `b5d8de`).
- [x] Discovered that the portal's noise consists of **blue dots** (`b > 100 && b > r + 20`), while text letters are solid black.
- [x] Built image preprocessing pipeline using `sharp` that strips colored noise dots and binarizes black text against pure white.
- [x] Added 2.5x Lanczos upscaling and 15px white border padding for optimal OCR.
- [x] Configured local `tesseract.js` to accurately read uppercase and lowercase characters locally for **$0 cost**.
- [x] Implemented a **10-attempt automated retry loop** (`maxAttempts = 10`) with automatic captcha image refresh on rejection.
- [x] Added a **1,800ms** render stabilization wait before screenshot and a **2,000ms** settling wait after entry before submitting.
- [x] Integrated **Hugging Face Router Vision** (`solveWithHuggingFace`) using serverless `zai-org/GLM-4.5V` / `Qwen/Qwen2.5-VL-72B-Instruct` with reasoning token handling.
- [x] Streamlined captcha architecture to a multi-tiered zero-cost pipeline:
  - **Attempt 1**: Hugging Face Router Vision (`zai-org/GLM-4.5V`) with 5-attempt retry loop.
  - **Attempt 2**: Local Preprocessed Tesseract OCR (`sharp` + `tesseract.js`) — ~280ms, 100% case precision, $0 cost.
  - **Attempt 3**: Google Gemini 3.6 Flash Vision (`gemini-3.6-flash`) — Free-tier fallback on noise-stripped image.
  - **Retired**: OpenAI Vision, CapSolver, and TrueCaptcha (removed completely).
- [x] Successfully verified live crawl: **15 tenders processed, 17 PDFs secured, 0 duplicate records**.

### 1.3 Deduplication & Storage Architecture
- [x] Enforced MongoDB unique compound index on `{ sourcePortal: 1, sourceTenderId: 1 }`.
- [x] Implemented atomic upsert via `Tender.findOneAndUpdate()` with array merging for `nitDocuments`, `workItemDocuments`, and `pdfUrls`.
- [x] Standardized canonical Cloudflare R2 keys: `{deptCode}/{tenderId}_{publishedDate}/{fileName}`.
- [x] Built dual-account disaster recovery mirror script (`syncR2Mirror.js`) that indexes existing backup keys and skips duplicates.

### 1.4 Auth & Administration
- [x] Implemented JWT access and refresh tokens with HTTP-only cookies.
- [x] Added Google OAuth 2.0 OpenID Connect authentication.
- [x] Built Admin Dashboard on port 5174 with system telemetry and root-cause diagnostic suggestions.
### 1.5 Real-Time Notifications & Cloud Operations
- [x] **Telegram Notification Subsystem**: Created zero-dependency `telegram.service.js` using native Node.js `fetch` and HTML message formatting.
- [x] Wired automated Telegram alerts into `fetchAllActiveTenders.js` and `fetchLatestDailyTenders.js`:
  - 🚀 **Crawl Started**: Sends portal, target limit, and resume status.
  - 📊 **Milestone Progress**: Throttled updates on department completion with live counters (Saved, Skipped, PDFs, BOQs, elapsed time).
  - 🎉 **Crawl Completed**: Full summary breakdown of saved tenders, skipped tenders, PDFs/BOQs uploaded to R2, and total duration.
  - 🚨 **Crawl Alert**: Immediate notification on process interruption or uncaught error with checkpoint confirmation.
- [x] **AWS Mumbai (`ap-south-1`) Cloud Deployment Blueprint**: Configured student-budget architecture (Free Tier EC2 `t3.small`/`t2.micro`, 30 GB gp3 SSD, PM2 process management, and crontab automation).

---

## 2. In-Progress Tasks 🔄
- [ ] **Production Cron Scheduling**: Automated cron jobs (`09:00`, `13:00`, `18:30` IST) for daily notice pulls on AWS Mumbai.

---

## 3. Upcoming Roadmap 🚀
- [ ] **AI Tender Summarization**: Use `gpt-4o-mini` to extract key eligibility criteria, EMD rules, and penalty clauses from NIT PDFs.
- [ ] **Contractor Alert Engine**: Send instant WhatsApp and Telegram notifications to contractors matching their trade categories and districts.
- [ ] **Bid Price Analytics**: Extract historical BOQ winning bids to show price trends across departments.
- [ ] **Multi-Portal Support**: Expand adapter architecture to CPPP (Central Public Procurement Portal) and GeM (Government e-Marketplace).
