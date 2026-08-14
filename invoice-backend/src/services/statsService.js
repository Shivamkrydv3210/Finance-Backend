import { supabase } from '../db.js';

const BASE_CURRENCY = 'GBP';

function emptyStats(period) {
  return {
    period: period || 'all time',
    base_currency: BASE_CURRENCY,
    total_invoices: 0,
    gbp_total: 0,
    by_currency: {},
    average_amount: 0,
    highest: { amount: 0, vendor: null },
    lowest: { amount: 0, vendor: null },
    by_category: {},
    top_5_vendors: [],
    by_month: [],
  };
}

/**
 * Get invoice statistics: totals, by category, top vendors, by month.
 * Optionally filter by period (e.g. 2025, 2025-07).
 * @param {string} [period] - Optional filter e.g. '2025', '2025-07'
 * @returns Stats object
 */
export async function getInvoiceStats(period) {
  let query = supabase
    .from('invoice_header')
    .select('total_amount, subtotal, tax_amount, category, invoice_date, currency, vendor_name, payment_mode');

  const { data: invoices, error } = await query;

  if (error) throw new Error('Failed to fetch invoices: ' + error.message);
  if (!invoices || invoices.length === 0) {
    return emptyStats(period);
  }

  const filtered = period && period.trim()
    ? invoices.filter((inv) => inv.invoice_date && String(inv.invoice_date).startsWith(period.trim()))
    : invoices;

  if (filtered.length === 0) {
    return emptyStats(period);
  }

  const amounts = filtered.map((i) => parseFloat(i.total_amount || 0));
  const total = amounts.reduce((s, a) => s + a, 0);
  const avg = total / filtered.length;
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  const maxInv = filtered.find((i) => parseFloat(i.total_amount) === max);
  const minInv = filtered.find((i) => parseFloat(i.total_amount) === min);

  // Totalled per currency rather than converted: there are no FX rates in the ledger,
  // so summing mixed currencies into one figure would invent a number nobody can defend.
  const byCurrency = filtered.reduce((acc, inv) => {
    const code = (inv.currency || BASE_CURRENCY).toUpperCase();
    if (!acc[code]) acc[code] = { count: 0, total: 0 };
    acc[code].count++;
    acc[code].total += parseFloat(inv.total_amount || 0);
    return acc;
  }, {});
  for (const code of Object.keys(byCurrency)) {
    byCurrency[code].total = Math.round(byCurrency[code].total * 100) / 100;
  }

  const byCategory = filtered.reduce((acc, inv) => {
    const c = inv.category || 'other';
    if (!acc[c]) acc[c] = { count: 0, total: 0 };
    acc[c].count++;
    acc[c].total += parseFloat(inv.total_amount || 0);
    return acc;
  }, {});

  const byVendor = filtered.reduce((acc, inv) => {
    const v = inv.vendor_name || 'Unknown';
    if (!acc[v]) acc[v] = { count: 0, total: 0 };
    acc[v].count++;
    acc[v].total += parseFloat(inv.total_amount || 0);
    return acc;
  }, {});

  const topVendors = Object.entries(byVendor)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([vendor, info]) => ({ vendor, count: info.count, total: info.total }));

  const byMonthMap = filtered.reduce((acc, inv) => {
    const d = inv.invoice_date ? String(inv.invoice_date).slice(0, 7) : null;
    if (!d || d.length < 7) return acc;
    if (!acc[d]) acc[d] = { month: d, count: 0, total: 0 };
    acc[d].count++;
    acc[d].total += parseFloat(inv.total_amount || 0);
    return acc;
  }, {});

  const byMonth = Object.values(byMonthMap).sort((a, b) => a.month.localeCompare(b.month));

  return {
    period: period || 'all time',
    base_currency: BASE_CURRENCY,
    total_invoices: filtered.length,
    gbp_total: byCurrency[BASE_CURRENCY]?.total || 0,
    by_currency: byCurrency,
    average_amount: Math.round(avg),
    highest: { amount: max, vendor: maxInv?.vendor_name ?? null },
    lowest: { amount: min, vendor: minInv?.vendor_name ?? null },
    by_category: byCategory,
    top_5_vendors: topVendors,
    by_month: byMonth,
  };
}
