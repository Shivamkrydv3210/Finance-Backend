# Invoice Backend

Invoice capture (OpenAI Vision), Supabase storage, **double-entry ledger**, bank reconciliation hooks, month-end checklist, NL query (constrained to allowed tables), stats, and chat agent.

**Handoff for other AI models / deep onboarding:** [`docs/AI_IMPLEMENTATION_HANDOFF.md`](docs/AI_IMPLEMENTATION_HANDOFF.md) (architecture, APIs, AI flows, file map, caveats).

## Database

### Fast path (recommended)

1. Open **Supabase Dashboard → SQL → New query**.
2. Paste the full contents of [`schema/00_run_all_in_order.sql`](schema/00_run_all_in_order.sql) and click **Run** (idempotent; safe to re-run).

### Demo data (large test load)

Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`. **Removes only** rows tagged as seed (`source = seed_demo`, vendors `ZZZ_SEED%`, banks `[SEED]%`, etc.) — your other data stays intact.

```bash
cd invoice-backend
npm run db:seed
# optional: npm run db:seed -- --invoices=2500 --vendors=180 --bankTxns=800
```

Or from your machine (requires **Postgres URI**, not the service-role JWT):

```bash
# Add DATABASE_URL to repo-root .env (Supabase → Settings → Database → Connection string → URI)
cd invoice-backend
npm install
npm run db:apply-schema
```

### File-by-file order (same as `00_run_all_in_order.sql`)

1. `01_tables.sql` — `vendors`, `invoice_header`, `invoice_line_items`
2. `02_run_invoice_query.sql` — `run_invoice_query` RPC for `/api/query`
3. `03_ledger_core.sql` — ledger + `invoice_header` ledger columns
4. `04_bank_reconciliation.sql` — bank + reconciliation
5. `05_close_workflow.sql` — month-end + attachments metadata
6. `06_seed_default_accounts.sql` — default CoA + current month period
7. `08_fixed_assets_and_localization.sql` — `fixed_assets`

## Setup

1. Put secrets in **repo-root** `.env` and/or `invoice-backend/.env`. `src/config.js` loads repo-root first, then `invoice-backend/.env` only for variables not already set — so a template `invoice-backend/.env` with `OPENAI_API_KEY=sk-...` will not override real keys in the repo root file.
2. `npm install` && `npm start`
3. Open **http://localhost:3001/** for the **Finance Console** (sidebar UI: invoices, ledger, reports, bank, month-end, NL query, AI assistant). Minimal legacy chat-only page: `/chat-legacy.html`.

**Production deploy (Render + Netlify, env vars, `api-config.js`):** repo root [`../DEPLOY.md`](../DEPLOY.md) and [`../render.yaml`](../render.yaml).

**Static hosting only / tunnel:** [`docs/FRONTEND_DEPLOY.md`](docs/FRONTEND_DEPLOY.md) — set `window.__INVOICE_API_BASE__` in `public/js/api-config.js` to your public API or tunnel URL (e.g. ngrok).

Saving an invoice (`POST /api/invoices` or chat tools) **posts to the ledger** by default (Dr expense + input tax / Cr AP). Set `post_to_ledger: false` on the request body to skip. Failures are stored in `invoice_header.posting_error`.

## Core API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List invoices (`?limit`, `?offset`) |
| GET | `/api/invoices/:invoiceId` | Invoice + line items |
| POST | `/api/extract` | `{ url }` → preview + extracted |
| POST | `/api/invoices` | Save invoice (flat or `{ extracted }`); optional `post_to_ledger` |
| POST | `/api/query` | `{ question }` — NL → SELECT only on allowlisted tables |
| GET | `/api/stats` | `?period=2025-07` |
| POST | `/api/chat` | Chat + agent tools |

## Finance / ledger API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/accounts` | Chart of accounts |
| GET | `/api/finance/periods` | Fiscal periods |
| PATCH | `/api/finance/periods/:periodId/status` | Body `{ status: open \| soft_closed \| locked }` |
| GET | `/api/finance/reports/trial-balance` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| GET | `/api/finance/reports/pl` | P&amp;L for range |
| GET | `/api/finance/reports/balance-sheet` | `?as_of=YYYY-MM-DD` |
| GET | `/api/finance/reports/tax-register` | Lines with `tax_scheme` / tax amounts (localization hook) |
| GET | `/api/finance/reports/export-pack` | JSON bundle: TB + tax register for advisor exports |
| GET | `/api/finance/journals` | Posted journals (`?from`, `?to`, `?limit`) |
| POST | `/api/finance/journals` | Manual journal: `{ entry_date, description, lines: [{ account_code or account_id, debit, credit, ... }], auto_approve? }` |
| POST | `/api/finance/invoices/:invoiceId/post-ledger` | Retry ledger post |
| PATCH | `/api/finance/journals/:id/approval` | `{ approval_status, actor }` |
| POST | `/api/finance/journals/:id/post` | Draft → posted (after approval) |

## Bank API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/bank/accounts` | `{ name, currency_code?, gl_account_code? }` (default GL `1100`) |
| GET | `/api/bank/accounts` | List |
| POST | `/api/bank/accounts/:id/import` | `{ rows: [{ txn_date, amount, ... }] }` or `{ csv, filename? }` |
| GET | `/api/bank/accounts/:id/transactions` | `?status=&from=&to=` |
| GET | `/api/bank/transactions/:txnId/suggestions` | Invoice match suggestions |
| POST | `/api/bank/transactions/:txnId/match` | `{ journal_entry_id?, journal_line_id?, match_type? }` |

## Close / compliance helpers

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/close/periods/:periodId/tasks/ensure` | Seed month-end checklist |
| GET | `/api/close/periods/:periodId/tasks` | List tasks |
| PATCH | `/api/close/tasks/:taskId` | `{ is_done, actor?, notes? }` |
| POST | `/api/close/attachments` | `{ entity_type, entity_id, storage_path or public_url, file_name?, ... }` |
| GET | `/api/close/attachments` | `?entity_type=&entity_id=` |

## Notes

- **Balance sheet** is cumulative through `as_of`; without explicit year-end closing journals, assets may not equal liabilities + equity until P&amp;L is closed to retained earnings (manual journal).
- **Document attachments** store metadata only; upload files to Supabase Storage and save `storage_path` or a signed `public_url`.
- **NL query** is restricted to documented tables; prefer `/api/finance/reports/*` for regulated financial reads.
