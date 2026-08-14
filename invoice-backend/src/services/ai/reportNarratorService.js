import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { trialBalance, profitAndLoss, balanceSheet, taxRegister } from '../reports/financialReportService.js';
import { supabase } from '../../db.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function shiftMonths(isoDate, months) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

async function gatherContext(reportType, fromDate, toDate, asOfDate) {
  const context = { reportType };

  if (reportType === 'pl') {
    context.current = await profitAndLoss(fromDate, toDate);
    try {
      const prevFrom = shiftMonths(fromDate, -3);
      const prevTo = endOfMonth(shiftMonths(toDate, -3));
      context.prior_period = await profitAndLoss(prevFrom, prevTo);
      context.prior_label = `${prevFrom} to ${prevTo}`;
    } catch { /* no prior data is fine */ }

    const { data: topVendors } = await supabase
      .from('invoice_header')
      .select('vendor_name, category, total_amount')
      .gte('invoice_date', fromDate)
      .lte('invoice_date', toDate)
      .order('total_amount', { ascending: false })
      .limit(20);
    context.top_vendors = topVendors || [];

  } else if (reportType === 'trial_balance' || reportType === 'tb') {
    context.current = await trialBalance(fromDate, toDate);

  } else if (reportType === 'balance_sheet' || reportType === 'bs') {
    context.current = await balanceSheet(asOfDate || toDate);
    try {
      const priorDate = shiftMonths(asOfDate || toDate, -3);
      context.prior_period = await balanceSheet(priorDate);
      context.prior_label = `As of ${priorDate}`;
    } catch { /* ok */ }

  } else if (reportType === 'tax_register' || reportType === 'tax') {
    context.current = await taxRegister(fromDate, toDate);
  }

  const { count: invoiceCount } = await supabase
    .from('invoice_header')
    .select('invoice_id', { count: 'exact', head: true })
    .gte('invoice_date', fromDate || '2000-01-01')
    .lte('invoice_date', toDate || '2099-12-31');
  context.invoice_count_in_period = invoiceCount || 0;

  return context;
}

const NARRATOR_PROMPT = `You are a senior CFO preparing a board-ready executive summary of a financial report. You speak with authority and clarity.

RULES:
- Start with a one-paragraph executive summary
- Highlight the 3-5 most important insights from the data
- If prior-period data is available, include period-over-period comparison with percentage changes
- Flag any concerns or risks (negative trends, concentration, unusual items)
- End with 2-3 actionable recommendations
- Use GBP currency formatting (e.g., "£18,400" or "£1.2m" for large amounts)
- Be specific — reference actual account names, vendor names, amounts
- Keep it concise but comprehensive (400-600 words)
- Do NOT use markdown headers — use plain paragraphs with bold for emphasis

Format response as JSON:
{
  "executive_summary": "paragraph",
  "key_insights": [{ "title": "short", "detail": "explanation with numbers" }],
  "concerns": [{ "title": "short", "detail": "why it matters" }],
  "recommendations": ["actionable step 1", "actionable step 2"],
  "period_comparison": { "available": true/false, "highlights": ["change 1", "change 2"] }
}

Return ONLY the JSON. No markdown wrapping.`;

export async function narrateReport({ report_type, from, to, as_of }) {
  const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const asOfDate = as_of || toDate;

  const context = await gatherContext(report_type, fromDate, toDate, asOfDate);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: NARRATOR_PROMPT },
      {
        role: 'user',
        content: `Generate an executive narrative for this ${report_type} report.\n\nPeriod: ${fromDate} to ${toDate}\n\nReport data:\n${JSON.stringify(context, null, 2)}`,
      },
    ],
    max_tokens: 2500,
    temperature: 0.3,
  });

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  let narrative;
  try {
    narrative = JSON.parse(raw);
  } catch {
    narrative = {
      executive_summary: raw,
      key_insights: [],
      concerns: [],
      recommendations: [],
      period_comparison: { available: false, highlights: [] },
    };
  }

  return {
    generated_at: new Date().toISOString(),
    report_type,
    period: { from: fromDate, to: toDate, as_of: asOfDate },
    narrative,
  };
}
