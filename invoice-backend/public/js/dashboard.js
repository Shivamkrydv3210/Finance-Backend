/**
 * Finance Console — SPA shell + feature views (/api/*).
 * Optional remote API: set window.__INVOICE_API_BASE__ in js/api-config.js (see docs/FRONTEND_DEPLOY.md).
 */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function apiUrl(path) {
  return typeof window.__invoiceApiUrl === "function" ? window.__invoiceApiUrl(path) : path;
}

async function api(path, opts = {}) {
  const url = apiUrl(path);
  const isNgrok = /ngrok/i.test(String(window.__INVOICE_API_BASE__ || ""));
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (isNgrok && !headers["ngrok-skip-browser-warning"]) {
    headers["ngrok-skip-browser-warning"] = "1";
  }
  const res = await fetch(url, {
    headers,
    ...opts,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n, cur = "INR") {
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return `${cur} ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfMonth() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

const ROUTES = [
  { path: "/dashboard", label: "Overview", section: "Core" },
  { path: "/invoices", label: "Invoices", section: "Core" },
  { path: "/extract", label: "Extract URL", section: "Core" },
  { path: "/assistant", label: "AI Assistant", section: "Core" },
  { path: "/accounts", label: "Chart of accounts", section: "Ledger" },
  { path: "/journals", label: "Journals", section: "Ledger" },
  { path: "/reports", label: "Financial reports", section: "Ledger" },
  { path: "/bank", label: "Bank & reconciliation", section: "Operations" },
  { path: "/trace", label: "Money Trace", section: "Operations" },
  { path: "/close", label: "Month-end & attachments", section: "Operations" },
  { path: "/query", label: "Natural language query", section: "Analytics" },
  { path: "/ai-tax", label: "AI Tax Advisor", section: "AI Intelligence" },
  { path: "/ai-anomaly", label: "AI Audit Shield", section: "AI Intelligence" },
  { path: "/ai-narrator", label: "AI Report Insights", section: "AI Intelligence" },
  { path: "/ai-cashflow", label: "AI Cash Flow", section: "AI Intelligence" },
  { path: "/ai-vendor", label: "Vendor AI", section: "AI Intelligence" },
  { path: "/ai-compliance", label: "AI Compliance", section: "AI Intelligence" },
];

function getRoute() {
  let h = (location.hash || "#/dashboard").replace(/^#/, "") || "/dashboard";
  h = h.split("?")[0];
  if (!h.startsWith("/")) h = "/" + h;
  return h;
}

function getHashQuery() {
  const h = (location.hash || "").replace(/^#/, "");
  const q = h.split("?")[1];
  return q ? new URLSearchParams(q) : new URLSearchParams();
}

function setTitle(title) {
  $("#page-title").textContent = title;
}

function renderNav() {
  const cur = getRoute();
  const nav = $("#sidebar-nav");
  let section = "";
  nav.innerHTML = ROUTES.map((r) => {
    let html = "";
    if (r.section !== section) {
      section = r.section;
      html += `<div class="nav-section">${esc(section)}</div>`;
    }
    const active = cur === r.path ? " active" : "";
    html += `<a class="nav-link${active}" href="#${r.path}" data-path="${r.path}">${iconFor(r.path)} ${esc(r.label)}</a>`;
    return html;
  }).join("");
}

function iconFor(path) {
  const icons = {
    "/dashboard": svgHome(),
    "/invoices": svgDoc(),
    "/extract": svgLink(),
    "/assistant": svgChat(),
    "/accounts": svgGrid(),
    "/journals": svgBook(),
    "/reports": svgChart(),
    "/bank": svgBank(),
    "/trace": svgTrace(),
    "/close": svgCheck(),
    "/query": svgSearch(),
    "/ai-tax": svgShield(),
    "/ai-anomaly": svgAlert(),
    "/ai-narrator": svgStar(),
    "/ai-cashflow": svgTrend(),
    "/ai-vendor": svgUsers(),
    "/ai-compliance": svgClipboard(),
  };
  return icons[path] || "";
}

function svgHome() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
}
function svgDoc() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}
function svgLink() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}
function svgChat() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
}
function svgGrid() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
}
function svgBook() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
}
function svgChart() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
}
function svgBank() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
}
function svgTrace() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
}
function svgCheck() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
}
function svgSearch() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
}
function svgShield() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
}
function svgAlert() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
}
function svgStar() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
}
function svgTrend() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
}
function svgUsers() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
}
function svgClipboard() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
}

const contentEl = () => $("#main-content");

async function viewDashboard() {
  setTitle("Overview");
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div id="dash-msg"></div>
    <div class="grid-stats" id="dash-stats"></div>
    <div class="card"><div class="card-header"><h2>Quick actions</h2></div><div class="card-body">
      <a class="btn btn-primary" href="#/invoices">New invoice</a>
      <a class="btn btn-secondary" href="#/extract">Extract from URL</a>
      <a class="btn btn-secondary" href="#/reports">View reports</a>
      <a class="btn btn-secondary" href="#/trace">Money Trace</a>
    </div></div>`;
  contentEl().innerHTML = "";
  contentEl().appendChild(wrap);
  const msg = $("#dash-msg");
  const stats = $("#dash-stats");
  try {
    const s = await api("/api/stats");
    const byCat = s.by_category || {};
    const inr = s.inr_total != null ? fmtMoney(s.inr_total, "INR") : "—";
    const usd = s.usd_total ? ` · USD ${Number(s.usd_total).toLocaleString()}` : "";
    stats.innerHTML = `
      <div class="stat-card"><div class="label">Total invoices</div><div class="value">${esc(s.total_invoices ?? "—")}</div></div>
      <div class="stat-card"><div class="label">Totals (INR)</div><div class="value" style="font-size:1.05rem">${esc(inr)}${esc(usd)}</div></div>
      <div class="stat-card"><div class="label">Categories</div><div class="value" style="font-size:1rem">${esc(Object.keys(byCat).length)}</div></div>`;
  } catch (e) {
    msg.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    stats.innerHTML = `<div class="stat-card"><div class="label">Status</div><div class="value" style="font-size:1rem">API</div></div>`;
  }
}

async function viewInvoices() {
  setTitle("Invoices");
  contentEl().innerHTML = `<div id="inv-flash"></div>
    <div class="card"><div class="card-header"><h2>All invoices</h2><button type="button" class="btn btn-primary" id="btn-new-inv">New invoice</button></div>
    <div class="card-body"><div id="inv-table-wrap">Loading…</div></div></div>`;

  $("#btn-new-inv").onclick = () => openInvoiceModal();

  async function load() {
    try {
      const { invoices, total } = await api("/api/invoices?limit=100");
      const wrap = $("#inv-table-wrap");
      if (!invoices?.length) {
        wrap.innerHTML = '<div class="empty-state">No invoices yet. Create one or use Extract / Assistant.</div>';
        return;
      }
      wrap.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>
        <th>#</th><th>Vendor</th><th>Invoice #</th><th>Date</th><th>Category</th><th>Total</th><th>Ledger</th><th></th>
      </tr></thead><tbody>${invoices
        .map(
          (r) => `<tr>
          <td>${esc(r.invoice_id)}</td>
          <td>${esc(r.vendor_name)}</td>
          <td>${esc(r.invoice_number)}</td>
          <td>${esc(r.invoice_date)}</td>
          <td><span class="badge badge-muted">${esc(r.category)}</span></td>
          <td>${fmtMoney(r.total_amount, r.currency)}</td>
          <td>${r.journal_entry_id ? '<span class="badge badge-success">Posted</span>' : r.posting_error ? `<span class="badge badge-warn" title="${esc(r.posting_error)}">Error</span>` : '<span class="badge badge-muted">—</span>'}</td>
          <td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:0.35rem">
            <button type="button" class="btn btn-sm btn-secondary btn-trace-inv" data-id="${r.invoice_id}">Trace</button>
            <button type="button" class="btn btn-sm btn-secondary btn-post" data-id="${r.invoice_id}">Post ledger</button>
          </td>
        </tr>`
        )
        .join("")}</tbody></table></div><p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem">Showing ${invoices.length} of ${total}</p>`;
      $$(".btn-trace-inv").forEach((b) => {
        b.onclick = () => {
          location.hash = `#/trace?from=${encodeURIComponent(`invoice:${b.dataset.id}`)}`;
        };
      });
      $$(".btn-post").forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            await api(`/api/finance/invoices/${b.dataset.id}/post-ledger`, { method: "POST", body: "{}" });
            $("#inv-flash").innerHTML = '<div class="success-banner">Ledger post triggered.</div>';
            load();
          } catch (e) {
            $("#inv-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
            b.disabled = false;
          }
        };
      });
    } catch (e) {
      $("#inv-table-wrap").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }
  load();
}

function openInvoiceModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal" role="dialog">
    <div class="modal-header"><h3>New invoice</h3><button type="button" class="btn btn-ghost btn-sm" id="m-close">Close</button></div>
    <div class="modal-body">
      <div id="m-flash"></div>
      <form id="inv-form">
        <div class="form-row">
          <div><label class="field">Vendor</label><input name="vendor_name" required placeholder="Acme Ltd"/></div>
          <div><label class="field">Invoice #</label><input name="invoice_number" placeholder="auto if empty"/></div>
        </div>
        <div class="form-row">
          <div><label class="field">Date</label><input name="invoice_date" type="date" value="${todayISODate()}"/></div>
          <div><label class="field">Category</label>
            <select name="category"><option>fuel</option><option>maintenance</option><option>repair</option><option>parts</option><option>other</option></select>
          </div>
        </div>
        <div class="form-row">
          <div><label class="field">Total</label><input name="total_amount" type="number" step="0.01" required/></div>
          <div><label class="field">Tax</label><input name="tax_amount" type="number" step="0.01" value="0"/></div>
          <div><label class="field">Subtotal</label><input name="subtotal" type="number" step="0.01" placeholder="auto"/></div>
        </div>
        <div class="form-row">
          <div><label class="field">Currency</label><input name="currency" value="INR"/></div>
          <div><label class="field">Post to ledger</label><select name="post_to_ledger"><option value="true" selected>Yes</option><option value="false">No</option></select></div>
        </div>
        <div><label class="field">Notes</label><textarea name="notes" rows="2"></textarea></div>
        <div style="margin-top:1rem;display:flex;gap:0.5rem">
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  $("#m-close", backdrop).onclick = close;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  $("#inv-form", backdrop).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.total_amount = Number(body.total_amount);
    body.tax_amount = Number(body.tax_amount || 0);
    if (body.subtotal) body.subtotal = Number(body.subtotal);
    else delete body.subtotal;
    body.post_to_ledger = body.post_to_ledger === "true";
    try {
      const res = await api("/api/invoices", { method: "POST", body: JSON.stringify(body) });
      $("#m-flash", backdrop).innerHTML = `<div class="success-banner">Saved #${esc(res.invoice_number)} ${res.ledger_error ? "— " + esc(res.ledger_error) : ""}</div>`;
      setTimeout(() => {
        close();
        navigate("/invoices");
      }, 900);
    } catch (err) {
      $("#m-flash", backdrop).innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
    }
  };
}

async function viewExtract() {
  setTitle("Extract from URL");
  contentEl().innerHTML = `<div class="card"><div class="card-header"><h2>Vision extract</h2></div><div class="card-body">
    <p style="color:var(--text-muted);margin-top:0">Paste a public image URL, then preview JSON and save to invoices.</p>
    <div class="form-row"><div style="grid-column:1/-1"><label class="field">Image URL</label><input type="url" id="ex-url" placeholder="https://..."/></div></div>
    <button type="button" class="btn btn-primary" id="ex-run">Extract</button>
    <div id="ex-out" style="margin-top:1rem"></div>
  </div></div>`;
  $("#ex-run").onclick = async () => {
    const url = $("#ex-url").value.trim();
    const out = $("#ex-out");
    if (!url) {
      out.innerHTML = '<div class="error-banner">URL required</div>';
      return;
    }
    out.innerHTML = "<p>Extracting…</p>";
    try {
      const data = await api("/api/extract", { method: "POST", body: JSON.stringify({ url }) });
      out.innerHTML = `<div class="card" style="margin-top:1rem"><div class="card-header"><h2>Preview</h2>
        <button type="button" class="btn btn-primary btn-sm" id="ex-save">Save invoice</button></div>
        <div class="card-body"><pre class="json-preview">${esc(JSON.stringify(data.extracted, null, 2))}</pre></div></div>`;
      $("#ex-save").onclick = async () => {
        try {
          const res = await api("/api/invoices", {
            method: "POST",
            body: JSON.stringify({ extracted: data.extracted, post_to_ledger: true }),
          });
          out.innerHTML += `<div class="success-banner" style="margin-top:1rem">Saved: ${esc(JSON.stringify(res))}</div>`;
        } catch (e) {
          out.innerHTML += `<div class="error-banner">${esc(e.message)}</div>`;
        }
      };
    } catch (e) {
      out.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

function viewAssistant() {
  setTitle("AI Assistant");
  const host = document.createElement("div");
  host.innerHTML = `<div class="card"><div class="card-header"><h2>Chat</h2><span class="topbar-meta">Uses OpenAI + tools (extract, save, query, stats)</span></div>
    <div class="card-body" style="padding:0">
      <div class="chat-panel">
        <div class="chat-messages" id="chat-msgs"></div>
        <div class="chat-input-row">
          <input type="text" id="chat-txt" placeholder="Ask about invoices or paste an image URL…" style="flex:1"/>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">File<input type="file" id="chat-file" accept="image/*" hidden/></label>
          <button type="button" class="btn btn-primary" id="chat-send">Send</button>
        </div>
      </div>
    </div></div>`;
  contentEl().innerHTML = "";
  contentEl().appendChild(host);

  const msgs = $("#chat-msgs");
  let pendingImg = null;

  function addMsg(role, text) {
    const d = document.createElement("div");
    d.className = `chat-msg ${role}`;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  $("#chat-file").onchange = () => {
    const f = $("#chat-file").files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      pendingImg = r.result;
      addMsg("user", "[Image attached]");
    };
    r.readAsDataURL(f);
    $("#chat-file").value = "";
  };

  async function send() {
    const text = $("#chat-txt").value.trim();
    const img = pendingImg;
    if (!text && !img) return;
    $("#chat-txt").value = "";
    if (!img) addMsg("user", text);
    pendingImg = null;
    const body = { message: text || "Extract this invoice" };
    if (img) body.image_data_url = img;
    addMsg("assistant", "…");
    const last = msgs.lastElementChild;
    try {
      const data = await api("/api/chat", { method: "POST", body: JSON.stringify(body) });
      last.textContent = data.reply || "(empty)";
    } catch (e) {
      last.textContent = "Error: " + e.message;
    }
    msgs.scrollTop = msgs.scrollHeight;
  }
  $("#chat-send").onclick = send;
  $("#chat-txt").onkeydown = (e) => {
    if (e.key === "Enter") send();
  };
}

async function viewAccounts() {
  setTitle("Chart of accounts");
  contentEl().innerHTML = '<div id="coa-wrap">Loading…</div>';
  try {
    const { accounts } = await api("/api/finance/accounts");
    $("#coa-wrap").innerHTML = `<div class="card"><div class="card-body"><div class="table-wrap"><table class="data"><thead><tr>
      <th>Code</th><th>Name</th><th>Type</th><th>Tax scheme</th>
    </tr></thead><tbody>${accounts
      .map(
        (a) => `<tr><td><strong>${esc(a.code)}</strong></td><td>${esc(a.name)}</td><td><span class="badge badge-muted">${esc(a.account_type)}</span></td><td>${esc(a.default_tax_scheme || "—")}</td></tr>`
      )
      .join("")}</tbody></table></div></div></div>`;
  } catch (e) {
    $("#coa-wrap").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

async function viewJournals() {
  setTitle("Journal entries");
  contentEl().innerHTML = `<div id="je-flash"></div>
    <div class="card"><div class="card-header"><h2>Posted journals</h2></div><div class="card-body" id="je-list">Loading…</div></div>
    <div class="card"><div class="card-header"><h2>Manual journal</h2></div><div class="card-body">
      <form id="je-form">
        <div class="form-row"><div><label class="field">Entry date</label><input name="entry_date" type="date" value="${todayISODate()}"/></div>
        <div style="grid-column:1/-1"><label class="field">Description</label><input name="description" placeholder="Optional"/></div></div>
        <p style="color:var(--text-muted);font-size:0.8rem">At least two lines; debits must equal credits. Use account codes from Chart of accounts.</p>
        <div id="je-lines"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="je-add-line" style="margin:0.5rem 0">+ Line</button>
        <div><button type="submit" class="btn btn-primary">Post journal</button></div>
      </form>
    </div></div>`;

  const linesBox = $("#je-lines");
  function addLine(code = "", d = "", c = "") {
    const row = document.createElement("div");
    row.className = "form-row";
    row.style.alignItems = "end";
    row.innerHTML = `<div><label class="field">Account code</label><input class="jl-code" value="${esc(code)}" placeholder="5100"/></div>
      <div><label class="field">Debit</label><input class="jl-d" type="number" step="0.01" value="${esc(d)}"/></div>
      <div><label class="field">Credit</label><input class="jl-c" type="number" step="0.01" value="${esc(c)}"/></div>
      <div><label class="field">Line note</label><input class="jl-desc" placeholder="optional"/></div>`;
    linesBox.appendChild(row);
  }
  addLine("5100", "100", "");
  addLine("2000", "", "100");
  $("#je-add-line").onclick = () => addLine();

  $("#je-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const entry_date = fd.get("entry_date");
    const description = fd.get("description");
    const lines = [];
    let i = 1;
    for (const row of $$(".form-row", linesBox)) {
      const code = $(".jl-code", row)?.value?.trim();
      const debit = Number($(".jl-d", row)?.value || 0);
      const credit = Number($(".jl-c", row)?.value || 0);
      const desc = $(".jl-desc", row)?.value;
      if (!code && !debit && !credit) continue;
      lines.push({ line_no: i++, account_code: code, debit, credit, description: desc || undefined });
    }
    try {
      await api("/api/finance/journals", {
        method: "POST",
        body: JSON.stringify({ entry_date, description, lines, auto_approve: true }),
      });
      $("#je-flash").innerHTML = '<div class="success-banner">Journal posted.</div>';
      loadJe();
    } catch (err) {
      $("#je-flash").innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
    }
  };

  async function loadJe() {
    try {
      const { entries } = await api("/api/finance/journals?limit=50");
      const el = $("#je-list");
      if (!entries?.length) {
        el.innerHTML = '<div class="empty-state">No posted journals.</div>';
        return;
      }
      el.innerHTML = entries
        .map(
          (j) => `<div style="border-bottom:1px solid var(--border);padding:0.75rem 0">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
            <span><strong>${esc(j.entry_date)}</strong> · ${esc(j.description || "—")} · <span class="badge badge-muted">${esc(j.source_type)}</span> · JE #${j.journal_entry_id}</span>
            <button type="button" class="btn btn-sm btn-secondary btn-trace-je" data-id="${j.journal_entry_id}">Money Trace</button>
          </div>
          <pre class="json-preview" style="margin-top:0.5rem;max-height:120px">${esc(JSON.stringify(j.journal_lines || [], null, 2))}</pre>
        </div>`
        )
        .join("");
      $$(".btn-trace-je").forEach((b) => {
        b.onclick = () => {
          location.hash = `#/trace?from=${encodeURIComponent(`je:${b.dataset.id}`)}`;
        };
      });
    } catch (e) {
      $("#je-list").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }
  loadJe();
}

async function viewReports() {
  setTitle("Financial reports");
  contentEl().innerHTML = `<div class="card"><div class="card-body">
    <div class="tabs" id="rep-tabs">
      <button type="button" class="tab active" data-tab="tb">Trial balance</button>
      <button type="button" class="tab" data-tab="pl">P &amp; L</button>
      <button type="button" class="tab" data-tab="bs">Balance sheet</button>
      <button type="button" class="tab" data-tab="tax">Tax register</button>
      <button type="button" class="tab" data-tab="pack">Export pack</button>
    </div>
    <div class="form-row" style="max-width:480px">
      <div><label class="field">From</label><input type="date" id="rep-from" value="${firstOfMonth()}"/></div>
      <div><label class="field">To</label><input type="date" id="rep-to" value="${lastOfMonth()}"/></div>
      <div><label class="field">As of (BS)</label><input type="date" id="rep-asof" value="${todayISODate()}"/></div>
    </div>
    <button type="button" class="btn btn-primary" id="rep-run">Run report</button>
    <div id="rep-out" style="margin-top:1.25rem"></div>
  </div></div>`;

  let active = "tb";
  $$(".tab").forEach((t) => {
    t.onclick = () => {
      $$(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      active = t.dataset.tab;
    };
  });

  $("#rep-run").onclick = async () => {
    const from = $("#rep-from").value;
    const to = $("#rep-to").value;
    const asof = $("#rep-asof").value;
    const out = $("#rep-out");
    out.innerHTML = "<p>Loading…</p>";
    try {
      let data;
      if (active === "tb") {
        data = await api(`/api/finance/reports/trial-balance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        const rows = data.rows || [];
        out.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Debit</th><th>Credit</th><th>Net</th></tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.account_type)}</td><td>${esc(r.debit)}</td><td>${esc(r.credit)}</td><td>${esc(r.net_debit_balance)}</td></tr>`
          )
          .join("")}</tbody></table></div>`;
      } else if (active === "pl") {
        data = await api(`/api/finance/reports/pl?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        out.innerHTML = `<div class="grid-stats" style="margin-bottom:1rem">
          <div class="stat-card"><div class="label">Revenue</div><div class="value" style="font-size:1.2rem">${fmtMoney(data.revenue_total)}</div></div>
          <div class="stat-card"><div class="label">Expense</div><div class="value" style="font-size:1.2rem">${fmtMoney(data.expense_total)}</div></div>
          <div class="stat-card"><div class="label">Net income</div><div class="value" style="font-size:1.2rem">${fmtMoney(data.net_income)}</div></div>
        </div>
        <pre class="json-preview">${esc(JSON.stringify(data.lines, null, 2))}</pre>`;
      } else if (active === "bs") {
        data = await api(`/api/finance/reports/balance-sheet?as_of=${encodeURIComponent(asof)}`);
        out.innerHTML = `<pre class="json-preview">${esc(JSON.stringify(data, null, 2))}</pre>`;
      } else if (active === "tax") {
        data = await api(`/api/finance/reports/tax-register?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        const rows = data.rows || [];
        out.innerHTML =
          rows.length === 0
            ? "<p class=\"empty-state\">No tax-tagged lines in range.</p>"
            : `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Account</th><th>Scheme</th><th>Tax amt</th><th>Desc</th></tr></thead><tbody>${rows
                .map(
                  (r) =>
                    `<tr><td>${esc(r.entry_date)}</td><td>${esc(r.account_code)}</td><td>${esc(r.tax_scheme)}</td><td>${esc(r.tax_amount)}</td><td>${esc(r.description)}</td></tr>`
                )
                .join("")}</tbody></table></div>`;
      } else {
        data = await api(`/api/finance/reports/export-pack?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        out.innerHTML = `<pre class="json-preview">${esc(JSON.stringify(data, null, 2))}</pre>`;
      }
    } catch (e) {
      out.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

let bankAccountsCache = [];

async function viewBank() {
  setTitle("Bank & reconciliation");
  contentEl().innerHTML = `<div id="bk-flash"></div>
    <div class="card"><div class="card-header"><h2>Bank accounts</h2><button type="button" class="btn btn-primary btn-sm" id="bk-new">Add account</button></div>
    <div class="card-body" id="bk-accts">Loading…</div></div>
    <div class="card"><div class="card-header"><h2>Import CSV</h2></div><div class="card-body">
      <div class="form-row"><div><label class="field">Bank account</label><select id="bk-sel"></select></div></div>
      <label class="field">CSV (header: date,amount,description)</label>
      <textarea id="bk-csv" placeholder="date,amount,description&#10;2025-04-01,-5000,Vendor payment"></textarea>
      <button type="button" class="btn btn-primary" id="bk-import" style="margin-top:0.75rem">Import</button>
    </div></div>
    <div class="card"><div class="card-header"><h2>Recent transactions</h2></div><div class="card-body" id="bk-tx">Select account and refresh.</div></div>`;

  async function loadAccts() {
    try {
      const { accounts } = await api("/api/bank/accounts");
      bankAccountsCache = accounts || [];
      const sel = $("#bk-sel");
      sel.innerHTML = (accounts || [])
        .map((a) => `<option value="${a.bank_account_id}">${esc(a.name)} (${a.bank_account_id})</option>`)
        .join("");
      $("#bk-accts").innerHTML =
        accounts?.length > 0
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>ID</th><th>Name</th><th>GL</th><th>Currency</th><th>Actions</th></tr></thead><tbody>${accounts
              .map(
                (a) =>
                  `<tr><td>${a.bank_account_id}</td><td>${esc(a.name)}</td><td>${esc(a.gl_account?.code || "—")}</td><td>${esc(a.currency_code)}</td>
                <td><button type="button" class="btn btn-sm btn-secondary bk-load-tx" data-id="${a.bank_account_id}">Load txns</button></td></tr>`
              )
              .join("")}</tbody></table></div>`
          : '<div class="empty-state">No bank accounts. Click Add account.</div>';
      $$(".bk-load-tx").forEach((b) => {
        b.onclick = () => loadTx(b.dataset.id);
      });
    } catch (e) {
      $("#bk-accts").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }

  async function loadTx(id) {
    const idUse = id || $("#bk-sel").value;
    $("#bk-tx").innerHTML = "Loading…";
    try {
      const { transactions } = await api(`/api/bank/accounts/${idUse}/transactions?limit=50`);
      if (!transactions?.length) {
        $("#bk-tx").innerHTML = "<p class=\"empty-state\">No transactions.</p>";
        return;
      }
      $("#bk-tx").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Amount</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody>${transactions
        .map(
          (t) =>
            `<tr><td>${esc(t.txn_date)}</td><td>${esc(t.amount)}</td><td>${esc(t.description)}</td><td>${esc(t.reconciliation_status)}</td>
            <td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:0.35rem">
              <button type="button" class="btn btn-sm btn-secondary bk-trace" data-tid="${t.bank_txn_id}">Trace</button>
              <button type="button" class="btn btn-sm btn-secondary bk-sug" data-tid="${t.bank_txn_id}">Suggest</button>
            </td></tr>`
        )
        .join("")}</tbody></table></div><div id="bk-sug-out" style="margin-top:1rem"></div>`;
      $$(".bk-trace").forEach((b) => {
        b.onclick = () => {
          location.hash = `#/trace?from=${encodeURIComponent(`bank_txn:${b.dataset.tid}`)}`;
        };
      });
      $$(".bk-sug").forEach((b) => {
        b.onclick = async () => {
          try {
            const s = await api(`/api/bank/transactions/${b.dataset.tid}/suggestions`);
            const box = $("#bk-sug-out");
            box.innerHTML = `<h4 style="margin:0 0 0.5rem">Suggestions for txn ${esc(b.dataset.tid)}</h4><pre class="json-preview">${esc(JSON.stringify(s, null, 2))}</pre>`;
          } catch (e) {
            $("#bk-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
          }
        };
      });
    } catch (e) {
      $("#bk-tx").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }

  $("#bk-new").onclick = () => {
    const name = prompt("Bank account name?");
    if (!name) return;
    api("/api/bank/accounts", { method: "POST", body: JSON.stringify({ name, gl_account_code: "1100" }) })
      .then(() => {
        $("#bk-flash").innerHTML = '<div class="success-banner">Created.</div>';
        loadAccts();
      })
      .catch((e) => {
        $("#bk-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
      });
  };

  $("#bk-import").onclick = async () => {
    const id = $("#bk-sel").value;
    const csv = $("#bk-csv").value.trim();
    if (!id || !csv) {
      $("#bk-flash").innerHTML = '<div class="error-banner">Select account and paste CSV.</div>';
      return;
    }
    try {
      await api(`/api/bank/accounts/${id}/import`, {
        method: "POST",
        body: JSON.stringify({ csv, filename: "paste.csv" }),
      });
      $("#bk-flash").innerHTML = '<div class="success-banner">Imported.</div>';
      loadTx(id);
    } catch (e) {
      $("#bk-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };

  await loadAccts();
  if ($("#bk-sel")?.value) loadTx();
}

async function viewClose() {
  setTitle("Month-end & attachments");
  contentEl().innerHTML = `<div id="cl-flash"></div>
    <div class="card"><div class="card-header"><h2>Fiscal period</h2></div><div class="card-body">
      <div class="form-row">
        <div><label class="field">Period</label><select id="cl-per"></select></div>
        <div><label class="field">Set status</label>
          <select id="cl-status"><option value="open">open</option><option value="soft_closed">soft_closed</option><option value="locked">locked</option></select>
        </div>
      </div>
      <button type="button" class="btn btn-secondary" id="cl-ensure">Seed checklist</button>
      <button type="button" class="btn btn-primary" id="cl-load">Load tasks</button>
      <button type="button" class="btn btn-secondary" id="cl-setstat">Update period status</button>
    </div></div>
    <div class="card"><div class="card-header"><h2>Checklist</h2></div><div class="card-body" id="cl-tasks">—</div></div>
    <div class="card"><div class="card-header"><h2>Attachment (metadata)</h2></div><div class="card-body">
      <div class="form-row">
        <div><label class="field">Entity type</label><input id="at-etype" value="invoice_header"/></div>
        <div><label class="field">Entity id</label><input id="at-eid" placeholder="1"/></div>
      </div>
      <div><label class="field">Public URL</label><input id="at-url" placeholder="https://..."/></div>
      <div><label class="field">File name</label><input id="at-fn" placeholder="invoice.pdf"/></div>
      <button type="button" class="btn btn-primary" id="at-save" style="margin-top:0.75rem">Save attachment row</button>
      <button type="button" class="btn btn-secondary" id="at-list" style="margin-top:0.75rem">List attachments</button>
      <div id="at-out" style="margin-top:1rem"></div>
    </div></div>`;

  try {
    const { periods } = await api("/api/finance/periods");
    $("#cl-per").innerHTML = (periods || [])
      .map((p) => `<option value="${p.period_id}">${p.period_year}-${String(p.period_month).padStart(2, "0")} (${esc(p.status)})</option>`)
      .join("");
  } catch (e) {
    $("#cl-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }

  $("#cl-ensure").onclick = async () => {
    const pid = $("#cl-per").value;
    try {
      await api(`/api/close/periods/${pid}/tasks/ensure`, { method: "POST", body: "{}" });
      $("#cl-flash").innerHTML = '<div class="success-banner">Checklist ensured.</div>';
    } catch (e) {
      $("#cl-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };

  $("#cl-setstat").onclick = async () => {
    const pid = $("#cl-per").value;
    const status = $("#cl-status").value;
    try {
      await api(`/api/finance/periods/${pid}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      $("#cl-flash").innerHTML = '<div class="success-banner">Period status updated.</div>';
    } catch (e) {
      $("#cl-flash").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };

  $("#cl-load").onclick = async () => {
    const pid = $("#cl-per").value;
    try {
      const { tasks } = await api(`/api/close/periods/${pid}/tasks`);
      $("#cl-tasks").innerHTML =
        tasks?.map(
          (t) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <span>${esc(t.title)} ${t.is_done ? '<span class="badge badge-success">Done</span>' : ""}</span>
          <button type="button" class="btn btn-sm btn-secondary cl-toggle" data-id="${t.task_id}" data-done="${t.is_done}">${t.is_done ? "Reopen" : "Mark done"}</button>
        </div>`
        ).join("") || '<div class="empty-state">No tasks — run Seed checklist.</div>';
      $$(".cl-toggle").forEach((b) => {
        b.onclick = async () => {
          const done = b.dataset.done === "true";
          await api(`/api/close/tasks/${b.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify({ is_done: !done, actor: "ui" }),
          });
          $("#cl-load").click();
        };
      });
    } catch (e) {
      $("#cl-tasks").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };

  $("#at-save").onclick = async () => {
    try {
      await api("/api/close/attachments", {
        method: "POST",
        body: JSON.stringify({
          entity_type: $("#at-etype").value,
          entity_id: $("#at-eid").value,
          public_url: $("#at-url").value,
          file_name: $("#at-fn").value,
        }),
      });
      $("#at-out").innerHTML = '<div class="success-banner">Saved.</div>';
    } catch (e) {
      $("#at-out").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };

  $("#at-list").onclick = async () => {
    const et = $("#at-etype").value;
    const ei = $("#at-eid").value;
    try {
      const { attachments } = await api(`/api/close/attachments?entity_type=${encodeURIComponent(et)}&entity_id=${encodeURIComponent(ei)}`);
      $("#at-out").innerHTML = `<pre class="json-preview">${esc(JSON.stringify(attachments, null, 2))}</pre>`;
    } catch (e) {
      $("#at-out").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

function renderMoneyTraceChain(data) {
  const gaps = (data.gaps || []).map((g) => `<span class="badge badge-warn">${esc(g)}</span>`).join(" ");
  let steps = `<div class="trace-steps">`;

  steps += `<div class="trace-step"><h4>Documents</h4>`;
  const atts = data.document_attachments || [];
  if (atts.length) {
    steps += `<ul class="trace-attach-list">${atts
      .map((a) => {
        const href = a.public_url || "#";
        const safe = href !== "#" ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : "";
        return `<li><a ${safe}>${esc(a.file_name || "Attachment")}</a></li>`;
      })
      .join("")}</ul>`;
  } else {
    steps += `<p class="trace-muted">No rows in document_attachments for this invoice.</p>`;
  }
  steps += `</div>`;

  steps += `<div class="trace-step"><h4>Invoice</h4>`;
  if (data.invoice) {
    const inv = data.invoice;
    steps += `<p><strong>#${esc(inv.invoice_id)}</strong> ${esc(inv.vendor_name)} · ${esc(inv.invoice_number)} · ${fmtMoney(inv.total_amount, inv.currency)} · ${esc(
      inv.invoice_date
    )}</p>`;
    if (data.posting_error) steps += `<p class="trace-warn">${esc(data.posting_error)}</p>`;
  } else {
    steps += `<p class="trace-muted">No invoice in this chain.</p>`;
  }
  steps += `</div>`;

  steps += `<div class="trace-step"><h4>Journal entry</h4>`;
  if (data.journal_entry) {
    const je = data.journal_entry;
    steps += `<p><strong>JE ${je.journal_entry_id}</strong> · ${esc(je.entry_date)} · ${esc(je.description || "—")} · <span class="badge badge-muted">${esc(je.status)}</span> · ${esc(
      je.source_type
    )}</p>`;
    const lines = data.journal_lines || [];
    steps += `<div class="table-wrap"><table class="data trace-lines"><thead><tr><th>#</th><th>Acct</th><th>Debit</th><th>Credit</th><th>Description</th></tr></thead><tbody>`;
    for (const ln of lines) {
      const hl =
        data.highlighted_journal_line_id && Number(ln.journal_line_id) === Number(data.highlighted_journal_line_id) ? ' class="trace-line-highlight"' : "";
      steps += `<tr${hl}><td>${ln.line_no}</td><td>${esc(ln.account?.code)} ${esc(ln.account?.name || "")}</td><td>${esc(ln.debit)}</td><td>${esc(ln.credit)}</td><td>${esc(ln.description || "—")}</td></tr>`;
    }
    steps += `</tbody></table></div>`;
  } else {
    steps += `<p class="trace-muted">No journal entry resolved.</p>`;
  }
  steps += `</div>`;

  steps += `<div class="trace-step"><h4>Bank reconciliation</h4>`;
  const linked = data.bank?.linked?.length ? data.bank.linked : data.bank?.reconciliation_match ? [{ reconciliation_match: data.bank.reconciliation_match, transaction: data.bank.transaction, bank_account: data.bank.bank_account }] : [];
  if (linked.length) {
    for (const row of linked) {
      const t = row.transaction;
      if (t) {
        steps += `<p><strong>Txn ${t.bank_txn_id}</strong> · ${esc(t.txn_date)} · ${fmtMoney(t.amount)} · ${esc(t.description || "—")} · <span class="badge badge-muted">${esc(
          t.reconciliation_status
        )}</span></p>`;
      }
      if (row.bank_account) steps += `<p class="trace-muted" style="font-size:0.8rem">Bank: ${esc(row.bank_account.name)} (GL ${esc(row.bank_account.gl_account?.code || "—")})</p>`;
    }
  } else {
    steps += `<p class="trace-muted">No reconciliation_matches for this journal.</p>`;
  }
  steps += `</div></div>`;

  return `<div class="card trace-chain-card"><div class="card-header"><h2>Proof chain</h2>${gaps ? `<div class="trace-gaps">${gaps}</div>` : ""}</div><div class="card-body">${steps}</div></div>`;
}

async function viewTrace() {
  setTitle("Money Trace");
  const qs = getHashQuery();
  const preset = qs.get("from") || "";
  contentEl().innerHTML = `<div class="card"><div class="card-body">
    <p style="color:var(--text-muted);margin-top:0">Follow one rupee from supporting documents through the invoice, posted journal lines, and bank match. <strong>Gaps</strong> (missing attachment, not posted, not reconciled) are explicit.</p>
    <div class="form-row">
      <div style="grid-column:1/-1"><label class="field">Anchor (<code>from=</code>)</label>
        <input id="tr-from" placeholder="invoice:123 · je:45 · journal_line:9 · bank_txn:1 · account:5100" value="${esc(preset)}"/></div>
      <div><label class="field">Period from (for account:CODE)</label><input type="date" id="tr-pfrom" value="${firstOfMonth()}"/></div>
      <div><label class="field">Period to (for account:CODE)</label><input type="date" id="tr-pto" value="${lastOfMonth()}"/></div>
    </div>
    <button type="button" class="btn btn-primary" id="tr-run">Run trace</button>
    <div id="tr-out" style="margin-top:1.25rem"></div>
  </div></div>`;

  async function run() {
    const from = $("#tr-from").value.trim();
    const out = $("#tr-out");
    if (!from) {
      out.innerHTML = '<div class="error-banner">Enter an anchor, e.g. invoice:1</div>';
      return;
    }
    out.innerHTML = "<p>Tracing…</p>";
    try {
      let url = `/api/trace?from=${encodeURIComponent(from)}`;
      if (/^account\s*:/i.test(from)) {
        url += `&from_date=${encodeURIComponent($("#tr-pfrom").value)}&to_date=${encodeURIComponent($("#tr-pto").value)}`;
      }
      const data = await api(url);
      if (data.mode === "account_browse") {
        let html = `<div class="card"><div class="card-header"><h2>Account browse</h2><span class="badge badge-muted">${esc(data.account?.code)} ${esc(data.account?.name || "")}</span></div>
          <div class="card-body"><p style="margin:0;color:var(--text-muted)">${data.trace_count || 0} journal(s) with lines on this account in ${esc(data.period?.from)} – ${esc(
          data.period?.to
        )}.</p></div></div>`;
        for (const t of data.traces || []) {
          html += renderMoneyTraceChain(t);
        }
        if (!(data.traces || []).length && data.message) html += `<p class="empty-state">${esc(data.message)}</p>`;
        out.innerHTML = html;
        return;
      }
      out.innerHTML = renderMoneyTraceChain(data);
    } catch (e) {
      out.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }

  $("#tr-run").onclick = run;
  if (preset) await run();
}

async function viewQuery() {
  setTitle("Natural language query");
  contentEl().innerHTML = `<div class="card"><div class="card-body">
    <p style="color:var(--text-muted);margin-top:0">Ask in plain English. Results are read-only SELECTs on allowlisted tables.</p>
    <textarea id="nl-q" placeholder="e.g. List last 10 fuel invoices by total amount" style="min-height:80px"></textarea>
    <button type="button" class="btn btn-primary" id="nl-run" style="margin-top:0.75rem">Run query</button>
    <div id="nl-out" style="margin-top:1rem"></div>
  </div></div>`;
  $("#nl-run").onclick = async () => {
    const q = $("#nl-q").value.trim();
    if (!q) return;
    $("#nl-out").innerHTML = "<p>Running…</p>";
    try {
      const data = await api("/api/query", { method: "POST", body: JSON.stringify({ question: q }) });
      const rows = data.data || [];
      const tableHtml =
        rows.length === 0
          ? '<p class="empty-state">No rows returned.</p>'
          : `<div class="table-wrap"><table class="data"><thead><tr>${Object.keys(rows[0])
              .map((k) => `<th>${esc(k)}</th>`)
              .join("")}</tr></thead><tbody>${rows
              .map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td>`).join("")}</tr>`)
              .join("")}</tbody></table></div>`;
      $("#nl-out").innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted)">Rows: ${data.count} · SQL (review only):</p>
        <pre class="json-preview" style="max-height:80px">${esc(data.sql_used || "")}</pre>
        <div style="margin-top:0.75rem">${tableHtml}</div>`;
    } catch (e) {
      $("#nl-out").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   AI Intelligence views
   ═══════════════════════════════════════════════════════════════════ */

function severityBadge(sev) {
  const map = { critical: "badge-danger", high: "badge-danger", warning: "badge-warn", medium: "badge-warn", low: "badge-muted", info: "badge-muted", ok: "badge-success" };
  return `<span class="badge ${map[sev] || "badge-muted"}">${esc(sev)}</span>`;
}

function priorityBadge(p) {
  const map = { high: "badge-danger", immediate: "badge-danger", medium: "badge-warn", soon: "badge-warn", low: "badge-muted", can_wait: "badge-muted" };
  return `<span class="badge ${map[p] || "badge-muted"}">${esc(p)}</span>`;
}

function aiLoadingCard(title) {
  return `<div class="card"><div class="card-body" style="text-align:center;padding:3rem 1rem">
    <div class="ai-spinner"></div>
    <p style="color:var(--text-muted);margin-top:1rem">AI is analyzing your data for <strong>${esc(title)}</strong>…<br><span style="font-size:0.8rem">This may take 10-30 seconds.</span></p>
  </div></div>`;
}

async function viewAiTax() {
  setTitle("AI Tax Advisor");
  contentEl().innerHTML = aiLoadingCard("tax optimization opportunities");
  try {
    const data = await api("/api/ai/tax-optimization");
    let html = `<div class="grid-stats">
      <div class="stat-card"><div class="label">Suggestions</div><div class="value">${data.suggestion_count || 0}</div></div>
      <div class="stat-card"><div class="label">Potential savings</div><div class="value" style="font-size:1.1rem;color:var(--success)">${fmtMoney(data.total_potential_savings_inr)}</div></div>
      <div class="stat-card"><div class="label">Invoices analyzed</div><div class="value">${data.data_summary?.total_invoices || 0}</div></div>
      <div class="stat-card"><div class="label">Effective tax rate</div><div class="value">${data.data_summary?.effective_tax_rate_pct || 0}%</div></div>
    </div>`;
    const sugs = data.suggestions || [];
    if (sugs.length === 0) {
      html += '<div class="card"><div class="card-body"><div class="empty-state">No optimization opportunities found. Your tax position looks clean.</div></div></div>';
    }
    for (const s of sugs) {
      html += `<div class="card ai-suggestion-card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
            ${priorityBadge(s.priority)}
            <span class="badge badge-muted">${esc(s.category)}</span>
            <strong>${esc(s.title)}</strong>
          </div>
          ${s.estimated_savings_inr ? `<span style="color:var(--success);font-weight:600">Save ${fmtMoney(s.estimated_savings_inr)}</span>` : ""}
        </div>
        <div class="card-body">
          <p>${esc(s.description)}</p>
          ${s.affected_invoices ? `<p style="font-size:0.8rem;color:var(--text-muted)">Affected invoices: ${s.affected_invoices}</p>` : ""}
          ${(s.action_items || []).length > 0 ? `<div class="ai-action-list"><strong>Action items:</strong><ul>${s.action_items.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>`;
    }
    html += `<p style="font-size:0.75rem;color:var(--text-muted)">Generated at ${data.generated_at} · Period: ${esc(data.data_summary?.period)}</p>`;
    contentEl().innerHTML = html;
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

async function viewAiAnomaly() {
  setTitle("AI Audit Shield");
  contentEl().innerHTML = aiLoadingCard("anomalies and fraud patterns");
  try {
    const data = await api("/api/ai/anomalies");
    const status = data.status || "clean";
    const statusColors = { clean: "var(--success)", minor_issues: "var(--text-muted)", attention_needed: "var(--warning)", critical: "var(--danger)" };
    let html = `<div class="card"><div class="card-body" style="display:flex;align-items:center;gap:1rem">
      <div style="width:12px;height:12px;border-radius:50%;background:${statusColors[status] || "var(--text-muted)"}"></div>
      <div><strong style="font-size:1.1rem">${esc(data.summary)}</strong></div>
    </div></div>`;

    const findings = data.findings || [];
    const aiNotes = data.ai_analysis || [];
    const aiMap = {};
    for (const n of aiNotes) aiMap[n.finding_type] = n;

    for (const f of findings) {
      const ai = aiMap[f.type];
      html += `<div class="card">
        <div class="card-header">
          ${severityBadge(f.severity)}
          <strong style="flex:1;margin-left:0.5rem">${esc(f.title)}</strong>
          <span class="badge badge-muted">${f.count || 0} item(s)</span>
        </div>
        <div class="card-body">
          ${ai ? `<div class="ai-insight-box">
            <p><strong>Risk:</strong> ${esc(ai.explanation || "")}</p>
            <p><strong>Action:</strong> ${esc(ai.recommendation || "")}</p>
          </div>` : ""}
          ${f.type === "benfords_law_deviation" && f.digit_distribution ? `<div class="ai-benford-table"><table class="data"><thead><tr><th>Digit</th>${Object.keys(f.digit_distribution).map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>
            <tr><td>Observed %</td>${Object.values(f.digit_distribution).map(v => `<td>${v.observed_pct}</td>`).join("")}</tr>
            <tr><td>Expected %</td>${Object.values(f.digit_distribution).map(v => `<td>${v.expected_pct}</td>`).join("")}</tr>
          </tbody></table></div>` : ""}
          ${(f.items || []).length > 0 ? `<details style="margin-top:0.75rem"><summary style="cursor:pointer;color:var(--accent);font-size:0.85rem">View details (${(f.items || []).length} items)</summary>
            <pre class="json-preview" style="margin-top:0.5rem;max-height:200px">${esc(JSON.stringify(f.items, null, 2))}</pre>
          </details>` : ""}
        </div>
      </div>`;
    }
    html += `<p style="font-size:0.75rem;color:var(--text-muted)">Scan completed at ${data.generated_at}</p>`;
    contentEl().innerHTML = html;
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

async function viewAiNarrator() {
  setTitle("AI Report Insights");
  contentEl().innerHTML = `<div class="card"><div class="card-body">
    <p style="color:var(--text-muted);margin-top:0">Select a report type and period. AI will generate a board-ready executive narrative with insights and recommendations.</p>
    <div class="form-row">
      <div><label class="field">Report type</label>
        <select id="nar-type">
          <option value="pl">Profit & Loss</option>
          <option value="tb">Trial Balance</option>
          <option value="bs">Balance Sheet</option>
          <option value="tax">Tax Register</option>
        </select>
      </div>
      <div><label class="field">From</label><input type="date" id="nar-from" value="${firstOfMonth()}"/></div>
      <div><label class="field">To</label><input type="date" id="nar-to" value="${lastOfMonth()}"/></div>
    </div>
    <button type="button" class="btn btn-primary" id="nar-run">Generate AI Narrative</button>
    <div id="nar-out" style="margin-top:1.25rem"></div>
  </div></div>`;

  $("#nar-run").onclick = async () => {
    const out = $("#nar-out");
    out.innerHTML = aiLoadingCard("executive narrative");
    try {
      const data = await api("/api/ai/narrate-report", {
        method: "POST",
        body: JSON.stringify({
          report_type: $("#nar-type").value,
          from: $("#nar-from").value,
          to: $("#nar-to").value,
          as_of: $("#nar-to").value,
        }),
      });
      const n = data.narrative || {};
      let html = `<div class="card ai-narrative-card">
        <div class="card-header"><h2>Executive Summary</h2><span class="badge badge-muted">${esc(data.report_type)}</span></div>
        <div class="card-body">
          <p style="font-size:0.95rem;line-height:1.7">${esc(n.executive_summary || "")}</p>
        </div>
      </div>`;

      if ((n.key_insights || []).length > 0) {
        html += `<div class="card"><div class="card-header"><h2>Key Insights</h2></div><div class="card-body">
          ${n.key_insights.map(i => `<div class="ai-insight-item"><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></div>`).join("")}
        </div></div>`;
      }

      if ((n.concerns || []).length > 0) {
        html += `<div class="card"><div class="card-header"><h2>Concerns & Risks</h2></div><div class="card-body">
          ${n.concerns.map(c => `<div class="ai-concern-item"><strong>${esc(c.title)}</strong><p>${esc(c.detail)}</p></div>`).join("")}
        </div></div>`;
      }

      if ((n.recommendations || []).length > 0) {
        html += `<div class="card"><div class="card-header"><h2>Recommendations</h2></div><div class="card-body"><ul class="ai-rec-list">
          ${n.recommendations.map(r => `<li>${esc(r)}</li>`).join("")}
        </ul></div></div>`;
      }

      if (n.period_comparison?.available && (n.period_comparison.highlights || []).length > 0) {
        html += `<div class="card"><div class="card-header"><h2>Period Comparison</h2></div><div class="card-body"><ul>
          ${n.period_comparison.highlights.map(h => `<li>${esc(h)}</li>`).join("")}
        </ul></div></div>`;
      }

      html += `<p style="font-size:0.75rem;color:var(--text-muted)">Generated at ${data.generated_at} · Period: ${esc(data.period?.from)} to ${esc(data.period?.to)}</p>`;
      out.innerHTML = html;
    } catch (e) {
      out.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

async function viewAiCashflow() {
  setTitle("AI Cash Flow Forecast");
  contentEl().innerHTML = aiLoadingCard("cash flow patterns and forecast");
  try {
    const data = await api("/api/ai/cash-flow-forecast");
    const fc = data.forecast || {};
    const hist = data.historical_data || {};

    let html = `<div class="grid-stats">
      <div class="stat-card"><div class="label">Total invoiced</div><div class="value" style="font-size:1.1rem">${fmtMoney(hist.totals?.total_invoiced)}</div></div>
      <div class="stat-card"><div class="label">Bank inflows</div><div class="value" style="font-size:1.1rem;color:var(--success)">${fmtMoney(hist.totals?.total_bank_inflow)}</div></div>
      <div class="stat-card"><div class="label">Bank outflows</div><div class="value" style="font-size:1.1rem;color:var(--danger)">${fmtMoney(hist.totals?.total_bank_outflow)}</div></div>
    </div>`;

    // Forecast table
    const fcRows = fc.forecast || [];
    if (fcRows.length > 0) {
      html += `<div class="card"><div class="card-header"><h2>90-Day Forecast</h2></div><div class="card-body">
        <div class="table-wrap"><table class="data"><thead><tr><th>Period</th><th>Projected Inflow</th><th>Projected Outflow</th><th>Net</th><th>Confidence</th></tr></thead><tbody>
          ${fcRows.map(r => `<tr>
            <td><strong>${esc(r.period)}</strong></td>
            <td style="color:var(--success)">${fmtMoney(r.projected_inflow)}</td>
            <td style="color:var(--danger)">${fmtMoney(r.projected_outflow)}</td>
            <td style="font-weight:600;color:${(r.net || 0) >= 0 ? "var(--success)" : "var(--danger)"}">${fmtMoney(r.net)}</td>
            <td>${severityBadge(r.confidence === "high" ? "ok" : r.confidence === "medium" ? "warning" : "info")}</td>
          </tr>`).join("")}
        </tbody></table></div>
      </div></div>`;
    }

    // Narrative
    if (fc.narrative) {
      html += `<div class="card ai-narrative-card"><div class="card-header"><h2>Analysis</h2></div><div class="card-body">
        <p style="line-height:1.7">${esc(fc.narrative)}</p>
      </div></div>`;
    }

    // Seasonal + Risk
    const cols = [
      { title: "Seasonal Insights", items: fc.seasonal_insights || [] },
      { title: "Vendor Payment Alerts", items: fc.vendor_alerts || [] },
      { title: "Risk Flags", items: fc.risk_flags || [] },
    ];
    for (const col of cols) {
      if (col.items.length > 0) {
        html += `<div class="card"><div class="card-header"><h2>${esc(col.title)}</h2></div><div class="card-body"><ul class="ai-rec-list">
          ${col.items.map(i => `<li>${esc(i)}</li>`).join("")}
        </ul></div></div>`;
      }
    }

    // Vendor cycles
    const cycles = hist.top_vendor_payment_cycles || [];
    if (cycles.length > 0) {
      html += `<div class="card"><div class="card-header"><h2>Top Vendor Payment Cycles</h2></div><div class="card-body">
        <div class="table-wrap"><table class="data"><thead><tr><th>Vendor</th><th>Invoices</th><th>Total Spend</th><th>Avg Amount</th><th>Avg Days Between</th></tr></thead><tbody>
          ${cycles.map(c => `<tr><td>${esc(c.vendor)}</td><td>${c.invoice_count}</td><td>${fmtMoney(c.total_spend)}</td><td>${fmtMoney(c.avg_invoice_amount)}</td><td>${c.avg_days_between_invoices ?? "—"}</td></tr>`).join("")}
        </tbody></table></div>
      </div></div>`;
    }

    html += `<p style="font-size:0.75rem;color:var(--text-muted)">Forecast generated at ${data.generated_at}</p>`;
    contentEl().innerHTML = html;
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

async function viewAiVendor() {
  setTitle("Vendor AI Intelligence");
  contentEl().innerHTML = aiLoadingCard("vendor profiles and risk assessment");
  try {
    const data = await api("/api/ai/vendor-intelligence");
    const ai = data.ai_analysis || {};
    const profiles = data.vendor_profiles || [];
    const summary = data.data_summary || {};

    const healthColors = { healthy: "var(--success)", moderate_risk: "var(--warning)", high_risk: "var(--danger)" };
    let html = `<div class="grid-stats">
      <div class="stat-card"><div class="label">Vendors analyzed</div><div class="value">${summary.total_vendors || 0}</div></div>
      <div class="stat-card"><div class="label">Total spend</div><div class="value" style="font-size:1.1rem">${fmtMoney(summary.total_spend)}</div></div>
      <div class="stat-card"><div class="label">Top-5 concentration</div><div class="value">${summary.concentration_risk || 0}%</div></div>
      <div class="stat-card"><div class="label">Portfolio health</div><div class="value" style="font-size:1rem;color:${healthColors[ai.overall_health] || "var(--text)"}">${esc(ai.overall_health || "—")}</div></div>
    </div>`;

    if (ai.narrative) {
      html += `<div class="card ai-narrative-card"><div class="card-header"><h2>Executive Summary</h2></div><div class="card-body">
        <p style="line-height:1.7">${esc(ai.narrative)}</p>
      </div></div>`;
    }

    // Vendor score cards
    const scores = ai.vendor_scores || [];
    if (scores.length > 0) {
      html += `<div class="card"><div class="card-header"><h2>Vendor Scores</h2></div><div class="card-body">`;
      for (const vs of scores) {
        const profile = profiles.find(p => p.vendor_name === vs.vendor_name);
        const scoreColor = vs.reliability_score >= 70 ? "var(--success)" : vs.reliability_score >= 40 ? "var(--warning)" : "var(--danger)";
        html += `<div class="ai-vendor-card">
          <div class="ai-vendor-header">
            <div>
              <strong>${esc(vs.vendor_name)}</strong>
              ${profile ? `<span style="font-size:0.8rem;color:var(--text-muted);margin-left:0.5rem">${profile.invoice_count} invoices · ${fmtMoney(profile.total_spend)} · ${profile.spend_share_pct}% of spend</span>` : ""}
            </div>
            <div class="ai-score" style="color:${scoreColor}"><span style="font-size:1.5rem;font-weight:700">${vs.reliability_score}</span><span style="font-size:0.7rem">/100</span></div>
          </div>
          <p style="font-size:0.85rem;margin:0.5rem 0">${esc(vs.price_assessment || "")}</p>
          ${(vs.risk_factors || []).length > 0 ? `<div style="margin-top:0.25rem"><span style="font-size:0.75rem;font-weight:600;color:var(--danger)">Risks:</span> <span style="font-size:0.8rem">${vs.risk_factors.map(r => esc(r)).join(" · ")}</span></div>` : ""}
          ${(vs.opportunities || []).length > 0 ? `<div style="margin-top:0.25rem"><span style="font-size:0.75rem;font-weight:600;color:var(--success)">Opportunities:</span> <span style="font-size:0.8rem">${vs.opportunities.map(o => esc(o)).join(" · ")}</span></div>` : ""}
        </div>`;
      }
      html += `</div></div>`;
    }

    // Portfolio insights
    const insights = ai.portfolio_insights || [];
    if (insights.length > 0) {
      html += `<div class="card"><div class="card-header"><h2>Portfolio Insights</h2></div><div class="card-body">
        ${insights.map(i => `<div class="ai-insight-item">${priorityBadge(i.priority)} <strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></div>`).join("")}
      </div></div>`;
    }

    // Consolidation
    const consol = ai.consolidation_opportunities || [];
    if (consol.length > 0) {
      html += `<div class="card"><div class="card-header"><h2>Consolidation Opportunities</h2></div><div class="card-body"><ul class="ai-rec-list">
        ${consol.map(c => `<li>${esc(c)}</li>`).join("")}
      </ul></div></div>`;
    }

    html += `<p style="font-size:0.75rem;color:var(--text-muted)">Analysis generated at ${data.generated_at} · ${esc(summary.period)}</p>`;
    contentEl().innerHTML = html;
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

async function viewAiCompliance() {
  setTitle("AI Compliance Pre-Auditor");
  contentEl().innerHTML = aiLoadingCard("compliance checks and audit readiness");
  try {
    const data = await api("/api/ai/compliance-check");
    const ai = data.ai_analysis || {};
    const checks = data.checks || [];
    const summary = data.summary || {};

    const readinessColors = { audit_ready: "var(--success)", needs_attention: "var(--warning)", significant_gaps: "var(--danger)" };
    let html = `<div class="grid-stats">
      <div class="stat-card"><div class="label">Readiness score</div><div class="value" style="color:${readinessColors[ai.overall_readiness] || "var(--text)"}">${ai.readiness_score ?? "—"}/100</div></div>
      <div class="stat-card"><div class="label">Checks passed</div><div class="value" style="color:var(--success)">${summary.passed || 0}/${summary.total_checks || 0}</div></div>
      <div class="stat-card"><div class="label">Failed</div><div class="value" style="color:var(--danger)">${summary.failed || 0}</div></div>
      <div class="stat-card"><div class="label">Warnings</div><div class="value" style="color:var(--warning)">${summary.warnings || 0}</div></div>
    </div>`;

    if (ai.executive_summary) {
      html += `<div class="card ai-narrative-card"><div class="card-header"><h2>Auditor's Summary</h2></div><div class="card-body">
        <p style="line-height:1.7">${esc(ai.executive_summary)}</p>
      </div></div>`;
    }

    // Build AI analysis map
    const aiCheckMap = {};
    for (const ca of (ai.check_analysis || [])) aiCheckMap[ca.check_id] = ca;

    for (const chk of checks) {
      const statusIcon = chk.status === "pass" ? '<span style="color:var(--success);font-weight:700;font-size:1.1rem">&#10003;</span>'
        : chk.status === "fail" ? '<span style="color:var(--danger);font-weight:700;font-size:1.1rem">&#10007;</span>'
        : '<span style="color:var(--warning);font-weight:700;font-size:1.1rem">&#9888;</span>';
      const aiNote = aiCheckMap[chk.check_id];

      html += `<div class="card">
        <div class="card-header">
          ${statusIcon}
          <strong style="flex:1;margin-left:0.5rem">${esc(chk.title)}</strong>
          ${severityBadge(chk.severity)}
          ${chk.count > 0 ? `<span class="badge badge-muted">${chk.count} issue(s)</span>` : ""}
        </div>
        <div class="card-body">
          <p style="color:var(--text-muted);font-size:0.85rem">${esc(chk.description)}</p>
          ${aiNote ? `<div class="ai-insight-box" style="margin-top:0.75rem">
            ${aiNote.priority ? `<div style="margin-bottom:0.5rem">${priorityBadge(aiNote.priority)}</div>` : ""}
            <p><strong>Compliance risk:</strong> ${esc(aiNote.compliance_risk || "")}</p>
            <p><strong>Consequence:</strong> ${esc(aiNote.consequence || "")}</p>
            ${(aiNote.remediation || []).length > 0 ? `<div><strong>Remediation:</strong><ol style="margin:0.25rem 0 0 1.25rem">${aiNote.remediation.map(r => `<li>${esc(r)}</li>`).join("")}</ol></div>` : ""}
          </div>` : ""}
          ${(chk.items || []).length > 0 ? `<details style="margin-top:0.75rem"><summary style="cursor:pointer;color:var(--accent);font-size:0.85rem">View affected items (${(chk.items || []).length})</summary>
            <pre class="json-preview" style="margin-top:0.5rem;max-height:200px">${esc(JSON.stringify(chk.items, null, 2))}</pre>
          </details>` : ""}
        </div>
      </div>`;
    }

    html += `<p style="font-size:0.75rem;color:var(--text-muted)">Audit completed at ${data.generated_at}</p>`;
    contentEl().innerHTML = html;
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

const VIEWS = {
  "/dashboard": viewDashboard,
  "/invoices": viewInvoices,
  "/extract": viewExtract,
  "/assistant": viewAssistant,
  "/accounts": viewAccounts,
  "/journals": viewJournals,
  "/reports": viewReports,
  "/bank": viewBank,
  "/trace": viewTrace,
  "/close": viewClose,
  "/query": viewQuery,
  "/ai-tax": viewAiTax,
  "/ai-anomaly": viewAiAnomaly,
  "/ai-narrator": viewAiNarrator,
  "/ai-cashflow": viewAiCashflow,
  "/ai-vendor": viewAiVendor,
  "/ai-compliance": viewAiCompliance,
};

function navigate(path) {
  location.hash = "#" + path;
}

async function render() {
  let path = getRoute();
  if (!VIEWS[path]) path = "/dashboard";
  renderNav();
  const fn = VIEWS[path];
  contentEl().innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    await fn();
  } catch (e) {
    contentEl().innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

function init() {
  if (!location.hash || location.hash === "#") location.hash = "#/dashboard";
  window.addEventListener("hashchange", render);
  render();
}

init();
