# Deploy this repo (backend + frontend)

Secrets stay in the host dashboard (Render, Netlify, etc.). Never commit `.env` — it is gitignored; use `.env.example` as a checklist only.

## 0. Prerequisites

1. **Git remote** — Push this repository to GitHub (or GitLab / Bitbucket) so hosts can pull it.
2. **Supabase** — Project created; run [`invoice-backend/schema/00_run_all_in_order.sql`](invoice-backend/schema/00_run_all_in_order.sql) in the SQL editor (see [`invoice-backend/README.md`](invoice-backend/README.md)).
3. **API keys** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` ready to paste into Render.

---

## 1. Backend on Render

You can use the included [`render.yaml`](render.yaml) or configure the service manually (same result).

### Option A — Blueprint (`render.yaml`)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the repository that contains this monorepo.
3. Confirm Render detects [`render.yaml`](render.yaml) at the repo root and apply.
4. When prompted, enter **Environment** values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
5. Wait for deploy; open your service URL and check **`/health`** → `{"status":"ok"}`.

### Option B — Web Service (manual)

1. **New** → **Web Service** → select the repo.
2. **Root directory:** `invoice-backend`
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. **Health check path:** `/health`
6. **Environment** → add the same three variables as above.
7. Do **not** set `PORT` — Render injects it; the app reads `process.env.PORT`.

Optional variables (add in the dashboard if you want overrides): `OPENAI_CHAT_MODEL`, `OPENAI_VISION_MODEL`.

**Note:** Free web services may sleep after idle traffic; the first request after sleep can be slow.

---

## 2. Frontend (static UI)

The Finance Console is static files under [`invoice-backend/public/`](invoice-backend/public/).

### Point the UI at your API

Edit [`invoice-backend/public/js/api-config.js`](invoice-backend/public/js/api-config.js):

```js
window.__INVOICE_API_BASE__ = 'https://YOUR-SERVICE.onrender.com';
```

Use your Render **HTTPS** service URL with **no trailing slash**. Commit and push so your static host rebuilds.

For local development only, leave it as `''` so the browser uses the same origin as `npm start`.

### Netlify

1. [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. **Base directory** (Netlify UI):
   - **Empty** → publish directory **`invoice-backend/public`** (matches root [`netlify.toml`](netlify.toml)).
   - Or set base directory to **`invoice-backend`** → publish **`public`** (matches [`invoice-backend/netlify.toml`](invoice-backend/netlify.toml)).
3. Build command: leave blank (static site).
4. Deploy, then confirm the site loads and the API status in the header is OK.

**No GitHub (manual deploy):** Netlify → **Add new site** → **Deploy manually**. Drag either:

- the folder **`invoice-backend/public`** from this repo (must contain `index.html` at the top of that folder), or  
- a zip of **the contents** of `public` (so `index.html` is at the root of the zip).

Regenerate a zip from the repo: `cd invoice-backend/public && zip -r ../finance-console-netlify.zip .` — output is **`invoice-backend/finance-console-netlify.zip`** (gitignored). Before zipping, set `window.__INVOICE_API_BASE__` in `js/api-config.js` to your live API URL.

More detail: [`invoice-backend/docs/FRONTEND_DEPLOY.md`](invoice-backend/docs/FRONTEND_DEPLOY.md).

### Alternative: one URL only

If you **only** deploy the Render web service, Express already serves `public/` at `/`. You can use **`https://YOUR-SERVICE.onrender.com/`** for both UI and API and keep `__INVOICE_API_BASE__` empty. You skip Netlify for the UI; you lose a separate CDN-only frontend.

---

## 3. Smoke test

| Check | URL / action |
|--------|----------------|
| API up | `GET https://YOUR-API.onrender.com/health` |
| UI talks to API | Open Netlify URL; no “API offline”; open browser devtools → Network → API calls go to Render host |

---

## 4. Repo files that matter for deploy

| File | Role |
|------|------|
| [`render.yaml`](render.yaml) | Render Blueprint: `invoice-backend`, build, start, health check, secret env keys |
| [`invoice-backend/package.json`](invoice-backend/package.json) | `engines.node` for a consistent Node version |
| [`netlify.toml`](netlify.toml) | Netlify publish dir from repo root |
| [`invoice-backend/netlify.toml`](invoice-backend/netlify.toml) | Netlify when base dir is `invoice-backend` |
| [`invoice-backend/public/js/api-config.js`](invoice-backend/public/js/api-config.js) | Production API base URL for split hosting; optional `__METABASE_URL__` / `__METABASE_EMBED_URL__` |
| [`docker-compose.metabase.yml`](docker-compose.metabase.yml) | Local Metabase OSS (port 3000); see [`docs/METABASE.md`](docs/METABASE.md) |

---

## 5. Optional: Metabase BI

Chart.js analytics ship with the Finance Console (no extra service). For deeper BI and Metabot AI against Supabase Postgres:

1. Follow [`docs/METABASE.md`](docs/METABASE.md).
2. Set `window.__METABASE_URL__` and optionally `window.__METABASE_EMBED_URL__` in `api-config.js`.
3. Do not put `SUPABASE_SERVICE_ROLE_KEY` into Metabase — use the database password / `DATABASE_URL` only.