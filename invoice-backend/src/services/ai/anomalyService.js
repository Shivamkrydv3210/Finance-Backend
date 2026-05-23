import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { supabase } from '../../db.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function leadingDigit(n) {
  const s = String(Math.abs(Number(n)));
  for (const c of s) {
    if (c >= '1' && c <= '9') return Number(c);
  }
  return null;
}

function benfordExpected(d) {
  return Math.log10(1 + 1 / d);
}

async function detectAnomalies() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const since = oneYearAgo.toISOString().slice(0, 10);

  const [invoicesRes, bankRes, journalsRes] = await Promise.all([
    supabase
      .from('invoice_header')
      .select('invoice_id, vendor_name, vendor_id, invoice_number, invoice_date, category, total_amount, tax_amount, subtotal, journal_entry_id, source')
      .gte('invoice_date', since)
      .order('invoice_date', { ascending: false })
      .limit(2000),

    supabase
      .from('bank_transactions')
      .select('bank_txn_id, txn_date, amount, description, reconciliation_status')
      .gte('txn_date', since)
      .limit(1000),

    supabase
      .from('journal_entries')
      .select('journal_entry_id, approval_status, status')
      .eq('status', 'posted')
      .limit(1000),
  ]);

  const invoices = invoicesRes.data || [];
  const bankTxns = bankRes.data || [];
  const journals = journalsRes.data || [];
  const findings = [];

  // 1. Duplicate detection: same vendor + similar amount (±2%) + close dates (±7 days)
  const duplicatePairs = [];
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < Math.min(invoices.length, i + 100); j++) {
      const a = invoices[i];
      const b = invoices[j];
      if (a.vendor_name !== b.vendor_name) continue;
      const amtA = Number(a.total_amount);
      const amtB = Number(b.total_amount);
      if (amtA === 0 || amtB === 0) continue;
      const pctDiff = Math.abs(amtA - amtB) / Math.max(amtA, amtB);
      if (pctDiff > 0.02) continue;
      const dayDiff = Math.abs(new Date(a.invoice_date) - new Date(b.invoice_date)) / 86400000;
      if (dayDiff > 7) continue;
      duplicatePairs.push({
        invoice_a: { id: a.invoice_id, number: a.invoice_number, date: a.invoice_date, amount: amtA },
        invoice_b: { id: b.invoice_id, number: b.invoice_number, date: b.invoice_date, amount: amtB },
        vendor: a.vendor_name,
        amount_diff_pct: Math.round(pctDiff * 10000) / 100,
        days_apart: dayDiff,
      });
    }
  }
  if (duplicatePairs.length > 0) {
    findings.push({
      type: 'potential_duplicates',
      severity: 'critical',
      title: `${duplicatePairs.length} potential duplicate invoice pair(s)`,
      items: duplicatePairs.slice(0, 10),
      count: duplicatePairs.length,
    });
  }

  // 2. Round-number invoices (exact multiples of 1000, above 5000)
  const roundInvoices = invoices.filter((i) => {
    const amt = Number(i.total_amount);
    return amt >= 5000 && amt % 1000 === 0;
  });
  if (roundInvoices.length > 0) {
    findings.push({
      type: 'round_number_amounts',
      severity: 'warning',
      title: `${roundInvoices.length} invoices with suspiciously round amounts`,
      items: roundInvoices.slice(0, 15).map((i) => ({
        invoice_id: i.invoice_id,
        vendor: i.vendor_name,
        amount: Number(i.total_amount),
        date: i.invoice_date,
      })),
      count: roundInvoices.length,
    });
  }

  // 3. Weekend-dated invoices
  const weekendInvoices = invoices.filter((i) => {
    const d = new Date(i.invoice_date + 'T12:00:00');
    const day = d.getDay();
    return day === 0 || day === 6;
  });
  if (weekendInvoices.length > 0) {
    findings.push({
      type: 'weekend_dated',
      severity: 'info',
      title: `${weekendInvoices.length} invoices dated on weekends`,
      items: weekendInvoices.slice(0, 10).map((i) => ({
        invoice_id: i.invoice_id,
        vendor: i.vendor_name,
        amount: Number(i.total_amount),
        date: i.invoice_date,
        day_of_week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(i.invoice_date + 'T12:00:00').getDay()],
      })),
      count: weekendInvoices.length,
    });
  }

  // 4. Price spikes: vendor+category avg vs individual invoice (>50% above avg)
  const vendorCatAvg = {};
  for (const inv of invoices) {
    const key = `${inv.vendor_name}||${inv.category}`;
    if (!vendorCatAvg[key]) vendorCatAvg[key] = { amounts: [], vendor: inv.vendor_name, category: inv.category };
    vendorCatAvg[key].amounts.push(Number(inv.total_amount));
  }
  const priceSpikes = [];
  for (const [, group] of Object.entries(vendorCatAvg)) {
    if (group.amounts.length < 3) continue;
    const avg = group.amounts.reduce((s, a) => s + a, 0) / group.amounts.length;
    for (const inv of invoices) {
      if (inv.vendor_name !== group.vendor || inv.category !== group.category) continue;
      const amt = Number(inv.total_amount);
      if (amt > avg * 1.5 && amt - avg > 2000) {
        priceSpikes.push({
          invoice_id: inv.invoice_id,
          vendor: inv.vendor_name,
          category: inv.category,
          amount: amt,
          average: Math.round(avg),
          spike_pct: Math.round(((amt - avg) / avg) * 100),
          date: inv.invoice_date,
        });
      }
    }
  }
  if (priceSpikes.length > 0) {
    findings.push({
      type: 'price_spikes',
      severity: 'warning',
      title: `${priceSpikes.length} invoices with amounts 50%+ above vendor average`,
      items: priceSpikes.slice(0, 15),
      count: priceSpikes.length,
    });
  }

  // 5. Missing fields
  const { data: vendors } = await supabase.from('vendors').select('id, vendor_name, vendor_email, vendor_phone, vendor_address').limit(500);
  const incompleteVendors = (vendors || []).filter((v) => !v.vendor_address || !v.vendor_email);
  if (incompleteVendors.length > 0) {
    findings.push({
      type: 'incomplete_vendor_records',
      severity: 'info',
      title: `${incompleteVendors.length} vendors with missing contact/address info`,
      items: incompleteVendors.slice(0, 10).map((v) => ({
        vendor_id: v.id,
        name: v.vendor_name,
        missing: [!v.vendor_email && 'email', !v.vendor_address && 'address', !v.vendor_phone && 'phone'].filter(Boolean),
      })),
      count: incompleteVendors.length,
    });
  }

  // 6. Benford's Law analysis
  const digitCounts = {};
  let digitTotal = 0;
  for (const inv of invoices) {
    const d = leadingDigit(inv.total_amount);
    if (d) {
      digitCounts[d] = (digitCounts[d] || 0) + 1;
      digitTotal++;
    }
  }
  if (digitTotal >= 50) {
    let chiSquare = 0;
    const benfordResult = {};
    for (let d = 1; d <= 9; d++) {
      const observed = (digitCounts[d] || 0) / digitTotal;
      const expected = benfordExpected(d);
      chiSquare += Math.pow(observed - expected, 2) / expected;
      benfordResult[d] = { observed_pct: Math.round(observed * 1000) / 10, expected_pct: Math.round(expected * 1000) / 10 };
    }
    if (chiSquare > 0.03) {
      findings.push({
        type: 'benfords_law_deviation',
        severity: chiSquare > 0.08 ? 'warning' : 'info',
        title: "Invoice amounts deviate from Benford's Law distribution",
        description: `Chi-square statistic: ${Math.round(chiSquare * 1000) / 1000}. Higher values indicate potential manipulation of amounts.`,
        digit_distribution: benfordResult,
        chi_square: Math.round(chiSquare * 1000) / 1000,
        sample_size: digitTotal,
      });
    }
  }

  // 7. Orphan bank transactions (unmatched for >30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oldUnmatched = bankTxns.filter((t) => t.reconciliation_status === 'unmatched' && new Date(t.txn_date) < thirtyDaysAgo);
  if (oldUnmatched.length > 0) {
    findings.push({
      type: 'orphan_bank_transactions',
      severity: 'warning',
      title: `${oldUnmatched.length} unreconciled bank transactions older than 30 days`,
      items: oldUnmatched.slice(0, 10).map((t) => ({
        bank_txn_id: t.bank_txn_id,
        date: t.txn_date,
        amount: Number(t.amount),
        description: t.description,
      })),
      count: oldUnmatched.length,
    });
  }

  // 8. Invoices without ledger posting
  const unposted = invoices.filter((i) => !i.journal_entry_id);
  if (unposted.length > 0) {
    findings.push({
      type: 'unposted_invoices',
      severity: 'warning',
      title: `${unposted.length} invoices not posted to the ledger`,
      items: unposted.slice(0, 10).map((i) => ({
        invoice_id: i.invoice_id,
        vendor: i.vendor_name,
        amount: Number(i.total_amount),
        date: i.invoice_date,
      })),
      count: unposted.length,
    });
  }

  return findings;
}

const ANOMALY_NARRATOR_PROMPT = `You are a forensic accountant reviewing anomaly findings from an automated audit system. For each finding category, provide:
1. A clear risk assessment
2. Why this matters (fraud risk, compliance, financial impact)
3. Recommended immediate action

Format as JSON array: [{ "finding_type": "string", "risk_level": "critical|high|medium|low", "explanation": "why this matters", "recommendation": "what to do next", "impact_summary": "one line" }]

Be specific and reference the actual numbers. Return ONLY the JSON array.`;

export async function runAnomalyDetection() {
  const findings = await detectAnomalies();

  if (findings.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      status: 'clean',
      findings: [],
      ai_analysis: [],
      summary: 'No anomalies detected in the current dataset.',
    };
  }

  const summaryForAI = findings.map((f) => ({
    type: f.type,
    severity: f.severity,
    title: f.title,
    count: f.count || (f.items || []).length,
    sample: (f.items || []).slice(0, 5),
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ANOMALY_NARRATOR_PROMPT },
      { role: 'user', content: `Analyze these anomaly findings and provide risk assessment:\n\n${JSON.stringify(summaryForAI, null, 2)}` },
    ],
    max_tokens: 2000,
    temperature: 0.15,
  });

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  let aiAnalysis;
  try {
    aiAnalysis = JSON.parse(raw);
  } catch {
    aiAnalysis = [{ finding_type: 'general', risk_level: 'medium', explanation: raw, recommendation: 'Review findings manually.', impact_summary: 'See details' }];
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  return {
    generated_at: new Date().toISOString(),
    status: criticalCount > 0 ? 'critical' : warningCount > 0 ? 'attention_needed' : 'minor_issues',
    findings,
    ai_analysis: aiAnalysis,
    summary: `Found ${findings.length} anomaly categories: ${criticalCount} critical, ${warningCount} warnings, ${findings.length - criticalCount - warningCount} informational.`,
  };
}
