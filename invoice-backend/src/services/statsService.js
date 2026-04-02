import { supabase } from '../db.js';

/**
 * Get invoice statistics: totals, by category, top vendors. Optionally filter by period (e.g. 2025, 2025-07).
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
    return {
      period: period || 'all time',
      total_invoices: 0,
      inr_total: 0,
      usd_total: 0,
      average_amount: 0,
      highest: { amount: 0, vendor: null },
      lowest: { amount: 0, vendor: null },
      by_category: {},
      top_5_vendors: [],
    };
  }

  const filtered = period && period.trim()
    ? invoices.filter((inv) => inv.invoice_date && String(inv.invoice_date).startsWith(period.trim()))
    : invoices;

  if (filtered.length === 0) {
    return {
      period: period || 'all time',
      total_invoices: 0,
      inr_total: 0,
      usd_total: 0,
      average_amount: 0,
      highest: { amount: 0, vendor: null },
      lowest: { amount: 0, vendor: null },
      by_category: {},
      top_5_vendors: [],
    };
  }

  const amounts = filtered.map((i) => parseFloat(i.total_amount || 0));
  const total = amounts.reduce((s, a) => s + a, 0);
  const avg = total / filtered.length;
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  const maxInv = filtered.find((i) => parseFloat(i.total_amount) === max);
  const minInv = filtered.find((i) => parseFloat(i.total_amount) === min);

  const inrTotal = filtered
    .filter((r) => r.currency === 'INR')
    .reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
  const usdTotal = filtered
    .filter((r) => r.currency === 'USD')
    .reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);

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

  return {
    period: period || 'all time',
    total_invoices: filtered.length,
    inr_total: Math.round(inrTotal),
    usd_total: Math.round(usdTotal * 100) / 100,
    average_amount: Math.round(avg),
    highest: { amount: max, vendor: maxInv?.vendor_name ?? null },
    lowest: { amount: min, vendor: minInv?.vendor_name ?? null },
    by_category: byCategory,
    top_5_vendors: topVendors,
  };
}
