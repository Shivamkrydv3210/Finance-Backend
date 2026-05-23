import { APIError } from 'openai';

/**
 * Turn OpenAI SDK / network errors into actionable messages for API responses.
 * @param {unknown} err
 * @param {string} context - Short label e.g. "Chat assistant", "Vision extraction"
 */
export function formatOpenAIRequestError(err, context = 'OpenAI') {
  if (err instanceof APIError) {
    const status = err.status;
    if (status === 401) {
      return `${context}: Invalid or expired API key (401). Set OPENAI_API_KEY in .env to a secret key from https://platform.openai.com/api-keys — no quotes or trailing spaces.`;
    }
    if (status === 403) {
      return `${context}: Access denied (403). ${err.message} If you use org/project restrictions, set OPENAI_ORG_ID / OPENAI_PROJECT_ID in .env.`;
    }
    if (status === 429) {
      return `${context}: Rate limit or quota exceeded (429). Check usage and billing at https://platform.openai.com/account/billing`;
    }
    if (status === 503 || status === 502) {
      return `${context}: OpenAI service temporarily unavailable (${status}). Retry in a moment.`;
    }
    return `${context}: ${err.message}`;
  }
  const msg = err?.message != null ? String(err.message) : String(err);
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    return `${context}: Network error — check internet, firewall, or VPN. ${msg}`;
  }
  return `${context}: ${msg}`;
}
