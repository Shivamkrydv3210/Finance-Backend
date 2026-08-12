import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { supabase } from '../../db.js';
import { getVatRate, getVatRegistrationThreshold, getCorporationTaxRate, listExpenseRules, getKnowledgeSummary } from '../../knowledge/uk-tax/index.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function gatherTaxData() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const since = sixMonthsAgo.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [invoicesRes, journalsRes, taxLinesRes, periodsRes] = await Promise.all([
    supabase
      .from('invoice_header')
      .select('invoice_id, vendor_name, invoice_number, invoice_date, category, expense_category, currency, subtotal, tax_amount, total_amount, tax_rate, journal_entry_id')
      .gte('invoice_date', since)
      .order('invoice_date', { ascending: false })
      .limit(500),

    supabase
      .from('journal_entries')
      .select('journal_entry_id, entry_date, description, source_type, source_ref, status')
      .eq('status', 'posted')
      .gte('entry_date', since)
      .limit(500),

    supabase
      .from('journal_lines')
      .select('journal_entry_id, account_id, debit, credit, tax_scheme, tax_rate, tax_amount, description')
      .not('tax_scheme', 'is', null)
      .limit(1000),

    supabase.from('fiscal_periods').select('*').order('start_date', { ascending: false }).limit(12),
  ]);

  const invoices = invoicesRes.data || [];
  const journals = journalsRes.data || [];
  const taxLines = taxLinesRes.data || [];
  const periods = periodsRes.data || [];

  const { data: accounts } = await supabase.from('accounts').select('account_id, code, name, account_type, default_tax_scheme');
  const accMap = Object.fromEntries((accounts || []).map((a) => [a.account_id, a]));

  const missingTax = invoices.filter((i) => (!i.tax_amount || Number(i.tax_amount) === 0) && Number(i.total_amount) > 1000);
  const miscategorized = invoices.filter((i) => i.category === 'other' && Number(i.total_amount) > 500);

  // Invoices claiming VAT on a category the knowledge base blocks recovery for — a
  // very concrete, high-confidence "leakage" finding, not a generic AI guess.
  const blockedCategoriesClaimed = invoices.filter((i) => {
    if (!i.expense_category || !(Number(i.tax_amount) > 0)) return false;
    const rule = listExpenseRules().find((r) => r.key === i.expense_category);
    return rule && (rule.vat_recoverable === false || rule.vat_partial_recovery_pct != null);
  });

  const byVendor = {};
  for (const inv of invoices) {
    const vn = inv.vendor_name || 'Unknown';
    if (!byVendor[vn]) byVendor[vn] = { count: 0, total: 0, withTax: 0, withoutTax: 0, categories: new Set() };
    byVendor[vn].count++;
    byVendor[vn].total += Number(inv.total_amount || 0);
    byVendor[vn].categories.add(inv.category);
    if (Number(inv.tax_amount || 0) > 0) byVendor[vn].withTax++;
    else byVendor[vn].withoutTax++;
  }
  const vendorInconsistencies = Object.entries(byVendor)
    .filter(([, v]) => v.withTax > 0 && v.withoutTax > 0)
    .map(([name, v]) => ({
      vendor: name,
      invoices_with_tax: v.withTax,
      invoices_without_tax: v.withoutTax,
      total_spend: Math.round(v.total),
    }));

  const taxByScheme = {};
  for (const tl of taxLines) {
    const s = tl.tax_scheme || 'unknown';
    if (!taxByScheme[s]) taxByScheme[s] = { total_tax: 0, count: 0 };
    taxByScheme[s].total_tax += Number(tl.tax_amount || 0);
    taxByScheme[s].count++;
  }

  const currentFY = periods.find((p) => p.status === 'open');
  const lockedPeriods = periods.filter((p) => p.status === 'locked');

  const totalSpend = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalTaxPaid = invoices.reduce((s, i) => s + Number(i.tax_amount || 0), 0);

  return {
    summary: {
      period: `Last 6 months (since ${since})`,
      total_invoices: invoices.length,
      total_spend: Math.round(totalSpend),
      total_tax_paid: Math.round(totalTaxPaid),
      effective_tax_rate_pct: totalSpend > 0 ? Math.round((totalTaxPaid / totalSpend) * 10000) / 100 : 0,
    },
    missing_tax_invoices: missingTax.slice(0, 20).map((i) => ({
      invoice_id: i.invoice_id,
      vendor: i.vendor_name,
      amount: Number(i.total_amount),
      category: i.category,
      date: i.invoice_date,
    })),
    miscategorized_invoices: miscategorized.slice(0, 20).map((i) => ({
      invoice_id: i.invoice_id,
      vendor: i.vendor_name,
      amount: Number(i.total_amount),
      date: i.invoice_date,
    })),
    blocked_vat_claimed: blockedCategoriesClaimed.slice(0, 20).map((i) => ({
      invoice_id: i.invoice_id,
      vendor: i.vendor_name,
      expense_category: i.expense_category,
      tax_amount: Number(i.tax_amount),
      date: i.invoice_date,
    })),
    vendor_tax_inconsistencies: vendorInconsistencies.slice(0, 15),
    tax_by_scheme: taxByScheme,
    fiscal_periods: { current_open: currentFY ? `${currentFY.period_year}-${currentFY.period_month}` : null, locked_count: lockedPeriods.length },
    category_spend: Object.fromEntries(
      Object.entries(
        invoices.reduce((m, i) => {
          const c = i.category || 'other';
          m[c] = (m[c] || 0) + Number(i.total_amount || 0);
          return m;
        }, {})
      ).map(([k, v]) => [k, Math.round(v)])
    ),
    // Real rates and thresholds the model must reason from — not invent from its
    // own (possibly stale or wrong-jurisdiction) training data.
    reference_rates: {
      vat_standard_rate_pct: getVatRate('standard', today).value,
      vat_reduced_rate_pct: getVatRate('reduced', today).value,
      vat_registration_threshold_gbp: getVatRegistrationThreshold(today)?.value,
      corporation_tax_at_illustrative_profit: getCorporationTaxRate(100000, today),
      expense_rules: listExpenseRules().map((r) => ({ key: r.key, vat_recoverable: r.vat_recoverable, vat_partial_recovery_pct: r.vat_partial_recovery_pct ?? null, ct_deductible: r.ct_deductible })),
    },
  };
}

const TAX_SYSTEM_PROMPT = `You are a UK Chartered Tax Adviser (CTA) analyzing a company's financial data from their accounting system to find VAT and Corporation Tax savings and risks.

Your role:
1. Identify concrete tax saving opportunities based on the ACTUAL data provided
2. Find input VAT recovery leakages — invoices with no VAT recorded that should have some, and vendor-level inconsistencies
3. Flag any invoice in "blocked_vat_claimed" as a compliance RISK, not a saving — it means input VAT was claimed on a category HMRC blocks (client entertainment, car purchases) or only partially allows (car leases, 50%); recommend correcting the claim, not "optimizing" it further
4. Spot miscategorized expenses that could qualify for better VAT/CT treatment
5. Recommend timing strategies for expense recognition ahead of the Corporation Tax accounting period end

CRITICAL RULES:
- You are given real UK rates and rules in "reference_rates" — cite and use THESE figures (VAT rates, the registration threshold, the illustrative Corporation Tax calculation with its Marginal Relief fraction, and per-category VAT/CT rules). Do not state a rate, threshold, or legal rule that isn't present in the supplied data; if you're unsure, say so rather than guessing.
- Every suggestion MUST reference specific data points (vendor names, amounts, invoice counts)
- Estimate potential savings in GBP (£) for each suggestion
- Prioritize by potential impact (highest savings first)
- Be specific — not generic advice. Reference the actual numbers.
- Format response as a JSON array of objects with: { "priority": "high|medium|low", "category": "vat_recovery|compliance_risk|recategorization|timing|vendor_negotiation", "title": "short title", "description": "detailed actionable explanation with specific numbers, citing the relevant VAT/CT rule where applicable", "estimated_savings_gbp": number, "affected_invoices": number, "action_items": ["step 1", "step 2"] }

Return ONLY the JSON array. No markdown, no explanation outside the array.`;

export async function analyzeForTaxOptimization() {
  const data = await gatherTaxData();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAX_SYSTEM_PROMPT },
      { role: 'user', content: `Analyze this financial data and provide tax optimization suggestions:\n\n${JSON.stringify(data, null, 2)}` },
    ],
    max_tokens: 3000,
    temperature: 0.2,
  });

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  let suggestions;
  try {
    suggestions = JSON.parse(raw);
  } catch {
    suggestions = [{ priority: 'medium', category: 'general', title: 'AI Analysis', description: raw, estimated_savings_gbp: 0, affected_invoices: 0, action_items: [] }];
  }

  const totalPotentialSavings = suggestions.reduce((s, r) => s + (r.estimated_savings_gbp || 0), 0);

  return {
    generated_at: new Date().toISOString(),
    data_summary: data.summary,
    knowledge_base: getKnowledgeSummary(),
    suggestions,
    total_potential_savings_gbp: totalPotentialSavings,
    suggestion_count: suggestions.length,
  };
}
