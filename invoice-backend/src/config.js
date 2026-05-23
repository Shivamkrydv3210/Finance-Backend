import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo-root `.env` first (shared secrets). Then `invoice-backend/.env` only fills vars
// not already set — avoids cwd `dotenv.config()` loading placeholders first and blocking real keys.
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

/** Trim secrets — pasted keys often pick up accidental spaces/newlines. */
function envTrim(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : v;
}

const SUPABASE_URL = envTrim('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = envTrim('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = envTrim('OPENAI_API_KEY');
const PORT = Number(process.env.PORT) || 3001;

/** Override models without code changes (e.g. gpt-4o-mini). */
const OPENAI_CHAT_MODEL = envTrim('OPENAI_CHAT_MODEL') || 'gpt-4o';
const OPENAI_VISION_MODEL = envTrim('OPENAI_VISION_MODEL') || OPENAI_CHAT_MODEL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in environment');
  process.exit(1);
}

export {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY,
  PORT,
  OPENAI_CHAT_MODEL,
  OPENAI_VISION_MODEL,
};
