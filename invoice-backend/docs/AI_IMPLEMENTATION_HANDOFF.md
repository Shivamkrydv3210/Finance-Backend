# Implementation handoff — Invoice / finance backend

This document is for **another AI model or engineer** who needs to know **what the product does feature-by-feature**: behaviors, inputs, outputs, and UI/API entry points. Technical stack and file layout are summarized at the end.

The live **Finance Console** is static HTML/JS at repo `invoice-backend/public/` (default URL `http://localhost:3001/`). Sidebar routes mirror the sections below. A minimal older chat-only page exists at `/chat-legacy.html`.

---

## Feature catalog (functionality-first)

### A. Overview (dashboard)

**Purpose:** High-level snapshot of invoice activity.

**What it shows (from `GET /api/stats`):**

- Optional **period filter** (query `?period=`): values like `2025` or `2025-07` filter invoices whose `invoice_date` **starts with** that string; omit for all time.
- **Total invoice count** in that scope.
- **Totals by currency:** INR total and USD total (only those two are aggregated explicitly).
- **Average** invoice amount, **highest** and **lowest** invoice (amount + vendor name).
- **Breakdown by category** (`fuel`, `maintenance`, `repair`, `parts`, `other`): count and sum per category.
- **Top 5 vendors** by total spend: vendor name, invoice count, total.
- **By month** (`by_month`): array of `{ month: "YYYY-MM", count, total }` sorted ascending (for Analytics charts).

**UI:** Overview and `#/analytics` render Chart.js KPI charts from this payload. Optional Metabase embed via `window.__METABASE_*` in `public/js/api-config.js` (see `docs/METABASE.md`).

**Empty data:** Returns zeros and empty structures if there are no invoices (or none in the selected period).

**UI:** Route `#/dashboard` — quick links to invoices, extract URL, reports, Money Trace.

---

### B. Invoices (list, detail, create)

**Purpose:** Work with saved invoices as business records (header + line items).

**List — `GET /api/invoices`**

- Pagination: `?limit=` (default 50, max **200**), `?offset=`.
- Ordered by **invoice_date descending**.
- Response: `{ invoices: [...], total }` where `total` is full count for pagination.

**Detail — `GET /api/invoices/:invoiceId`**

- Returns one **invoice_header** row plus all **invoice_line_items** ordered by `line_number` as `line_items`.

**Create via API — `POST /api/invoices`**

Two shapes:

1. **`{ extracted: { ... } }`** — same shape as vision extraction (vendor, dates, amounts, `line_items[]`, category, etc.). Saves then optionally posts to ledger (below).
2. **Flat body** — typed fields: `vendor_name`, `invoice_number`, `invoice_date`, `total_amount`, `currency`, `category`, `tax_amount`, `subtotal`, `notes`, `vendor_email`, `vendor_phone`, `vendor_address`, `due_date`, `payment_mode`, plus `post_to_ledger` and `actor`.

**Vendor behavior:** Vendors are **matched or created** by name (fuzzy ILIKE match on existing name, else insert). Contact fields update vendor creation when provided.

**Categories:** Stored as `fuel | maintenance | repair | parts | other`. Common synonyms from extraction or typing are mapped (e.g. petrol → fuel, spare → parts).

**Line items on save:**

- From extraction: one row per extracted line; quantities and amounts parsed from strings with commas removed.
- If extraction has **no** line items: a **single synthetic line** is created carrying subtotal/total as one line.
- Typed API save: **one line** using notes/category as description.

**Ledger posting on save (default ON):**

- Unless `post_to_ledger` is **`false`**, after insert the system attempts to **post a supplier-invoice journal** (expense + optional input tax debit; accounts payable credit). Success or skip is returned in `summary.ledger`; failures set `invoice_header.posting_error` and return `summary.ledger_error` without rolling back the invoice save.

---

### C. Extract from URL

**Purpose:** Turn a **hosted image or document URL** into structured invoice JSON **without** saving (preview), or save via other flows.

**API — `POST /api/extract`** body `{ url }`

- Calls vision model with a fixed extraction prompt; expects **JSON only** with vendor, contact, invoice/due dates, totals, currency, tax, payment mode, `line_items[]` (description, quantity, unit price, line amount, sub_expenditure), **category** from allowed set, notes, etc.
- Returns **`preview`** (human-readable string for display) and **`extracted`** (object). Sets `extracted.file_url` to the URL used.
- **SSL / fetch failures** from the model or host produce a clear error suggesting valid HTTPS hosting.

**UI:** Route `#/extract` — user pastes URL, sees preview, can save through the same invoice pipeline as the rest of the app (depending on UI wiring).

---

### D. AI Assistant (chat)

**Purpose:** Conversational assistant that **extracts**, **saves**, and **answers questions** using tools (not free-form hallucination for numbers).

**API — `POST /api/chat`** body `{ message?, session_id?, image_data_url? }`

- **`image_data_url`:** If present, server runs **the same vision extraction** as URL flow, stores full extracted object **server-side per session**, and sends the model a **short user message** containing the **preview** plus instructions: user confirms save → call save tool **with empty args** so the server injects the stored extraction.
- **`session_id`:** Optional; defaults to `"default"`. Same id shares **in-memory** conversation history (last **20** user+assistant messages) and pending upload extraction.
- Returns `{ reply }` — final assistant text after up to **10** model/tool rounds.

**Conversation capabilities (tool-backed):**

| User intent | What happens |
|-------------|----------------|
| Paste **image URL** | Extract only → preview; on “yes”, save extracted object. |
| **Upload image** in UI (base64) | Same as URL but data stored in session until save. |
| “Save / upload without preview” for URL | One-step extract + save. |
| **Type invoice fields** in chat | Save as typed invoice (required: vendor_name, total_amount). |
| Ask **lists, totals, filters** on invoices | NL query over allowlisted tables. |
| Ask **dashboard-style summaries** | Stats with optional period. |

**Important behavior:** When saving after upload with **empty** tool args, the server reads the session-stored extraction with **`getLastExtracted`**, which **clears** it after read — a second save without a new upload fails until user uploads again.

**Limitation:** Chat history and session extractions are **in-memory only** (lost on server restart; not shared across multiple server instances).

---

### E. Natural language query

**Purpose:** Ask questions in English; system generates **read-only SQL** over a **fixed allowlist** of tables and runs it safely.

**API — `POST /api/query`** body `{ question }`

- Allowed tables include: `invoice_header`, `invoice_line_items`, `vendors`, `accounts`, `fiscal_periods`, `journal_entries`, `journal_lines`.
- Response: `{ count, data, sql_used }` — number of rows returned, row array, and the SQL string for transparency.

**Typical questions:** lists by vendor/category/date, joins to line items, aggregates (sum, count, avg), journal activity with joins to accounts.

**UI:** Route `#/query` — user types question, sees table of results and SQL used.

---

### F. Chart of accounts

**Purpose:** View the GL **chart of accounts** (codes, names, types).

**API — `GET /api/finance/accounts`**

- Returns `{ accounts: [...] }` — active accounts used for posting and reports.

**UI:** Route `#/accounts`.

---

### G. Fiscal periods

**Purpose:** Control whether a period accepts new/changed postings (**open**, **soft_closed**, **locked**).

**API**

- **`GET /api/finance/periods`** — list recent periods (up to **36**), with status and dates.
- **`PATCH /api/finance/periods/:periodId/status`** body `{ status: "open" | "soft_closed" | "locked" }`.

**Effect on invoices:** Saving an invoice with ledger posting **fails** if the invoice date falls in a **locked** period (error stored on invoice).

**UI:** Used from reports / close workflows as applicable.

---

### H. Journals (view, create, approve, post)

**Purpose:** Full **double-entry** journal lifecycle beyond automatic invoice posting.

**List — `GET /api/finance/journals`**

- Query: `?from=`, `?to=` (entry_date filters), `?limit=` (default **100**).
- Returns posted/draft entries in range (implementation in journal service).

**Create manual journal — `POST /api/finance/journals`**

- Body: `entry_date`, `description`, optional `reference`, `lines` (≥ **2** lines), optional `created_by`, **`auto_approve`** (default true if omitted — when true, skips approval queue per service behavior).
- Each line: **`account_id` or `account_code`**, `debit`, `credit`, optional `description`, `dimensions`, `tax_scheme`, `tax_rate`, `tax_amount`, `party_type`, `party_id`, `currency_code`.
- **Rejected** if period for `entry_date` is **locked**.

**Approval — `PATCH /api/finance/journals/:journalEntryId/approval`**

- Body: `approval_status`, `actor` — updates workflow state on a draft entry.

**Post draft — `POST /api/finance/journals/:journalEntryId/post`**

- Body optional `actor` — moves draft journal to **posted** after approvals as enforced by service.

**UI:** Route `#/journals` — browse entries, create manual journals, approval/post actions as wired in dashboard.

---

### I. Automatic invoice → ledger posting

**Purpose:** Keep the GL in sync when invoices are recorded (AP and expense recognition).

**When it runs:** On `saveExtractedInvoice` / `saveTypedInvoice` unless `post_to_ledger === false`.

**What gets posted (conceptually):**

- **Debit:** expense account (by **invoice category** → GL code mapping in `accountService`).
- If **tax_amount &gt; 0:** split debit between **expense (subtotal)** and **input tax** account; tax line can carry scheme/rate metadata.
- **Credit:** **Accounts Payable** (default code **2000**).
- **Idempotent:** Already-posted invoice or existing journal keyed by invoice source is skipped / reconciled to header.
- **Errors:** Period lock, missing seed accounts, validation — stored in `posting_error` on the invoice row.

**Retry — `POST /api/finance/invoices/:invoiceId/post-ledger`**

- Reloads invoice by id and calls posting again (for fixes after correcting data or periods).

---

### J. Financial reports

**Purpose:** Standard accounting reads for operations and AI narration.

| Report | API | What it answers |
|--------|-----|-----------------|
| **Trial balance** | `GET /api/finance/reports/trial-balance?from=&to=` | Debits and credits per account between two dates (posted activity). |
| **P&amp;L** | `GET /api/finance/reports/pl?from=&to=` | Income statement for the range. |
| **Balance sheet** | `GET /api/finance/reports/balance-sheet?as_of=` | Point-in-time assets/liabilities/equity **as of** date (cumulative; see README for closing-entry caveat). |
| **Tax register** | `GET /api/finance/reports/tax-register?from=&to=` | Lines with tax metadata (`tax_scheme`, amounts, rates) for compliance / export pipelines. |
| **Export pack** | `GET /api/finance/reports/export-pack?from=&to=` | Single JSON bundle: **trial balance + tax register** plus `localization_note` for country-specific mapping later. |

**UI:** Route `#/reports` — date pickers and viewers for TB, P&amp;L, balance sheet, tax register.

---

### K. Bank accounts and reconciliation

**Purpose:** Import bank movements, **suggest** links to invoices, **record** reconciliation to journal entries.

**Create bank account — `POST /api/bank/accounts`**

- Body: `name`, optional `currency_code` (default **INR**), optional `gl_account_code` (default **`1100`** — must exist in chart), optional `last_four`.
- Links the bank book to a **cash/bank GL** account.

**List — `GET /api/bank/accounts`**

- Active bank accounts with resolved **GL account** summary.

**Import — `POST /api/bank/accounts/:bankAccountId/import`**

- Either **`rows`**: array of `{ txn_date, amount, description?, reference?, balance_after? }` with optional `raw` passthrough, **or** **`csv`** string.
- CSV: header row must include **date** and **amount** columns (aliases supported: `txn_date`, `transaction_date`, `amt`, etc.); optional description, reference, balance.
- Creates an **import batch** row and inserts **bank_transactions** with `reconciliation_status: "unmatched"`.
- Response: `import_batch_id`, `inserted` count.

**List transactions — `GET /api/bank/accounts/:bankAccountId/transactions`**

- Query: `?status=` (e.g. `unmatched` / `matched`), `?from=`, `?to=`, `?limit=` (default **200**).

**Suggestions — `GET /api/bank/transactions/:bankTxnId/suggestions`**

- Loads the bank txn; finds **invoices** whose date is within **±14 days** and amounts close to **absolute bank amount**.
- Scores by amount difference; returns up to **10** suggestions with **`confidence`** score and `amount_diff`.

**Match — `POST /api/bank/transactions/:bankTxnId/match`**

- Body: `journal_entry_id`, optional `journal_line_id`, optional `match_type` (default `manual`), optional `confidence`, `note`.
- Upserts **`reconciliation_matches`** for that bank txn; sets bank txn **`reconciliation_status`** to **`matched`**.

**UI:** Route `#/bank` — create account, paste CSV or rows, list txns, fetch suggestions, record match.

---

### L. Money Trace

**Purpose:** From **one anchor** (invoice, journal, bank line, or account), show the **chain** of evidence: attachments, invoice, journal lines (with account names), bank reconciliation — and explicit **gaps** where something is missing.

**API — `GET /api/trace`** (query param `from` or `q`)

**Anchor formats:**

- `invoice:123` or `inv:123`
- `je:45` or `journal_entry:45`
- `journal_line:9` or `jl:9`
- `bank_txn:1` or `bank:1`
- `account:5100` — requires **`from_date` / `to_date`** (or aliases `period_from` / `period_to`) and optional **`limit`** (default **25**); returns **multiple** traces for posted journals in range hitting that account.

**Gap flags (examples):** `no_attachment`, `posting_error`, `invoice_not_posted_to_ledger`, `no_journal_for_invoice`, `no_bank_reconciliation` (when AP credit exists but no bank match), `no_journal_link` from orphan bank txn, etc.

**UI:** Route `#/trace` — user enters anchor string, sees JSON/trace visualization per dashboard implementation.

---

### M. Month-end close and attachments

**Purpose:** Checklist for closing a fiscal period; **metadata** for documents tied to entities (actual files in Supabase Storage, not uploaded by these endpoints alone).

**Seed checklist — `POST /api/close/periods/:periodId/tasks/ensure`**

- If tasks already exist for that period: `{ created: false, message: '...' }`.
- Else inserts **five default tasks** (order preserved):

  1. Bank accounts reconciled  
  2. Review accruals and prepayments  
  3. Review AP aging  
  4. Prepare tax summary / advisor pack  
  5. Soft-close or lock period after sign-off  

**List tasks — `GET /api/close/periods/:periodId/tasks`**

- Ordered by `sort_order`.

**Update task — `PATCH /api/close/tasks/:taskId`**

- Body: `is_done` (boolean), optional `actor`, optional `notes`.
- When marking done: sets `done_at`, `done_by`; writes an **`audit_events`** row for the task.

**Register attachment — `POST /api/close/attachments`**

- Body: `entity_type`, `entity_id`, and either `storage_path` or `public_url`, plus optional `file_name`, `mime_type`, `uploaded_by`.
- Typical pattern: `entity_type: "invoice_header"`, `entity_id: "<invoice_id>"` after client uploads file to Storage.

**List attachments — `GET /api/close/attachments?entity_type=&entity_id=`**

- Returns rows newest first.

**UI:** Route `#/close` — pick period, ensure tasks, check off items, register/list attachments.

---

### N. AI Tax Advisor

**Purpose:** Combine **last 6 months** of structured invoice/journal/tax-line/period data with an LLM to produce **prioritized, INR-scoped tax suggestions** (Indian GST / IT context in the prompt).

**API — `GET /api/ai/tax-optimization`**

**Deterministic inputs assembled include:**

- Summary: invoice count, total spend, total tax, effective tax rate.
- **Missing tax** on invoices over **INR 1,000** with zero/null tax.
- **Miscategorized** “other” over **INR 500**.
- **Vendor tax inconsistencies:** same vendor with mix of tax and non-tax invoices.
- **Tax by scheme** from journal lines with `tax_scheme` set.
- **Fiscal period** snapshot: current open period label, locked period count.
- **Spend by category.**

**AI output:** JSON array of suggestions with priority, category (`itc_recovery`, `recategorization`, `timing`, `compliance`, `vendor_negotiation`), title, description, **estimated_savings_inr**, **affected_invoices**, **action_items**.

**Response envelope:** `generated_at`, `data_summary`, `suggestions`, `total_potential_savings_inr`, `suggestion_count`.

**UI:** Route `#/ai-tax` — “AI Tax Advisor”.

---

### O. AI Audit Shield (anomalies)

**Purpose:** Automated **rule-based anomaly scan** (last ~1 year invoices, bank, journals) plus **LLM narrative** of risks per finding type.

**API — `GET /api/ai/anomalies`**

**Rule modules (each may emit a finding block):**

1. **Potential duplicates** — same vendor, amounts within **±2%**, dates within **7 days** (pair scan with bounded inner loop).
2. **Round-number amounts** — total ≥ **5,000** and exact multiple of **1,000**.
3. **Weekend-dated invoices** — Saturday/Sunday (informational).
4. **Price spikes** — invoice **>150%** of same vendor+category average and **>2,000** above that average (requires ≥3 historical points in that bucket).
5. **Incomplete vendor master** — missing email or address on vendor row.
6. **Benford’s law** — on invoice totals’ leading digits; if sample ≥ **50** and chi-square above threshold, flag deviation.
7. **Orphan bank transactions** — `unmatched` and older than **30 days**.
8. **Unposted invoices** — no `journal_entry_id`.

Each finding includes **severity** (`critical` / `warning` / `info`), **title**, **items** (samples), **count**.

**AI layer:** Sends condensed findings to model; returns **`ai_analysis`** array with risk level, explanation, recommendation, impact per finding type.

**Status field:** `clean` | `critical` | `attention_needed` | `minor_issues` depending on severities.

**UI:** Route `#/ai-anomaly` — “AI Audit Shield”.

---

### P. AI Report Insights (narrator)

**Purpose:** Turn real **report numbers** into a **board-style narrative** (executive summary, insights, concerns, recommendations, period comparison when data exists).

**API — `POST /api/ai/narrate-report`** body:

- **`report_type`** — required: `pl`, `tb`, `trial_balance`, `bs`, `balance_sheet`, `tax`, `tax_register`.
- **`from`**, **`to`** — date range (defaults to current month if omitted).
- **`as_of`** — for balance sheet–style context (defaults sensibly with `to`).

**Behavior:** Loads the same computations as finance reports (and for P&amp;L may include **prior period** comparison, **top vendors** in range, invoice count). Model returns JSON: `executive_summary`, `key_insights[]`, `concerns[]`, `recommendations[]`, `period_comparison`.

**UI:** Route `#/ai-narrator` — pick report type and dates, view narrative JSON.

---

### Q. AI Cash Flow

**Purpose:** **Historical** cash/invoice patterns (~**18 months**) plus **LLM** 90-day style forecast in JSON.

**Deterministic block includes:**

- Monthly **invoice outflow** totals and by category.
- Weekly **bank inflow/outflow/net** from signed amounts.
- **Top vendor payment cycles** (avg days between invoices, avg amount).
- **Seasonal** month-of-year averages from historical months.
- Totals: total invoiced, total bank inflow/outflow.

**AI output:** `forecast` (three buckets Month+1..3 with projected in/out/net and confidence), `seasonal_insights`, `vendor_alerts`, `risk_flags`, `narrative`.

**API — `GET /api/ai/cash-flow-forecast`**

**UI:** Route `#/ai-cashflow`.

---

### R. Vendor AI (vendor intelligence)

**Purpose:** **Spend concentration**, per-vendor statistics, category benchmarks, then **LLM** procurement-style commentary.

**Deterministic block (~12 months):**

- Top **30** vendors by spend with: invoice count, total spend, **share %** of total, avg invoice, stddev, **pricing_consistency** label, **price trend** vs first/second half of history, avg days between invoices, categories, sample line descriptions, min/max invoice amounts.
- **Category comparison:** vendors in each category sorted by avg invoice amount (cheap vs expensive within category).
- **Concentration risk:** % of spend in **top 5** vendors.

**AI output:** Per-vendor scores (top 10), risk factors, opportunities, price assessment; **portfolio_insights**, **consolidation_opportunities**, **overall_health**, **narrative**.

**API — `GET /api/ai/vendor-intelligence`**

**UI:** Route `#/ai-vendor` — “Vendor AI”.

---

### S. AI Compliance

**Purpose:** Run a **fixed battery of bookkeeping / control checks**, then optional **LLM audit narrative** (Indian regulatory framing in prompt).

**API — `GET /api/ai/compliance-check`**

**Checks (each returns pass/fail/warning/info, severity, items, count):**

1. **Period balance** — For recent fiscal periods, sum all **posted** journal line debits vs credits; **fail** if imbalance &gt; **0.01**.
2. **Bank reconciliation timeliness** — **Unmatched** bank txns older than **30 days** (warning; severity scales with count).
3. **Supporting documentation** — Invoices **&gt; INR 10,000** without a **`document_attachments`** row for `entity_type = invoice_header` (warning).
4. **Tax completeness** — Invoices **&gt; INR 5,000** with null/zero **tax_amount** (warning).
5. **Month-end close** — **Past** periods not **locked** with **incomplete** month-end tasks (warning).
6. **Invoice numbering** — Numeric gaps in `invoice_number` sequence (info-level).
7. **Fixed assets** — Rows missing useful life or depreciation GL accounts (warning).
8. **Journal approvals** — Draft entries or **pending** approval (warning).

**AI output (when any check not pass):** `overall_readiness`, `readiness_score` 0–100, `check_analysis[]` with remediation steps, `executive_summary`. If all pass: readiness **audit_ready**, score **100**, short positive summary.

**UI:** Route `#/ai-compliance`.

---

### T. Demo database seed

**Purpose:** Populate large **synthetic** datasets for performance and UI testing **without** deleting user data.

**Script — `npm run db:seed`** (optional CLI args like `--invoices=2500` per README).

**Safety:** Removes only rows tagged as demo/seed (e.g. `source = seed_demo`, specific vendor/bank prefixes — see `invoice-backend/README.md`).

**Requirements:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

---

### U. Health check

**`GET /health`** — returns `{ status: "ok" }` for uptime monitors.

---

## Technical appendix (short)

### Stack

Node.js (ESM), Express, Supabase JS client (service role), OpenAI SDK (chat + vision). Optional `DATABASE_URL` for `npm run db:apply-schema`.

### Configuration (`src/config.js`)

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Optional: `PORT` (default **3001**), `OPENAI_CHAT_MODEL` (default `gpt-4o`), `OPENAI_VISION_MODEL`. Env loaded from `invoice-backend/.env` then repo-root `.env` (trimmed values).

**Note:** NL SQL generation in `queryService.js` uses a **hardcoded** `gpt-4o-mini` model string.

### Database apply order

See `schema/00_run_all_in_order.sql` — vendors/invoices → safe query RPC → ledger → bank → close tasks/attachments → seed CoA → fixed assets/localization.

### Security / ops

Service role is **server-only**. NL query is still sensitive. Chat has **no built-in auth**. CORS is wide open by default — tighten for production.

### Key source files (navigation)

- `src/index.js` — mounts routers, static `public/`, health.
- `src/routes/*.js` — HTTP surface per area.
- `src/services/*.js` and `src/services/**` — business logic.
- `src/agent/*` — chat tool loop and session store.
- `public/js/dashboard.js` — Finance Console routes and API wiring.

---

### Suggested prompts for another model

- “Read `invoice-backend/docs/AI_IMPLEMENTATION_HANDOFF.md` and `invoice-backend/README.md`, then implement [feature] without changing unrelated behavior.”
- “When changing invoice posting, preserve idempotency and `posting_error` semantics.”

---

*Verify against the current branch if schema or routes have changed since this document was updated.*
