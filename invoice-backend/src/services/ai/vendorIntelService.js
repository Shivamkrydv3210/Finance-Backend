import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { supabase } from '../../db.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function gatherVendorData() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const since = oneYearAgo.toISOString().slice(0, 10);

  const [invoicesRes, vendorsRes, lineItemsRes] = await Promise.all([
    supabase
      .from('invoice_header')
      .select('invoice_id, vendor_id, vendor_name, invoice_date, category, total_amount, tax_amount, subtotal, currency')
      .gte('invoice_date', since)
      .order('invoice_date')
      .limit(3000),

    supabase.from('vendors').select('id, vendor_name, vendor_email, vendor_phone, vendor_address').limit(500),

    supabase
      .from('invoice_line_items')
      .select('invoice_id, description, sub_expenditure, quantity, unit_price, line_amount')
      .limit(5000),
  ]);

  const invoices = invoicesRes.data || [];
  const vendors = vendorsRes.data || [];
  const lineItems = lineItemsRes.data || [];

  const linesByInvoice = {};
  for (const li of lineItems) {
    if (!linesByInvoice[li.invoice_id]) linesByInvoice[li.invoice_id] = [];
    linesByInvoice[li.invoice_id].push(li);
  }

  const totalSpend = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  const vendorProfiles = {};
  for (const inv of invoices) {
    const vn = inv.vendor_name || 'Unknown';
    if (!vendorProfiles[vn]) {
      vendorProfiles[vn] = {
        vendor_name: vn,
        vendor_id: inv.vendor_id,
        invoices: [],
        total_spend: 0,
        categories: new Set(),
        amounts: [],
        dates: [],
        line_descriptions: new Set(),
      };
    }
    const p = vendorProfiles[vn];
    const amt = Number(inv.total_amount || 0);
    p.invoices.push({ id: inv.invoice_id, date: inv.invoice_date, amount: amt, category: inv.category });
    p.total_spend += amt;
    p.categories.add(inv.category);
    p.amounts.push(amt);
    p.dates.push(inv.invoice_date);
    const lines = linesByInvoice[inv.invoice_id] || [];
    for (const li of lines) {
      if (li.description) p.line_descriptions.add(li.description.slice(0, 60));
    }
  }

  const profiles = Object.values(vendorProfiles)
    .sort((a, b) => b.total_spend - a.total_spend)
    .slice(0, 30)
    .map((p) => {
      const sortedDates = [...p.dates].sort();
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / 86400000);
      }
      const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;

      const sortedAmts = [...p.amounts].sort((a, b) => a - b);
      const avg = p.total_spend / p.amounts.length;
      const stddev = Math.sqrt(p.amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / p.amounts.length);

      // Price trend: compare first-half avg vs second-half avg
      const mid = Math.floor(p.amounts.length / 2);
      const firstHalfAvg = p.amounts.slice(0, mid || 1).reduce((s, a) => s + a, 0) / (mid || 1);
      const secondHalfAvg = p.amounts.slice(mid).reduce((s, a) => s + a, 0) / (p.amounts.length - mid);
      const priceTrendPct = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;

      const vendorInfo = vendors.find((v) => v.id === p.vendor_id);

      return {
        vendor_name: p.vendor_name,
        vendor_id: p.vendor_id,
        has_complete_profile: vendorInfo ? Boolean(vendorInfo.vendor_email && vendorInfo.vendor_address) : false,
        invoice_count: p.invoices.length,
        total_spend: Math.round(p.total_spend),
        spend_share_pct: Math.round((p.total_spend / totalSpend) * 1000) / 10,
        avg_invoice_amount: Math.round(avg),
        amount_stddev: Math.round(stddev),
        pricing_consistency: stddev / avg < 0.3 ? 'stable' : stddev / avg < 0.6 ? 'moderate' : 'volatile',
        price_trend_pct: priceTrendPct,
        price_direction: priceTrendPct > 5 ? 'increasing' : priceTrendPct < -5 ? 'decreasing' : 'stable',
        avg_days_between_invoices: avgGap,
        categories: [...p.categories],
        typical_items: [...p.line_descriptions].slice(0, 5),
        min_amount: Math.round(sortedAmts[0] || 0),
        max_amount: Math.round(sortedAmts[sortedAmts.length - 1] || 0),
      };
    });

  // Cross-vendor comparison: group by category
  const categoryVendors = {};
  for (const p of profiles) {
    for (const cat of p.categories) {
      if (!categoryVendors[cat]) categoryVendors[cat] = [];
      categoryVendors[cat].push({ vendor: p.vendor_name, avg_amount: p.avg_invoice_amount, total: p.total_spend, count: p.invoice_count });
    }
  }
  for (const cat of Object.keys(categoryVendors)) {
    categoryVendors[cat].sort((a, b) => a.avg_amount - b.avg_amount);
  }

  // Concentration risk
  const top5Spend = profiles.slice(0, 5).reduce((s, p) => s + p.total_spend, 0);
  const concentrationRisk = totalSpend > 0 ? Math.round((top5Spend / totalSpend) * 100) : 0;

  return {
    period: `Last 12 months (since ${since})`,
    total_vendors_analyzed: profiles.length,
    total_spend: Math.round(totalSpend),
    concentration_risk_top5_pct: concentrationRisk,
    vendor_profiles: profiles,
    category_comparison: categoryVendors,
  };
}

const VENDOR_INTEL_PROMPT = `You are a procurement intelligence analyst. Analyze vendor data and provide strategic insights.

For each vendor in the top 10 by spend, provide:
1. A reliability/risk score (0-100, higher = better)
2. Key observation about pricing trend
3. Whether there are cheaper alternatives in the same category

Also provide overall portfolio insights:
- Vendor concentration risk assessment
- Opportunities for consolidation or renegotiation
- Price trend warnings

Return JSON:
{
  "vendor_scores": [
    {
      "vendor_name": "string",
      "reliability_score": number,
      "risk_factors": ["factor 1"],
      "opportunities": ["opportunity 1"],
      "price_assessment": "stable|rising|falling — with detail"
    }
  ],
  "portfolio_insights": [
    { "title": "short title", "detail": "explanation with specifics", "priority": "high|medium|low" }
  ],
  "consolidation_opportunities": ["opportunity with vendor names and potential savings"],
  "overall_health": "healthy|moderate_risk|high_risk",
  "narrative": "2-paragraph executive summary"
}

Return ONLY the JSON.`;

export async function analyzeVendors() {
  const data = await gatherVendorData();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: VENDOR_INTEL_PROMPT },
      { role: 'user', content: `Analyze this vendor intelligence data:\n\n${JSON.stringify(data, null, 2)}` },
    ],
    max_tokens: 3000,
    temperature: 0.25,
  });

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  let analysis;
  try {
    analysis = JSON.parse(raw);
  } catch {
    analysis = {
      vendor_scores: [],
      portfolio_insights: [],
      consolidation_opportunities: [],
      overall_health: 'unknown',
      narrative: raw,
    };
  }

  return {
    generated_at: new Date().toISOString(),
    data_summary: {
      total_vendors: data.total_vendors_analyzed,
      total_spend: data.total_spend,
      concentration_risk: data.concentration_risk_top5_pct,
      period: data.period,
    },
    vendor_profiles: data.vendor_profiles,
    ai_analysis: analysis,
  };
}
