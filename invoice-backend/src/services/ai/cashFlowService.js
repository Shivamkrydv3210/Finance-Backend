import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { supabase } from '../../db.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function weekKey(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function monthKey(isoDate) {
  return isoDate?.slice(0, 7);
}

async function gatherCashFlowData() {
  const eighteenMonthsAgo = new Date();
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
  const since = eighteenMonthsAgo.toISOString().slice(0, 10);

  const [invoicesRes, bankRes, vendorsRes] = await Promise.all([
    supabase
      .from('invoice_header')
      .select('invoice_id, vendor_name, invoice_date, due_date, category, total_amount, currency')
      .gte('invoice_date', since)
      .order('invoice_date')
      .limit(3000),

    supabase
      .from('bank_transactions')
      .select('bank_txn_id, txn_date, amount, description, reconciliation_status')
      .gte('txn_date', since)
      .order('txn_date')
      .limit(2000),

    supabase.from('vendors').select('id, vendor_name').limit(500),
  ]);

  const invoices = invoicesRes.data || [];
  const bankTxns = bankRes.data || [];

  // Monthly outflow from invoices
  const monthlyOutflow = {};
  const monthlyByCategory = {};
  for (const inv of invoices) {
    const mk = monthKey(inv.invoice_date);
    const amt = Number(inv.total_amount || 0);
    monthlyOutflow[mk] = (monthlyOutflow[mk] || 0) + amt;
    const cat = inv.category || 'other';
    if (!monthlyByCategory[mk]) monthlyByCategory[mk] = {};
    monthlyByCategory[mk][cat] = (monthlyByCategory[mk][cat] || 0) + amt;
  }

  // Weekly bank flows
  const weeklyBank = {};
  for (const txn of bankTxns) {
    const wk = weekKey(txn.txn_date);
    if (!weeklyBank[wk]) weeklyBank[wk] = { inflow: 0, outflow: 0, net: 0 };
    const amt = Number(txn.amount || 0);
    if (amt >= 0) weeklyBank[wk].inflow += amt;
    else weeklyBank[wk].outflow += Math.abs(amt);
    weeklyBank[wk].net += amt;
  }

  // Vendor payment cycles
  const vendorInvoices = {};
  for (const inv of invoices) {
    const vn = inv.vendor_name || 'Unknown';
    if (!vendorInvoices[vn]) vendorInvoices[vn] = { dates: [], amounts: [], total: 0 };
    vendorInvoices[vn].dates.push(inv.invoice_date);
    vendorInvoices[vn].amounts.push(Number(inv.total_amount || 0));
    vendorInvoices[vn].total += Number(inv.total_amount || 0);
  }

  const topVendorCycles = Object.entries(vendorInvoices)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, v]) => {
      const sortedDates = [...v.dates].sort();
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / 86400000);
      }
      const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
      const avgAmount = Math.round(v.total / v.amounts.length);
      return { vendor: name, invoice_count: v.amounts.length, total_spend: Math.round(v.total), avg_days_between_invoices: avgGap, avg_invoice_amount: avgAmount };
    });

  // Seasonal patterns (month-of-year averages)
  const monthOfYearTotals = {};
  const monthOfYearCounts = {};
  for (const [mk, amt] of Object.entries(monthlyOutflow)) {
    const m = Number(mk.slice(5, 7));
    monthOfYearTotals[m] = (monthOfYearTotals[m] || 0) + amt;
    monthOfYearCounts[m] = (monthOfYearCounts[m] || 0) + 1;
  }
  const seasonalAvg = {};
  for (let m = 1; m <= 12; m++) {
    if (monthOfYearCounts[m]) seasonalAvg[m] = Math.round(monthOfYearTotals[m] / monthOfYearCounts[m]);
  }

  return {
    period: { from: since, to: new Date().toISOString().slice(0, 10) },
    monthly_invoice_outflow: monthlyOutflow,
    monthly_by_category: monthlyByCategory,
    weekly_bank_flows: weeklyBank,
    top_vendor_payment_cycles: topVendorCycles,
    seasonal_monthly_avg: seasonalAvg,
    totals: {
      total_invoiced: Math.round(invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)),
      total_bank_inflow: Math.round(bankTxns.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)),
      total_bank_outflow: Math.round(bankTxns.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)),
    },
  };
}

const FORECAST_PROMPT = `You are a financial analyst specializing in cash flow forecasting for Indian businesses. Analyze the historical data and produce a cash flow forecast.

RULES:
- Project the next 90 days in three 30-day buckets (Month+1, Month+2, Month+3)
- Use seasonal patterns, vendor payment cycles, and recent trends
- Identify any seasonal peaks or troughs
- Flag cash flow risks (e.g., "outflows likely to spike in March due to year-end vendor settlements")
- All amounts in INR

Return JSON:
{
  "forecast": [
    { "period": "Month+1 label", "projected_outflow": number, "projected_inflow": number, "net": number, "confidence": "high|medium|low" },
    { "period": "Month+2 label", "projected_outflow": number, "projected_inflow": number, "net": number, "confidence": "high|medium|low" },
    { "period": "Month+3 label", "projected_outflow": number, "projected_inflow": number, "net": number, "confidence": "high|medium|low" }
  ],
  "seasonal_insights": ["insight 1 with numbers", "insight 2"],
  "vendor_alerts": ["top vendor cycle alert 1"],
  "risk_flags": ["risk 1 with amounts"],
  "narrative": "2-3 paragraph executive summary of the cash flow outlook"
}

Return ONLY the JSON.`;

export async function forecastCashFlow() {
  const data = await gatherCashFlowData();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: FORECAST_PROMPT },
      { role: 'user', content: `Forecast cash flow based on this historical data:\n\n${JSON.stringify(data, null, 2)}` },
    ],
    max_tokens: 2500,
    temperature: 0.25,
  });

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  let forecast;
  try {
    forecast = JSON.parse(raw);
  } catch {
    forecast = {
      forecast: [],
      seasonal_insights: [],
      vendor_alerts: [],
      risk_flags: [],
      narrative: raw,
    };
  }

  return {
    generated_at: new Date().toISOString(),
    historical_data: data,
    forecast,
  };
}
