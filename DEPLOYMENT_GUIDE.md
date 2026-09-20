# TenderHub Deployment Guide (Render)

This comprehensive guide explains how to deploy the full-stack **TenderHub** platform to [Render](https://render.com).

TenderHub is architected as a monorepo consisting of:
- **Backend API (`tenderhub-api`)**: Node.js / Express web service connected to MongoDB Atlas, Upstash Redis, and Cloudflare R2.
- **Frontend Client (`tenderhub-web`)**: React / Vite Single Page Application (SPA).

---

## Architecture & Requirements

Before deploying, make sure you have:
1. A **GitHub** account with this repository pushed (`RaviNITS071/TenderHub30`).
2. A **Render** account ([render.com](https://render.com)).
3. External cloud services configured:
   - **MongoDB Atlas**: Free M0 cluster connection string (`mongodb+srv://...`).
   - **Upstash Redis**: Serverless Redis URI (`redis://default:...`).
   - **Cloudflare R2**: Account ID, Access Key, and Secret Access Key.

---

## Option A: Automated 1-Click Deployment (Recommended via Blueprint)

A ready-to-use [`render.yaml`](./render.yaml) specification is located at the root of the repository. Render can parse this file to set up both services with proper build flags, rewrites, and environment variable bindings automatically.

### Steps:
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click the **New +** button in the top navigation bar and select **Blueprint**.
3. Connect your GitHub account and select your repository: **`RaviNITS071/TenderHub30`**.
4. Render will analyze `render.yaml` and display the blueprint plan showing:
   - `tenderhub-api` (Web Service - Node)
   - `tenderhub-web` (Static Site)
5. Under **Environment Variables**, fill in the required external credentials (see table below).
6. Click **Apply**. Render will build and deploy both services concurrently!
7. Once `tenderhub-api` deploys, note its URL (e.g. `https://tenderhub-api.onrender.com`). If you need to update `VITE_API_URL` or `CORS_ORIGIN`, verify they point to the exact URLs assigned by Render.

---

## Option B: Manual Setup via Render Dashboard

If you prefer to configure each service manually in the Render UI, follow these steps.

### Step 1: Deploy Backend Web Service (`tenderhub-api`)

1. Go to [Render Dashboard](https://dashboard.render.com) > **New +** > **Web Service**.
2. Connect your GitHub repository: `RaviNITS071/TenderHub30`.
3. Configure the settings:
   - **Name**: `tenderhub-api`
   - **Region**: Choose the closest region (e.g., *Singapore* or *Oregon*)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Expand **Advanced** and set:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `Yes`
5. Under **Environment Variables**, add the following:

| Key | Value / Instructions |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` *(Render sets this automatically, but good to define)* |
| `MONGO_URI` | Your MongoDB Atlas connection URI (`mongodb+srv://...`) |
| `REDIS_URL` | Your Upstash Redis connection URI (`redis://default:...`) |
| `JWT_ACCESS_SECRET` | A secure random string (minimum 32 characters) |
| `JWT_REFRESH_SECRET` | A secure random string (different from access secret) |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `7d` |
| `CORS_ORIGIN` | `https://tenderhub-web.onrender.com` *(or comma-separated list of your frontend URLs)* |
| `R2_ACCESS_KEY_ID` | Your Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Your Cloudflare R2 Secret Access Key |
| `R2_ACCOUNT_ID` | Your Cloudflare Account ID |
| `R2_BUCKET_NAME` | `tenderhub` |
| `OPENAI_API_KEY` | `dummy_key` *(or your real key if AI summarizer is active)* |

6. Click **Create Web Service**. Wait for the build and deployment to finish.
7. Once deployed, verify by opening `https://<your-api-name>.onrender.com/health` in your browser. You should see:
   ```json
   {"status":"ok","timestamp":"..."}
   ```

---

### Step 2: Deploy Frontend Static Site (`tenderhub-web`)

1. Go to [Render Dashboard](https://dashboard.render.com) > **New +** > **Static Site**.
2. Connect your GitHub repository: `RaviNITS071/TenderHub30`.
3. Configure the settings:
   - **Name**: `tenderhub-web`
   - **Branch**: `main`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Expand **Redirects/Rewrites** (CRITICAL for client-side routing):
   - Click **Add Rule**
   - **Type**: `Rewrite`
   - **Source Path**: `/*`
   - **Destination**: `/index.html`
   > *Note: Without this rewrite rule, refreshing any deep URL (e.g. `/tenders`, `/about`, `/login`) will return a 404 Not Found error.*
5. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-backend-api-name>.onrender.com/api/v1` |

> *Important: Vite bakes environment variables into the static javascript bundle at build time. Whenever you change `VITE_API_URL`, you must trigger a manual rebuild in Render ("Clear build cache & deploy").*

6. Click **Create Static Site**.

---

## Step 3: Link CORS and API URLs

1. Copy the deployed frontend URL (e.g. `https://tenderhub-web.onrender.com`).
2. Go to the **tenderhub-api** service in Render > **Environment**.
3. Verify that `CORS_ORIGIN` includes your frontend URL.
   *(Note: The backend code already includes wildcard support for all `*.onrender.com` domains as a safeguard, but setting `CORS_ORIGIN` explicitly is best practice).*
4. If you have a custom domain (e.g., `https://tenderhub.in`), add it to `CORS_ORIGIN`:
   ```env
   CORS_ORIGIN=https://tenderhub-web.onrender.com,https://tenderhub.in
   ```

---

## Important Render Free Tier Considerations

1. **Inactivity Sleep (Spin-Down)**:
   - On the Free plan, Render Web Services spin down after 15 minutes of zero traffic.
   - When a user visits TenderHub after a period of inactivity, the first API request may take 45–60 seconds while the backend container wakes up. Subsequent requests will be fast.
   - The Static Site (frontend) does **not** sleep and always loads instantly.
2. **Scheduled Workers / Cron**:
   - The scraper worker (`backend/src/workers/index.js`) can be run as a separate Render **Background Worker** or as a **Cron Job** (e.g., run every 6 hours: `0 */6 * * *` with command `node src/workers/index.js`).
3. **Log Monitoring**:
   - You can view real-time backend logs under the **Logs** tab of `tenderhub-api` on the Render Dashboard.

---

## Generating Official Architecture & Disaster Recovery Manuals (PDF)

TenderHub includes automated Playwright-based PDF document generators for offline operations and infrastructure audits:

1. **Disaster Recovery & High-Availability Failover Manual** (4 pages):
   ```bash
   npm run manual:disaster
   ```
2. **Production Deployment & Cloud Topology Manual** (2 pages):
   ```bash
   npm run manual:deployment
   ```
3. **Generate Both Manuals Simultaneously**:
   ```bash
   npm run manuals:all
   ```

> *Note: These commands can be run either from the project root or inside the `backend/` folder. Generated PDFs are placed into `docs/` and synced to `backend/backups/`.*

