# Invoice automation

Node backend for invoice processing: extract (OpenAI Vision), save to Supabase, natural-language query, stats, and a chat UI.

## Quick start

```bash
cd invoice-backend
cp .env.example .env   # fill Supabase + OpenAI keys; or use a `.env` at this repo root
npm install
npm start
```

Open `http://localhost:3001/` for the chat UI. See [`invoice-backend/README.md`](invoice-backend/README.md) for the database setup and API.

## License

MIT (same as previous `invoice-processing-system` where applicable).
