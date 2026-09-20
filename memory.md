# TenderHub — Project Memory & Technical Context

## 1. Project Overview
- **Project Name**: TenderHub (J&K Government Tenders Intelligence Engine)
- **Primary Source**: `https://jktenders.gov.in` (NIC eProcurement Portal)
- **Tech Stack**:
  - **Backend**: Node.js, Express.js 5.2.1, Mongoose 9.x, BullMQ, Pino, Sharp, Tesseract.js, Playwright.
  - **Frontend**: Vite, React, Tailwind CSS (Port 5173).
  - **Admin Dashboard**: Vite, React, Tailwind CSS (Port 5174).
  - **Data & Storage**: MongoDB Atlas, Upstash Redis, Primary Cloudflare R2 (`tenderhub`), Secondary Backup R2 (`tenderhub-backup`).

---

## 2. Key Technical Decisions & Rationale

| Decision | Context & Problem | Rationale & Outcome |
| :--- | :--- | :--- |
| **Hugging Face Router Vision Integration** | User requested integrating their Python/Streamlit vision script to run serverless models without 3rd-party commercial captcha fees. | Integrated `https://router.huggingface.co/v1/chat/completions` using user's `HF_TOKEN` and `zai-org/GLM-4.5V` (or `Qwen/Qwen2.5-VL-72B-Instruct`). Configured 300 token budget for reasoning models, 5-attempt retry loop before falling back to local OCR, and alphanumeric case-preserving regex extraction. |
| **Local Preprocessed OCR** | CapSolver lowercases characters causing portal rejection, and cloud LLMs take 5-7s. | Built a local `sharp` filter that removes blue noise dots (`b > 100 && b > r + 20`) and binarizes black text. Combined with `tesseract.js`, this achieves exact case recognition locally in **~280ms for $0 cost** with zero external API dependencies. |
| **Google Gemini 3.6 Flash Fallback** | Retired OpenAI (paid credits barrier), CapSolver (lowercase bug), and TrueCaptcha (slow/unreliable). | Integrated `gemini-3.6-flash` REST API as secondary fallback. Runs on preprocessed image buffer if earlier solvers extract < 5 characters. Free tier, zero ongoing cost. |
| **10-Attempt Auto-Retry Loop** | JKTenders captchas occasionally exhibit heavy letter deformation that can fail on a single attempt. | Implemented `maxAttempts = 10`. When rejected, the scraper automatically clicks `#captcha` to refresh the image and tries again without stopping or prompting the user. |
| **1.8s + 2.0s Captcha Delays** | Portal client-side JavaScript (`validateCaptcha()`) failed when text was submitted too quickly or before image rendered. | Added an 1,800ms render stabilization delay before screenshot and a 2,000ms delay after filling text before clicking `#Submit`. |
| **Direct ZIP Streaming to R2** | BOQ spreadsheets and work item packages are provided as `.zip` archives. Extracting locally wastes disk space and risks corrupted files. | Stream `.zip` buffers directly into Cloudflare R2 and store the canonical R2 URL in `boqZipUrl`. |
| **Unique Compound Index `{ sourcePortal, sourceTenderId }`** | Re-running ingestion jobs previously risked creating duplicate records. | Enforced a strict unique compound index in MongoDB. All ingestion uses atomic `findOneAndUpdate(..., { $set: normalized }, { upsert: true })` with array deduplication. |
| **Two-Phase Crawl Architecture (Initial vs Incremental)** | Need to backfill all active tenders across all departments before Monday 6 AM, then switch to frequent daily pulls without duplicate work. | Both pipelines strictly navigate through *Tenders by Organisation*: `fetchAllActiveTenders.js` (`npm run scrape:all`) traverses all departments to backfill all active tenders, skipping completed tenders for resume safety. `fetchLatestDailyTenders.js` (`npm run scrape:latest`) traverses departments, compares published date/time with the last scraping time, skips existing tenders, and concludes with "tenders are latest" whenever 5 consecutive already-scraped tenders are found in an organisation. |
| **Admin Live Ingestion Console & Multi-Section Controls** | Admin needed distinct controls for full backfill vs daily latest pulls, plus live visibility into crawling progress without checking terminal logs. | Built 4 dedicated sections in `IngestionView.jsx` (Full Crawl, Daily Latest, Missing Docs, Cron Automation) and a real-time terminal console positioned below the controls that streams live logs, KPI metrics (+saved, skipped, PDFs, BOQs), active department target, auto-scroll, and stop control via `/sync/live-status`. |
| **Dual-Account R2 Replication** | Need offsite disaster recovery in case the primary Cloudflare account is suspended or compromised. | Script `syncR2Mirror.js` replicates documents to an isolated second Cloudflare account (`tenderhub-backup`), skipping existing keys to minimize bandwidth. |
| **Telegram Bot Push Telemetry** | Scrapers run asynchronously in the background on AWS Mumbai EC2; user needs real-time mobile updates on crawl health, milestones, and errors without logging into the server. | Built `telegram.service.js` using native Node.js `fetch` to Telegram Bot API with HTML formatting. Automatically pings on start, throttled department milestones (every 90s), completion summary, and errors. Zero external dependencies, $0 cost. |
| **AWS Mumbai (`ap-south-1`) Cloud Server** | JKTenders portal geoblocks overseas cloud IPs (Render/Railway in US/EU get 403 Forbidden). Local PC crawling requires keeping computer powered on 24/7. | Deployed on AWS Mumbai EC2 (Ubuntu 24.04, 30 GB gp3 SSD under Free Tier). EC2 is located within India with 15–25ms latency to NIC portal, 1 Gbps pipe, and runs 24/7 in background via PM2. |

---

## 3. Critical Gotchas & Lessons Learned

### 3.1 ES Module Import Hoisting with `dotenv`
- **Issue**: In ES modules (`"type": "module"`), `import` statements are hoisted and executed **before** top-level statements like `dotenv.config()`. Assigning `process.env.VAR` in class constructors resulted in empty strings `""`.
- **Solution**: Always use dynamic getters in service classes:
  ```javascript
  get myVar() { return process.env.MY_VAR || ''; }
  ```

### 3.2 JKTenders Portal Behavior
- **Case Sensitivity**: JKTenders captchas are 100% case-sensitive. Lowercase submission of uppercase letters will fail.
- **Color Differentiation**: Background noise dots are blue (`RGB: ~0, 0, 255`), while text letters are solid black (`RGB: ~0, 0, 0`).
- **Session Persistence**: JKTenders uses `JSESSIONID`. Once a captcha is solved, subsequent document downloads within the same session often do not require another captcha.

### 3.3 Cloud Vision LLMs vs. Local Color-Filtered OCR (Empirical Benchmark)
- **Cloud LLMs (Gemini 3.6 Flash / OpenAI Vision)**:
  - Latency: 5,500ms – 7,600ms per request.
  - Failure Mode: Often hallucinates or truncates tiny (120x35px) distorted alphanumeric strings (e.g. returning 1 or 2 letters like `"D"` or `""`).
- **Local Preprocessed OCR (`sharp` + `tesseract.js`)**:
  - Latency: **284ms** (20x faster).
  - Accuracy: Solves 6/6 characters with 100% exact case (e.g. `"Dhuz29"` passed JKTenders portal validation on the very first attempt).
  - Cost & Dependency: **$0.00**, zero network dependencies, runs offline on local CPU.
  - **Strategy**: Keep Local Preprocessed OCR as Attempt 1 (~280ms, 100% case accuracy), with Gemini 3.6 Flash as sole secondary fallback.

### 3.4 Telegram API Formatting
- **HTML vs MarkdownV2**: Telegram's `MarkdownV2` requires escaping 18 special characters (`_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`), which frequently causes silent send drops when logging dynamic error messages or URLs. Always use `parse_mode: 'HTML'` with standard `<b>`, `<code>`, `<i>` tags.

---

## 4. Key File Locations & Scripts Dictionary

| Path | Purpose |
| :--- | :--- |
| `backend/src/services/adapters/JKTenderAdapter.js` | Main Playwright crawler, page navigation, 10-attempt captcha solver, and document downloader. |
| `backend/src/services/captcha.service.js` | Preprocessing engine (`sharp`), Hugging Face Router Vision, Local Tesseract OCR, and Gemini Flash fallback. |
| `backend/src/services/telegram.service.js` | Telegram Bot notification service using native `fetch` (start, milestone, completion, error). |
| `backend/src/utils/r2Storage.js` | Cloudflare R2 S3 client, canonical key generator, and upload utilities. |
| `backend/src/models/Tender.js` | Mongoose tender schema with unique compound index and faceted search indexes. |
| `backend/src/scripts/fetchTenders.js` | CLI scraper execution script (`npm run scrape:tenders <limit>`). |
| `backend/src/scripts/fetchAllActiveTenders.js` | Command 1: Full departmental crawl of all active tenders with persistent checkpoint/resume and Telegram alerts (`npm run scrape:all [limit]`). |
| `backend/src/scripts/fetchLatestDailyTenders.js` | Command 2: Incremental daily crawl of newly published notices with Telegram alerts (`npm run scrape:latest [limit]`). |
| `backend/.crawl_checkpoint.json` | Persistent crawler checkpoint recording organisation index, page number, last tender ID, and status. |
| `backend/src/scripts/syncR2Mirror.js` | Cross-account R2 mirror replication script (`npm run sync:mirror`). |
| `backend/test_hf_vision.js` | Test script to verify Hugging Face Router Vision on live JKTenders portal captcha. |
| `backend/test_gemini_vision.js` | Test script to verify Gemini 3.6 Flash Vision OCR and live portal submission. |
| `admin-panel/src/components/DiagnosticView.jsx` | Operations dashboard displaying system telemetry, latency, and problem remediations. |
| `backend/.env` | Environment configuration (never commit to version control). |
| `backend/.env.example` | Canonical environment variable template. |
