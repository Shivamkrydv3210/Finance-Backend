# Deploy only the Finance Console (static frontend)

**Full production (API on Render + static UI):** see repo root [`DEPLOY.md`](../../DEPLOY.md).

The UI lives under `public/` and talks to the backend over HTTP. When the HTML is served from **Netlify / Vercel / Cloudflare Pages**, `/api/*` no longer hits your Express app unless you point the browser at a **reachable** backend URL.

---

## Netlify (step-by-step)

Your repo is a monorepo: `ai-automation/` with the UI in `invoice-backend/public/`.

### A. Deploy from Git (recommended)

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. In [Netlify](https://app.netlify.com/) → **Add new site** → **Import an existing project** → pick the repo.
3. **Build settings** (leave most empty — there is no build step):
   - **Build command:** leave blank (or `echo "static"` — not required).
   - **Publish directory:** choose **one** of these (both work; pick what matches your UI):

   | If Netlify shows… | Set publish directory to |
   |-------------------|---------------------------|
   | **Base directory** = *(empty)* | `invoice-backend/public` *(or rely on repo-root `netlify.toml` — it already sets this)* |
   | **Base directory** = `invoice-backend` | `public` *(matches `invoice-backend/netlify.toml`)* |

4. Click **Deploy site**. After the first deploy, open the site URL — you should see the Finance Console shell; the header may say **API offline** until you set the API base (next section).
5. **Branch deploys:** any push to the linked branch triggers a new deploy.

### B. `api-config.js` and your tunnel URL

Netlify serves whatever is in `public/` **from git**. Set your backend URL **before** you push, or commit a placeholder and replace on the next deploy:

1. Edit `invoice-backend/public/js/api-config.js` in your repo:
   ```js
   window.__INVOICE_API_BASE__ = 'https://YOUR-SUBDOMAIN.ngrok-free.app';
   ```
2. Commit and push → Netlify rebuilds.

If the repo is **public**, avoid committing a long-lived tunnel URL; use a private repo, or change the tunnel URL often.

### C. Manual deploy (no Git)

1. Run `npm start` locally only for testing; for Netlify you just need the **files**.
2. Zip the **contents** of `invoice-backend/public/` (so `index.html` is at the root of the zip), or drag the folder in **Sites → Deploy manually**.
3. Netlify → your site → **Deploys** → **Deploy manually** → upload.

You still need to edit `js/api-config.js` **inside** that folder before zipping, or unzip → edit → re-upload.

### D. Custom domain (optional)

**Domain settings** → add your domain → follow DNS instructions. HTTPS is automatic.

### E. Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| Blank page or 404 | Wrong publish directory — must resolve to the folder that contains `index.html`. |
| **API offline** | `__INVOICE_API_BASE__` empty, tunnel down, or wrong URL. Start `ngrok http 3001` and match the **https** URL. |
| CORS errors in browser console | Rare with this backend (`cors()` is open). Check you used **https** for both Netlify site and tunnel. |
| ngrok HTML warning instead of JSON | Usually mitigated by `ngrok-skip-browser-warning` header (already added when base URL contains `ngrok`). |

---

## Expose your local backend

Your laptop must expose **HTTPS** (recommended) so a public site can call it:

- **ngrok:** `ngrok http 3001` → copy the `https://….ngrok-free.app` URL (no trailing slash).
- **Cloudflare Tunnel**, **localtunnel**, etc. work the same idea.

Keep `npm start` (or `npm run dev`) running in `invoice-backend` on port **3001** (or whatever you use).

## `api-config.js` (all hosts)

Edit `invoice-backend/public/js/api-config.js`:

```js
window.__INVOICE_API_BASE__ = 'https://YOUR-SUBDOMAIN.ngrok-free.app';
```

Leave it `''` when you open the UI from the same machine as the server (`http://localhost:3001/`).

- **Do not commit** a real tunnel URL if the repo is public; use a private repo or rotate the tunnel.
- The app sends `ngrok-skip-browser-warning` when the base URL looks like ngrok, to reduce the interstitial on free tiers.

**Netlify config files in this repo**

- Repo root [`netlify.toml`](../../netlify.toml): `publish = "invoice-backend/public"` — use when **Base directory** in Netlify is empty.
- [`invoice-backend/netlify.toml`](../netlify.toml): `publish = "public"` — use when **Base directory** = `invoice-backend`.

## Other static hosts (quick reference)

| Host | Publish / output directory |
|------|------------------------------|
| **Vercel** | Root `invoice-backend`, output `public`, or output `invoice-backend/public` from repo root. |
| **Cloudflare Pages** | Build: none; output `invoice-backend/public`. |

## CORS

The backend uses `cors()` for all routes, so browser calls from your deployed origin to the tunnel URL are allowed.

## HTTPS

If the static site is **https** and your tunnel is **https**, you are fine. Plain `http://` for the API from an `https` page may be blocked (mixed content).

## Optional: inject base URL at build time (no secret in git)

Use a small Netlify build command or env substitution to rewrite `api-config.js` in CI. For personal use, editing `api-config.js` before each push is enough.
