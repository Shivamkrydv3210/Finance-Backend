# Invoice automation

Node backend for invoice processing, **double-entry ledger**, financial reports, bank import/reconciliation hooks, and month-end checklist — see [`invoice-backend/README.md`](invoice-backend/README.md).

## Quick start

```bash
cd invoice-backend
cp .env.example .env   # fill Supabase + OpenAI keys; or use a `.env` at this repo root
npm install
npm start
```

Open `http://localhost:3001/` for the chat UI. See [`invoice-backend/README.md`](invoice-backend/README.md) for the database setup and API.

## Deploy (production)

Step-by-step for **Render** (API) and **Netlify** (static UI), plus env vars and `api-config.js`: [`DEPLOY.md`](DEPLOY.md). Root [`render.yaml`](render.yaml) defines the backend service for [Render Blueprints](https://render.com/docs/infrastructure-as-code).

## License

MIT (same as previous `invoice-processing-system` where applicable).
