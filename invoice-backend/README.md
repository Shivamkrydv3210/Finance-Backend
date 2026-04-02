# Invoice Backend

Backend for invoice processing: extract from image URL, save invoices, natural-language query, stats, and chat agent. Replaces n8n for these flows.

## Database

Run the SQL in `schema/` in Supabase (SQL Editor), in order:

1. `01_tables.sql` — `vendors`, `invoice_header`, `invoice_line_items`
2. `02_run_invoice_query.sql` — `run_invoice_query` RPC for natural-language `/api/query`

## Setup

1. Copy `.env.example` to `.env` or set in the repo root `.env`:
   - `SUPABASE_URL` – Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – Service role key
   - `OPENAI_API_KEY` – OpenAI API key
   - `PORT` – Optional (default 3001)

2. Install and run:

```bash
npm install
npm start
```

Open the **Chat UI** in your browser: **http://localhost:3001/** (or the port you set). You can type messages, paste an image URL, or upload an invoice image to extract and save.

## API

- `POST /api/extract` – Body: `{ "url": "https://..." }`. Returns `{ preview, extracted }`.
- `POST /api/invoices` – Body: `{ "extracted": {...} }` (from extract) or flat fields `{ vendor_name, invoice_number, invoice_date, total_amount, currency, category, ... }`. Saves and returns summary.
- `POST /api/query` – Body: `{ "question": "list all fuel invoices" }`. Returns `{ count, data, sql_used }`.
- `GET /api/stats?period=2025-07` – Returns stats JSON.
- `POST /api/chat` – Body: `{ "message": "...", "session_id": "..." }`. Returns `{ "reply": "..." }`.
