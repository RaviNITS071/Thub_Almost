# TenderHub — System Architecture

## 1. High-Level Architecture Diagram

```mermaid
graph TD
    subgraph Clients ["Client Applications"]
        F[Frontend Client App<br/>Vite / React - Port 5173]
        A[Admin Dashboard<br/>Vite / React - Port 5174]
    end

    subgraph BackendCore ["Backend Services (Port 8000)"]
        API[Express.js 5.x REST API]
        Auth[Auth Service<br/>JWT & Google OAuth 2.0]
        Diag[Diagnostic & Telemetry Engine]
        Worker[BullMQ Background Worker]
    end

    subgraph ScraperPipeline ["Playwright Scraper Pipeline"]
        P[Playwright Chromium Browser]
        CP[Captcha Preprocessor<br/>Sharp Color Filter + Binarizer]
        OCR[Tesseract.js Local OCR]
        GS[Ghostscript PDF Compressor]
    end

    subgraph ExternalSources ["External Targets & Providers"]
        JK[JKTenders Portal<br/>jktenders.gov.in]
        Brevo[Brevo Email Service]
        HF[Hugging Face Router Vision<br/>GLM-4.5V / Qwen2.5-VL]
        Gemini[Google Gemini 3.6 Flash Vision]
        TG[Telegram Bot API<br/>Real-Time Crawl Telemetry]
    end

    subgraph DataStorage ["Data & Storage Layer"]
        Mongo[(MongoDB Atlas Primary)]
        Redis[(Upstash / Redis Cache & Queues)]
        R2Primary[(Cloudflare R2 Primary Bucket<br/>tenderhub)]
        R2Backup[(Cloudflare R2 Backup Bucket<br/>tenderhub-backup)]
    end

    F -->|REST / Cookies| API
    A -->|Admin Key / REST| API
    API --> Mongo
    API --> Redis
    API --> Auth
    API --> Diag

    Worker --> Redis
    Worker --> P
    P -->|Crawl & Navigate| JK
    P --> CP --> OCR
    OCR -.->|Primary AI Vision (Hugging Face)| HF
    OCR -.->|Secondary AI Fallback (Free)| Gemini

    P -->|Download PDF| GS -->|Compressed PDF| R2Primary
    P -->|Stream ZIP| R2Primary
    P -->|Upsert Metadata| Mongo
    P -->|Push Updates| TG

    R2Primary -.->|syncR2Mirror.js| R2Backup
```

---

## 2. Component Breakdown

### 2.1 Backend Core (`backend/`)
- **Runtime**: Node.js (ES Modules, `type: "module"`).
- **Framework**: Express.js 5.2.1.
- **Logging**: Pino structured logger with high-performance JSON output.
- **Database Layer**: Mongoose 9.x with strict schemas, unique compound indexes, and auto-reconnect logic.
- **Queue System**: BullMQ 6.x connected to Upstash Redis for asynchronous job scheduling, scraper dispatching, and PDF retries.

### 2.2 Scraper & Ingestion Pipeline (`backend/src/services/adapters/JKTenderAdapter.js`)
- **Browser Automation**: Playwright 1.62+ running Chromium with custom User-Agent and anti-detection settings.
- **Dynamic Timing & Delays**: Humanized micro-delays (`humanDelay(page, min, max)`) to prevent IP throttling.
- **Stabilization & Submit Delays**:
  - `1,800ms` render pause before capturing captcha images.
  - `2,000ms` settling pause after text entry before clicking submit.
- **Retry Mechanism**: Up to 10 automated retry attempts (`maxAttempts = 10`) with automatic captcha image refresh on rejection.
- **Two Execution Modes**:
  - **Command 1: Full Initial Crawl (`fetchAllActiveTenders.js` / `npm run scrape:all`)**: Exhaustively traverses all departments via `FrontEndTendersByOrganisation` with persistent disk checkpointing (`.crawl_checkpoint.json`). Remembers exact organisation, page number, and last tender ID upon interruption and resumes from that point (or restarts with `--reset`).
  - **Command 2: Incremental Daily Crawl (`fetchLatestDailyTenders.js` / `npm run scrape:latest`)**: Navigates through `FrontEndTendersByOrganisation`, compares published date/time with the last scraping time, skips existing tenders, and stops with "tenders are latest" upon finding 5 consecutive already-scraped tenders in an organisation.

### 2.3 Captcha Resolution Subsystem (`backend/src/services/captcha.service.js`)
- **Hugging Face Router Vision**:
  - Endpoint: `https://router.huggingface.co/v1/chat/completions` (OpenAI-compatible serverless router).
  - Models: `zai-org/GLM-4.5V` (default) or `Qwen/Qwen2.5-VL-72B-Instruct`.
  - Auth: `HF_TOKEN` from environment.
  - Retry Policy: Up to 5 consecutive attempts (`hfAttempt <= 5`) before falling back to next method.
  - Parsing: Alphanumeric filtering preserving exact case with reasoning-token handling.
- **Local Preprocessed Tesseract OCR**:
  - Uses `sharp` to strip blue noise dots (`b > 100 && (b > r + 20 || b > g + 20)`).
  - Binarizes black text pixels against `#FFFFFF`.
  - Upscales 2.5x with Lanczos3 kernel and adds 15px white padding.
  - Passes cleaned buffer to `tesseract.js` with whitelist `[0-9a-zA-Z]`.
  - **Latency**: ~280ms (runs locally on CPU).
  - **Case Preservation**: 100% exact case recognition (`"Dhuz29"` passes on first attempt).
  - **Cost**: $0 (Zero API dependencies).
- **Secondary AI Fallback**: Google Gemini 3.6 Flash Vision (Free Tier via Google AI Studio):
  - Model: `gemini-3.6-flash`
  - Runs on preprocessed, noise-stripped image buffer if other solvers fail.
  - Zero cost with generous free-tier rate limits.

### 2.4 Storage & Cloud Architecture (`backend/src/utils/r2Storage.js`)
- **Primary Object Storage**: Cloudflare R2 (S3-compatible API, zero egress fees).
- **Canonical Key Format**:
  ```text
  {deptCode}/{tenderId}_{publishedDate}/{fileName}
  Example: APD/2026_APD_325192_1_2026-09-18/NIT_Document.pdf
  ```
- **Disaster Recovery Mirror**:
  - Secondary Cloudflare account (`BACKUP_R2_ACCOUNT_ID`).
  - Script `syncR2Mirror.js` scans the backup bucket and mirrors only new/missing objects.

---

## 3. Database Schema & Indexing (`backend/src/models/`)

### 3.1 `Tender.js`
- **Unique Constraint**: `{ sourcePortal: 1, sourceTenderId: 1 }` (Guarantees zero duplicate tenders).
- **Faceted Query Indexes**:
  - `{ departmentCode: 1, closingDate: 1 }`
  - `{ organisationChain: 1, closingDate: 1 }`
  - `{ status: 1, closingDate: 1 }`
  - `{ pdfFetchStatus: 1, closingDate: 1 }`
  - `{ publishedDate: -1, createdAt: -1 }`

### 3.2 `User.js`
- **Authentication**: Email/password (bcrypt) + Google OAuth 2.0 (`googleId`).
- **Role-Based Access Control**: `contractor` (default), `user`, `admin`, `owner`.

### 3.3 `SystemLog.js` & `SyncJob.js`
- **Diagnostic Logs & Crawler Telemetry**: Real-time events logged during crawler execution (`source: 'WORKER_SCRAPER'`).
- **Telemetry Endpoints**:
  - `GET /api/v1/admin/sync/live-status`: Streams active job metrics, checkpoint state, and live terminal logs to the Admin Dashboard console.
  - `POST /api/v1/admin/sync/trigger`: Triggers Full Crawl (Command 1) or Daily Latest Crawl (Command 2) with limit and reset options.
  - `POST /api/v1/admin/sync/stop`: Stops the active crawler process gracefully via SIGINT, preserving the checkpoint.
  - `POST /api/v1/admin/sync/checkpoint/reset`: Clears the persistent checkpoint to restart from Organisation #1.
