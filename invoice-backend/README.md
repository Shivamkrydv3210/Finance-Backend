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
8. `09_uk_invoice_accuracy.sql` — UK vendor identifiers (VAT/CRN/sort code), invoice validation state, `invoice_vat_lines`
9. `10_uk_statutory_coa.sql` — `statutory_heading`/`statutory_sort_order` on `accounts`, ~30 new accounts (fixed assets, VAT control, Corporation Tax, PAYE/NIC, pensions, director's loan, equity, cost of sales, standard admin expense categories)
10. `11_journal_controls.sql` — reversal linkage on `journal_entries`
11. `12_uk_tax_kb.sql` — `6250` Irrecoverable VAT, `expense_category`, GBP defaults
12. `13_vat_return.sql` — `vat_returns` + `vat_return_lines` (Box 1–9 with per-box drilldown)

## Setup

1. Put secrets in **repo-root** `.env` and/or `invoice-backend/.env`. `src/config.js` loads repo-root first, then `invoice-backend/.env` only for variables not already set — so a template `invoice-backend/.env` with `OPENAI_API_KEY=sk-...` will not override real keys in the repo root file.
2. `npm install` && `npm start`
3. Open **http://localhost:3001/** for the **Finance Console** (sidebar UI: Overview/Analytics with Chart.js KPIs, invoices, ledger, reports, bank, month-end, NL query, AI assistant). Minimal legacy chat-only page: `/chat-legacy.html`.

**Analytics dashboard:** Overview and **Analytics** use Chart.js + `GET /api/stats` (includes `by_month`). Optional Metabase BI + Metabot: see [`../docs/METABASE.md`](../docs/METABASE.md) and [`../docker-compose.metabase.yml`](../docker-compose.metabase.yml).

**Production deploy (Render + Netlify, env vars, `api-config.js`):** repo root [`../DEPLOY.md`](../DEPLOY.md) and [`../render.yaml`](../render.yaml).

**Static hosting only / tunnel:** [`docs/FRONTEND_DEPLOY.md`](docs/FRONTEND_DEPLOY.md) — set `window.__INVOICE_API_BASE__` in `public/js/api-config.js` to your public API or tunnel URL (e.g. ngrok).

Saving an invoice (`POST /api/invoices` or chat tools) **posts to the ledger** by default (Dr expense + input tax / Cr AP). Set `post_to_ledger: false` on the request body to skip. Failures are stored in `invoice_header.posting_error`.

## Core API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List invoices (`?limit`, `?offset`) |
| GET | `/api/invoices/:invoiceId` | Invoice + line items |
| POST | `/api/extract` | `{ url }` → preview + extracted |
| POST | `/api/invoices` | Save invoice (flat or `{ extracted }`); optional `post_to_ledger`, `force` (bypass dedup), `override_validation` (post despite `pending_review`) |
| PATCH | `/api/invoices/:invoiceId/review` | `{ decision: 'validated'\|'rejected', actor?, notes? }` — approve/reject a `pending_review` invoice; approving triggers ledger posting |
| POST | `/api/query` | `{ question }` — NL → SELECT only on allowlisted tables |
| GET | `/api/stats` | `?period=2025-07` |
| POST | `/api/chat` | Chat + agent tools |

## UK invoice accuracy layer

Extraction now also captures (all optional): `vat_registration_number`, `company_registration_number`, `sort_code`, `account_number`, a structured UK `address` (line1/line2/town/county/postcode), and `vat_breakdown` (one entry per VAT rate present: `rate_type`, `rate_pct`, `net_amount`, `vat_amount`). See `src/services/validation/ukValidation.js`.

Before posting to the ledger, every invoice is checked:
- **VAT arithmetic**: `net × rate = VAT` per rate bucket, and the buckets must sum to the invoice total (±£0.02).
- **VAT number format**: UK Mod-97 check-digit validation (structural only — not a live HMRC lookup).
- **Vendor identity**: matched by VAT number → Companies House number → exact name (no more fuzzy substring matching); a VAT number that disagrees with what's on file for that vendor is flagged.
- **Duplicate detection**: a content hash (vendor + invoice number + total + date) blocks re-saving the same invoice unless `force: true`.

An invoice that fails any check gets `validation_status: 'pending_review'` and is **not** posted to the ledger until reviewed via `PATCH /api/invoices/:invoiceId/review`. Ledger entries for invoices with a multi-rate `vat_breakdown` post one expense + VAT line **per rate**, not one blended line.

## UK statutory chart of accounts

`accounts` carries `statutory_heading` and `statutory_sort_order`, mapping every account to a Companies Act 2006 / SI 2008/409 Schedule 1 Format 1 balance-sheet or P&L caption (e.g. `"Fixed assets - Tangible"`, `"Creditors: amounts falling due within one year"`, `"Cost of sales"`, `"Administrative expenses"`). The seed now also covers Corporation Tax, PAYE/NIC, pensions, a director's loan account, fixed assets/accumulated depreciation, a VAT control account, share capital/premium, and standard UK SME expense categories (rent, insurance, professional fees, etc.) — not just the original five fleet-expense accounts.

`GET /api/finance/reports/balance-sheet` and `/reports/pl` both return a `statutory` block alongside their existing fields — `{ format, sections: [{ heading, lines, subtotal }], ... computed subtotals (fixed_assets, net_current_assets, net_assets, gross_profit, operating_profit, profit_before_tax, ...) }` — grouped and ordered per the statutory format. The existing flat `assets`/`liabilities`/`equity`/`revenue_total`/`expense_total` fields are unchanged, so this is additive, not a breaking change.

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
| GET | `/api/finance/reports/vat-return` | UK VAT return, Boxes 1–9, `?from=&to=&save=true`. Returns the contributing journal lines per box, the derivation rule for each box, and a `content_hash` that recomputing the same period must reproduce. Box 4 excludes blocked input VAT automatically, since that is posted to `6250` at posting time. Boxes 2, 8 and 9 report zero — no Northern Ireland acquisition or dispatch data is captured — and say so in `unsupported_boxes`. |
| GET | `/api/finance/reports/export-pack` | JSON bundle: TB + tax register for advisor exports |
| GET | `/api/finance/journals` | Posted journals (`?from`, `?to`, `?limit`, capped at 200); returns `{ entries, total }` |
| POST | `/api/finance/journals` | Manual journal: `{ entry_date, description, lines: [{ account_code or account_id, debit, credit, tax_rate?, ... }], auto_approve? }`. Any line posted to a VAT account (1310/2110/2120) is arithmetic-checked (`net × rate = VAT`, same as invoices); a failed check forces the entry to `pending` approval regardless of `auto_approve`, and the response includes `vat_check`. |
| POST | `/api/finance/invoices/:invoiceId/post-ledger` | Retry ledger post |
| PATCH | `/api/finance/journals/:id/approval` | `{ approval_status, actor }` |
| POST | `/api/finance/journals/:id/post` | Draft → posted (after approval) |
| POST | `/api/finance/journals/:id/void` | `{ reason, actor? }` — reverses a posted entry with a new, opposite-signed, linked journal (never edits/deletes the original) |

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

- **No authentication/authorization on any route** — deliberate, deferred decision (single-user/internal use for now). Every finance/ledger endpoint is open, and `actor`/`created_by`/`approved_by` fields are unverified client-supplied strings. Before this is exposed beyond a trusted internal network, add API-key or user auth with roles (at minimum: a preparer must not be able to approve their own journal).
- **Balance sheet** is cumulative through `as_of`; without explicit year-end closing journals, assets may not equal liabilities + equity until P&amp;L is closed to retained earnings (manual journal).
- **Document attachments** store metadata only; upload files to Supabase Storage and save `storage_path` or a signed `public_url`.
- **NL query** is restricted to documented tables; prefer `/api/finance/reports/*` for regulated financial reads.
