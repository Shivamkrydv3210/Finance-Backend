import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config.js';
import { supabase } from '../../db.js';
import { getRecordKeepingRules, getFilingDeadlines, getCtDeadlines, getVatAdminRules, getKnowledgeSummary } from '../../knowledge/uk-tax/index.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// A materiality threshold is a judgment call, not itself a statutory figure — £1,000
// is a reasonable working level for a small UK business's supporting-documentation
// check; adjust per engagement.
const DOCUMENTATION_MATERIALITY_GBP = 1000;
const TAX_COMPLETENESS_MATERIALITY_GBP = 500;

async function runComplianceChecks() {
  const checks = [];

  // 1. Unbalanced periods — posted journals where sum(debit) != sum(credit)
  const { data: periods } = await supabase.from('fiscal_periods').select('*').order('start_date', { ascending: false }).limit(24);
  const periodIssues = [];
  for (const p of (periods || []).slice(0, 12)) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('journal_entry_id')
      .eq('period_id', p.period_id)
      .eq('status', 'posted');
    if (!entries?.length) continue;
    const jeIds = entries.map((e) => e.journal_entry_id);
    const { data: lines } = await supabase.from('journal_lines').select('debit, credit').in('journal_entry_id', jeIds);
    const totalDebit = (lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = (lines || []).reduce((s, l) => s + Number(l.credit || 0), 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      periodIssues.push({
        period: `${p.period_year}-${String(p.period_month).padStart(2, '0')}`,
        period_id: p.period_id,
        debit_total: Math.round(totalDebit * 100) / 100,
        credit_total: Math.round(totalCredit * 100) / 100,
        imbalance: Math.round(diff * 100) / 100,
      });
    }
  }
  checks.push({
    check_id: 'balanced_periods',
    title: 'Period Balance Check',
    description: 'All posted journals in each period should have equal debits and credits',
    status: periodIssues.length === 0 ? 'pass' : 'fail',
    severity: periodIssues.length > 0 ? 'critical' : 'ok',
    items: periodIssues,
    count: periodIssues.length,
  });

  // 2. Unreconciled bank transactions > 30 days old
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: oldUnmatched, count: unmatchedCount } = await supabase
    .from('bank_transactions')
    .select('bank_txn_id, txn_date, amount, description', { count: 'exact' })
    .eq('reconciliation_status', 'unmatched')
    .lt('txn_date', thirtyDaysAgo.toISOString().slice(0, 10))
    .limit(20);
  checks.push({
    check_id: 'bank_reconciliation',
    title: 'Bank Reconciliation Timeliness',
    description: 'All bank transactions should be reconciled within 30 days',
    status: (unmatchedCount || 0) === 0 ? 'pass' : 'warning',
    severity: (unmatchedCount || 0) > 10 ? 'high' : (unmatchedCount || 0) > 0 ? 'medium' : 'ok',
    items: (oldUnmatched || []).map((t) => ({ bank_txn_id: t.bank_txn_id, date: t.txn_date, amount: Number(t.amount), description: t.description })),
    count: unmatchedCount || 0,
  });

  // 3. Invoices without supporting documents
  const { data: allInvoices } = await supabase.from('invoice_header').select('invoice_id, vendor_name, total_amount, invoice_date').limit(500);
  const invIds = (allInvoices || []).map((i) => i.invoice_id);
  const { data: attachments } = await supabase
    .from('document_attachments')
    .select('entity_id')
    .eq('entity_type', 'invoice_header')
    .in('entity_id', invIds.map(String));
  const attachedInvIds = new Set((attachments || []).map((a) => String(a.entity_id)));
  const unattached = (allInvoices || []).filter((i) => !attachedInvIds.has(String(i.invoice_id)));
  const highValueUnattached = unattached.filter((i) => Number(i.total_amount) > DOCUMENTATION_MATERIALITY_GBP);
  checks.push({
    check_id: 'document_support',
    title: 'Supporting Documentation',
    description: `Invoices above £${DOCUMENTATION_MATERIALITY_GBP.toLocaleString()} should have attached supporting documents (Companies Act 2006 ss.386-388: records must be sufficient to explain the company's transactions)`,
    status: highValueUnattached.length === 0 ? 'pass' : 'warning',
    severity: highValueUnattached.length > 20 ? 'high' : highValueUnattached.length > 0 ? 'medium' : 'ok',
    items: highValueUnattached.slice(0, 15).map((i) => ({ invoice_id: i.invoice_id, vendor: i.vendor_name, amount: Number(i.total_amount), date: i.invoice_date })),
    count: highValueUnattached.length,
  });

  // 4. Missing tax info on invoices above threshold
  const { data: bigNoTax } = await supabase
    .from('invoice_header')
    .select('invoice_id, vendor_name, total_amount, invoice_date, category')
    .gt('total_amount', TAX_COMPLETENESS_MATERIALITY_GBP)
    .or('tax_amount.is.null,tax_amount.eq.0')
    .limit(30);
  checks.push({
    check_id: 'tax_completeness',
    title: 'Tax Information Completeness',
    description: `Invoices above £${TAX_COMPLETENESS_MATERIALITY_GBP.toLocaleString()} should have VAT recorded (or be genuinely zero-rated/exempt — see VAT Notice 700)`,
    status: (bigNoTax || []).length === 0 ? 'pass' : 'warning',
    severity: (bigNoTax || []).length > 10 ? 'high' : (bigNoTax || []).length > 0 ? 'medium' : 'ok',
    items: (bigNoTax || []).slice(0, 15).map((i) => ({ invoice_id: i.invoice_id, vendor: i.vendor_name, amount: Number(i.total_amount), date: i.invoice_date })),
    count: (bigNoTax || []).length,
  });

  // 5. Open month-end tasks for past periods
  const pastPeriods = (periods || []).filter((p) => {
    const endDate = new Date(p.end_date);
    return endDate < new Date() && p.status !== 'locked';
  });
  const openTaskIssues = [];
  for (const p of pastPeriods.slice(0, 6)) {
    const { data: tasks } = await supabase.from('month_end_tasks').select('task_id, title, is_done').eq('period_id', p.period_id);
    const incomplete = (tasks || []).filter((t) => !t.is_done);
    if (incomplete.length > 0) {
      openTaskIssues.push({
        period: `${p.period_year}-${String(p.period_month).padStart(2, '0')}`,
        status: p.status,
        incomplete_tasks: incomplete.map((t) => t.title),
        count: incomplete.length,
      });
    }
  }
  checks.push({
    check_id: 'month_end_close',
    title: 'Month-End Close Completion',
    description: 'Past periods should have all month-end tasks completed',
    status: openTaskIssues.length === 0 ? 'pass' : 'warning',
    severity: openTaskIssues.length > 3 ? 'high' : openTaskIssues.length > 0 ? 'medium' : 'ok',
    items: openTaskIssues,
    count: openTaskIssues.length,
  });

  // 6. Invoice numbering gaps
  const { data: invNumbers } = await supabase
    .from('invoice_header')
    .select('invoice_number, vendor_name')
    .order('invoice_number')
    .limit(1000);
  const numericInvs = (invNumbers || [])
    .map((i) => ({ num: parseInt(i.invoice_number?.replace(/[^0-9]/g, ''), 10), raw: i.invoice_number, vendor: i.vendor_name }))
    .filter((i) => !isNaN(i.num))
    .sort((a, b) => a.num - b.num);
  const gaps = [];
  for (let i = 1; i < numericInvs.length && gaps.length < 10; i++) {
    const diff = numericInvs[i].num - numericInvs[i - 1].num;
    if (diff > 1 && diff < 100) {
      gaps.push({ after: numericInvs[i - 1].raw, before: numericInvs[i].raw, missing_count: diff - 1 });
    }
  }
  checks.push({
    check_id: 'invoice_numbering',
    title: 'Invoice Numbering Sequence',
    description: 'Invoice numbers should be sequential without gaps',
    status: gaps.length === 0 ? 'pass' : 'info',
    severity: gaps.length > 5 ? 'medium' : gaps.length > 0 ? 'low' : 'ok',
    items: gaps,
    count: gaps.length,
  });

  // 7. Fixed assets without depreciation config
  const { data: assets } = await supabase
    .from('fixed_assets')
    .select('asset_id, name, cost, depreciation_method, useful_life_months, gl_accum_dep_account_id, gl_dep_expense_account_id')
    .limit(100);
  const badAssets = (assets || []).filter((a) => !a.useful_life_months || !a.gl_accum_dep_account_id || !a.gl_dep_expense_account_id);
  checks.push({
    check_id: 'fixed_assets_config',
    title: 'Fixed Asset Depreciation Setup',
    description: 'All fixed assets should have depreciation method, useful life, and GL accounts configured',
    status: badAssets.length === 0 ? 'pass' : 'warning',
    severity: badAssets.length > 5 ? 'medium' : badAssets.length > 0 ? 'low' : 'ok',
    items: badAssets.slice(0, 10).map((a) => ({
      asset_id: a.asset_id,
      name: a.name,
      cost: Number(a.cost),
      missing: [!a.useful_life_months && 'useful_life', !a.gl_accum_dep_account_id && 'accum_dep_account', !a.gl_dep_expense_account_id && 'dep_expense_account'].filter(Boolean),
    })),
    count: badAssets.length,
  });

  // 8. Unapproved/draft journal entries
  const { data: draftJournals, count: draftCount } = await supabase
    .from('journal_entries')
    .select('journal_entry_id, entry_date, description, approval_status, status', { count: 'exact' })
    .or('status.eq.draft,approval_status.eq.pending')
    .limit(20);
  checks.push({
    check_id: 'journal_approval',
    title: 'Journal Entry Approvals',
    description: 'All journal entries should be approved and posted',
    status: (draftCount || 0) === 0 ? 'pass' : 'warning',
    severity: (draftCount || 0) > 10 ? 'high' : (draftCount || 0) > 0 ? 'medium' : 'ok',
    items: (draftJournals || []).map((j) => ({
      journal_entry_id: j.journal_entry_id,
      date: j.entry_date,
      description: j.description,
      status: j.status,
      approval: j.approval_status,
    })),
    count: draftCount || 0,
  });

  return checks;
}

const COMPLIANCE_PROMPT = `You are a UK statutory auditor reviewing pre-audit compliance checks. For each failed or warning check, provide:
1. Why this is a compliance risk — reference the specific UK regulation supplied in "uk_reference_rules" (Companies Act 2006 record-keeping, VAT Notice 700/22 Making Tax Digital, Corporation Tax filing deadlines) rather than inventing a citation
2. Potential consequences of not fixing it (e.g. HMRC penalties, Companies House late filing penalties, qualified audit opinion)
3. Step-by-step remediation instructions

Only cite a specific Act, SI or HMRC notice if it appears in "uk_reference_rules" — if none of the supplied rules clearly apply to a check, explain the risk in plain terms without inventing a citation.

Return JSON:
{
  "overall_readiness": "audit_ready|needs_attention|significant_gaps",
  "readiness_score": number (0-100),
  "check_analysis": [
    {
      "check_id": "string",
      "compliance_risk": "explanation referencing regulations",
      "consequence": "what could happen",
      "remediation": ["step 1", "step 2"],
      "priority": "immediate|soon|can_wait"
    }
  ],
  "executive_summary": "2-paragraph summary for management"
}

Return ONLY the JSON.`;

export async function runComplianceAudit() {
  const checks = await runComplianceChecks();

  const failedOrWarning = checks.filter((c) => c.status !== 'pass');
  const passCount = checks.filter((c) => c.status === 'pass').length;

  let aiAnalysis = null;
  if (failedOrWarning.length > 0) {
    const summaryForAI = failedOrWarning.map((c) => ({
      check_id: c.check_id,
      title: c.title,
      description: c.description,
      status: c.status,
      severity: c.severity,
      count: c.count,
      sample: (c.items || []).slice(0, 5),
    }));

    const ukReferenceRules = {
      record_keeping: getRecordKeepingRules(),
      filing_deadlines: getFilingDeadlines(),
      ct_deadlines: getCtDeadlines(),
      vat_admin: getVatAdminRules(),
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COMPLIANCE_PROMPT },
        {
          role: 'user',
          content: `Analyze these compliance check results:\n\n${JSON.stringify(summaryForAI, null, 2)}\n\nuk_reference_rules:\n${JSON.stringify(ukReferenceRules, null, 2)}`,
        },
      ],
      max_tokens: 2500,
      temperature: 0.15,
    });

    let raw = response.choices[0].message.content.trim();
    raw = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

    try {
      aiAnalysis = JSON.parse(raw);
    } catch {
      aiAnalysis = {
        overall_readiness: 'needs_attention',
        readiness_score: 50,
        check_analysis: [],
        executive_summary: raw,
      };
    }
  } else {
    aiAnalysis = {
      overall_readiness: 'audit_ready',
      readiness_score: 100,
      check_analysis: [],
      executive_summary: 'All compliance checks passed. The books are audit-ready.',
    };
  }

  return {
    generated_at: new Date().toISOString(),
    checks,
    summary: {
      total_checks: checks.length,
      passed: passCount,
      failed: checks.filter((c) => c.status === 'fail').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      info: checks.filter((c) => c.status === 'info').length,
    },
    ai_analysis: aiAnalysis,
  };
}
