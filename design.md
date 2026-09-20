# TenderHub — UI/UX Design System & Direction

## 1. Design Philosophy
TenderHub reimagines clunky, dated government e-procurement portals into a sleek, blazing-fast, enterprise-grade intelligence platform. The user experience balances **high data density** with **visual clarity**, enabling contractors and business owners to scan, filter, and act on multimillion-rupee tenders in seconds.

---

## 2. Color Palette & Theme Tokens

### 2.1 Backgrounds & Surfaces
- **Light Mode**:
  - App Background: `bg-slate-50` (`#F8FAFC`)
  - Card & Container Surface: `bg-white` (`#FFFFFF`)
  - Border: `border-slate-200` (`#E2E8F0`)
- **Dark Mode**:
  - App Background: `bg-slate-950` (`#020617`)
  - Card & Container Surface: `bg-slate-900` (`#0F172A`)
  - Elevated Cards: `bg-slate-800` (`#1E293B`)
  - Border: `border-slate-800` (`#1E293B`) / `border-slate-700` (`#334155`)

### 2.2 Primary Brand & Accent
- **Primary Indigo / Blue**:
  - Light Accent: `bg-blue-600` (`#2563EB`) / `text-blue-600`
  - Dark Accent: `bg-blue-500` (`#3B82F6`) / `text-blue-400`
  - Glow & Ring: `ring-blue-500/30`

### 2.3 Semantic Status Colors
- **Active / Success (Emerald)**:
  - `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20`
  - Used for: Active tenders, completed document downloads, healthy services.
- **Warning / Pending (Amber)**:
  - `bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20`
  - Used for: Pending PDF fetches, queue backlogs, captcha retries.
- **Danger / Error (Rose)**:
  - `bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20`
  - Used for: Expired tenders, failed downloads, system diagnostic alerts.

---

## 3. Typography
- **Primary Typeface**: `Inter`, `Outfit`, or system-ui sans-serif.
  - Clean, modern, highly legible across mobile and desktop displays.
- **Monospace Typeface**: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`.
  - Used for: Tender IDs (e.g. `2026_APD_325192_1`), Cloudflare R2 storage keys, dates, latency metrics, and command snippets.

---

## 4. Key Component Patterns

### 4.1 `TenderCard` (Client Portal)
- **Hierarchy**:
  1. Top Row: Department badge (e.g. `APD - Agriculture`), Tender Reference Number, and Status chip.
  2. Middle Row: Tender Title (truncated to 2 lines with tooltip for full text) and Location/Pincode.
  3. Metadata Grid: Estimated Tender Value (formatted in Lakhs/Crores `₹`), Closing Date with days-remaining countdown, and EMD amount.
  4. Actions: One-click "View NIT PDF" button, "Download BOQ ZIP" button, and Bookmark/Share icons.

### 4.2 Admin Operations Dashboard (`admin-panel/`)
- **System Telemetry Bar**: Real-time chips showing MongoDB latency (ms), Redis ping (ms), BullMQ queue counts, and memory consumption.
- **Diagnostic Engine Cards**: Red/amber issue cards showing the diagnosed problem, root-cause explanation, and copyable remediation shell commands.
- **Ingestion & Automation View (`IngestionView.jsx`)**:
  - **4 Distinct Fetch Control Cards**:
    1. *All Active Tenders Crawl*: Command 1 backfill with persistent resume checkpoint badge.
    2. *Daily Latest Tenders*: Command 2 incremental sync with 5-consecutive-existing catch-up threshold.
    3. *Missing Documents Radar*: Pending document recovery with retry button.
    4. *Cron Automation Cycles*: Daily schedule time chips and master toggle switch.
  - **Live Ingestion Telemetry & Terminal Console**:
    - Placed directly below the fetch controls.
    - Dark terminal aesthetic (`bg-slate-950`, border `border-slate-800`, monospaced log lines).
    - Status badge with pulsing dot (`RUNNING` / `IDLE`), elapsed timer (`mm:ss`), and "Stop Crawl" button.
    - Live KPI counters: Items Processed, New Tenders Saved, Skipped Existing, PDFs Secured, Missing PDFs, and Current Department Target.
    - Auto-scrolling terminal log stream with color-coded events (green for saved, amber for skipped, purple for department entries).
### 4.3 Telegram Bot Notification Layouts
- **Format**: Clean semantic HTML tags (`<b>`, `<code>`, `<i>`) with emoji category indicators.
- **Message Types**:
  - 🚀 **Start**: Blue/rocket header, portal identifier, target limit, and resume checkpoint information.
  - 📊 **Milestones**: Department title in monospaced code blocks, KPI counters (+saved, skipped, PDFs, BOQs), elapsed timer in `mm:ss`, and IST timestamp.
  - 🎉 **Completion**: Green celebration header, comprehensive totals breakdown, and Cloudflare R2 / MongoDB confirmation.
  - 🚨 **Interruption / Error**: Red siren alert, truncated error description, and checkpoint preservation confirmation.

---

## 5. Micro-interactions & Polish
- **Card Hover Effects**: Subtle elevation lift (`hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200`).
- **Smooth Loading**: Shimmer skeleton loaders matching card dimensions rather than generic full-screen spinners.
- **Backdrop Blur**: `backdrop-blur-md` on navigation bars and floating modals.
- **Responsive Breakpoints**: Mobile-first responsive grids (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`).
