# Metabase (free BI + Metabot AI)

Self-host [Metabase OSS](https://www.metabase.com/) next to this app, connect it to the same Supabase Postgres as `DATABASE_URL`, build dashboards, and optionally embed them in the Finance Console **Analytics** page.

Chart.js powers the in-app KPI charts (no Metabase required). Metabase is for deeper exploration and **Metabot** AI Q&A on your finance tables.

## Quick start (Docker)

From the **repo root**:

```bash
# Optional: set connection string for the Metabase app DB (Postgres for Metabase's own metadata).
# If omitted, Metabase uses H2 (fine for local demos; use Postgres for anything lasting).
docker compose -f docker-compose.metabase.yml up -d
```

Open **http://localhost:3000** and complete the setup wizard (admin email + password).

### Connect Supabase as a data source

1. Metabase → **Admin** → **Databases** → **Add database** → **PostgreSQL**.
2. Paste values from your repo-root `.env` `DATABASE_URL`:
   - Host: `db.<project-ref>.supabase.co` (or the pooler host Supabase shows)
   - Port: `5432` (or `6543` for pooler)
   - Database name: `postgres`
   - Username: `postgres` (or pooler user)
   - Password: your database password (not the service_role JWT)
3. Prefer **SSL** / `sslmode=require` as required by Supabase.
4. Save and sync the schema.

**Never** put `SUPABASE_SERVICE_ROLE_KEY` into Metabase. Use the Postgres URI / DB password only.

### Starter dashboard (manual, ~5 minutes)

Create questions (or use SQL) against:

| Question | Suggested SQL / approach |
|----------|--------------------------|
| Invoices by month | `invoice_header`: count + sum(`total_amount`) by `date_trunc('month', invoice_date)` |
| Spend by category | group by `category` |
| Top vendors | group by `vendor_name`, order by sum amount desc, limit 10 |
| Posted journals | `journal_entries` where status posted (if ledger schema applied) |

Pin them to a dashboard named **Finance Console**.

### Metabot (market AI)

In Metabase, open **Metabot** / Ask AI (feature availability depends on your Metabase version/edition) and ask natural-language questions about the models you saved (e.g. “top vendors last quarter”). Use Metabot inside Metabase; the Finance Console links to Metabase rather than embedding paid SSO AI chat.

### Embed into Finance Console

1. In Metabase, enable **public sharing** or create a **guest/public embed** for the dashboard.
2. Copy the embed URL.
3. Set in [`invoice-backend/public/js/api-config.js`](../invoice-backend/public/js/api-config.js):

```js
window.__METABASE_URL__ = 'http://localhost:3000';
window.__METABASE_EMBED_URL__ = 'https://YOUR_METABASE/public/dashboard/....'; // or guest embed URL
```

4. Open the UI → sidebar **Analytics** (or **Overview**). The Metabase panel shows the iframe when `__METABASE_EMBED_URL__` is set; otherwise use **Open Metabase**.

## Compose file

See [`docker-compose.metabase.yml`](../docker-compose.metabase.yml) at the repo root. Default UI port is **3000** (Finance Console API defaults to **3001**, so they do not clash).

Stop:

```bash
docker compose -f docker-compose.metabase.yml down
```

## Production notes

- Run Metabase on Render/Fly/a VPS with a dedicated Postgres for Metabase application data.
- Point Metabase at Supabase (read-only DB user recommended).
- Update `__METABASE_URL__` / `__METABASE_EMBED_URL__` on the static host the same way as `__INVOICE_API_BASE__`.
