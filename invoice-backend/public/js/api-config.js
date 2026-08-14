/**
 * When the HTML is served from another host (Netlify, etc.), set the API origin here.
 * Examples: '' (same origin as this page), 'https://your-api.onrender.com' (no trailing slash).
 * Full checklist: repo root DEPLOY.md. Tunnel / static-only notes: docs/FRONTEND_DEPLOY.md.
 */
window.__INVOICE_API_BASE__ = window.__INVOICE_API_BASE__ || '';

/*
 * Optional Metabase BI (see docs/METABASE.md) — disabled for now.
 * __METABASE_URL__ — open Metabase UI (e.g. http://localhost:3000).
 * __METABASE_EMBED_URL__ — public/guest embed iframe URL for a dashboard (optional).
 *
 * window.__METABASE_URL__ = window.__METABASE_URL__ || 'http://localhost:3000';
 * window.__METABASE_EMBED_URL__ = window.__METABASE_EMBED_URL__ || '';
 */

/** Resolve /api/... and /health paths against optional remote backend. */
window.__invoiceApiUrl = function invoiceApiUrl(path) {
  if (path == null || path === '') return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(window.__INVOICE_API_BASE__ || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
};
