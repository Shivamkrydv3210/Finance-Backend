import { supabase } from '../../db.js';
import { getPeriodForDate } from '../ledger/periodService.js';
import { getAccountsByCodes, expenseAccountCodeForCategory } from '../ledger/accountService.js';
import { createJournalEntry } from '../ledger/journalService.js';
import { getExpenseRule, VAT_GL_ACCOUNTS } from '../../knowledge/uk-tax/index.js';

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Splits a VAT amount into its recoverable and irrecoverable portions per the
 * knowledge base's expense rule (VAT Notice 700/64, 700/65 — client entertainment
 * and car purchases are fully blocked; car leases are 50% blocked). With no rule
 * (no expense_category set on the invoice), everything is treated as recoverable,
 * matching the previous behaviour for invoices that predate this classification.
 */
function splitVatRecovery(vatAmount, expenseRule) {
  const amt = money(vatAmount);
  if (!expenseRule) return { recoverable: amt, irrecoverable: 0 };
  if (expenseRule.vat_partial_recovery_pct != null) {
    const recoverable = money(amt * (expenseRule.vat_partial_recovery_pct / 100));
    return { recoverable, irrecoverable: money(amt - recoverable) };
  }
  if (expenseRule.vat_recoverable === false) return { recoverable: 0, irrecoverable: amt };
  return { recoverable: amt, irrecoverable: 0 };
}

/**
 * Post supplier invoice to ledger (idempotent on invoice_id).
 * @param {number} invoiceId
 * @param {object} invoiceRow - invoice_header row fields
 * @param {{ actor?: string, autoApprove?: boolean }} [opts]
 */
export async function postInvoiceToLedger(invoiceId, invoiceRow, opts = {}) {
  const { data: existing } = await supabase
    .from('invoice_header')
    .select('journal_entry_id, ledger_posted_at')
    .eq('invoice_id', invoiceId)
    .single();

  if (existing?.journal_entry_id && existing?.ledger_posted_at) {
    return { skipped: true, journal_entry_id: existing.journal_entry_id, reason: 'already_posted' };
  }

  const { data: dupJe } = await supabase
    .from('journal_entries')
    .select('journal_entry_id')
    .eq('source_type', 'invoice')
    .eq('source_ref', String(invoiceId))
    .maybeSingle();
  if (dupJe?.journal_entry_id) {
    await supabase
      .from('invoice_header')
      .update({
        journal_entry_id: dupJe.journal_entry_id,
        ledger_posted_at: new Date().toISOString(),
        posting_error: null,
      })
      .eq('invoice_id', invoiceId);
    return { skipped: true, journal_entry_id: dupJe.journal_entry_id, reason: 'idempotent' };
  }

  const period = await getPeriodForDate(invoiceRow.invoice_date);
  if (period.status === 'locked') {
    await supabase.from('invoice_header').update({ posting_error: 'Period locked' }).eq('invoice_id', invoiceId);
    throw new Error('Fiscal period is locked for invoice date');
  }

  const expenseCode = expenseAccountCodeForCategory(invoiceRow.category);
  const expenseRule = invoiceRow.expense_category ? getExpenseRule(invoiceRow.expense_category) : null;
  const {
    '2000': ap,
    [VAT_GL_ACCOUNTS.input_recoverable]: taxAcc,
    [VAT_GL_ACCOUNTS.irrecoverable]: blockedAcc,
    [expenseCode]: expenseAcc,
  } = await getAccountsByCodes(['2000', VAT_GL_ACCOUNTS.input_recoverable, VAT_GL_ACCOUNTS.irrecoverable, expenseCode]);

  if (!ap || !expenseAcc) {
    throw new Error('Default GL accounts missing — run schema 06_seed_default_accounts.sql');
  }

  const total = money(invoiceRow.total_amount);
  const tax = money(invoiceRow.tax_amount || 0);
  const subRaw = invoiceRow.subtotal != null ? money(invoiceRow.subtotal) : money(total - tax);
  const sub = subRaw > 0 ? subRaw : Math.max(0, money(total - tax));
  const currency = invoiceRow.currency || 'GBP';

  const { data: vatLines } = await supabase
    .from('invoice_vat_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('vat_line_id');

  const lines = [];
  let lineNo = 1;

  if (vatLines && vatLines.length > 0) {
    // Multi-rate path: one expense line + (if any VAT) one VAT line per rate bucket,
    // tagged with the real rate/amount extracted — not a rate back-computed from totals.
    for (const vl of vatLines) {
      const net = money(vl.net_amount);
      const vatAmt = money(vl.vat_amount);
      if (net > 0) {
        lines.push({
          line_no: lineNo++,
          account_id: expenseAcc.account_id,
          debit: net,
          credit: 0,
          description: `Expense (${vl.rate_type} ${vl.rate_pct}%) — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
          tax_scheme: `uk_vat_${vl.rate_type}`,
          tax_rate: vl.rate_pct,
          tax_amount: vatAmt,
          party_type: 'vendor',
          party_id: invoiceRow.vendor_id,
          currency_code: currency,
        });
      }
      const { recoverable, irrecoverable } = splitVatRecovery(vatAmt, expenseRule);
      if (recoverable > 0 && taxAcc) {
        lines.push({
          line_no: lineNo++,
          account_id: taxAcc.account_id,
          debit: recoverable,
          credit: 0,
          description: `Input VAT (${vl.rate_type} ${vl.rate_pct}%) — ${invoiceRow.invoice_number}`,
          tax_scheme: `uk_vat_${vl.rate_type}`,
          tax_rate: vl.rate_pct,
          tax_amount: recoverable,
          party_type: 'vendor',
          party_id: invoiceRow.vendor_id,
          currency_code: currency,
        });
      }
      if (irrecoverable > 0 && blockedAcc) {
        lines.push({
          line_no: lineNo++,
          account_id: blockedAcc.account_id,
          debit: irrecoverable,
          credit: 0,
          description: `Irrecoverable VAT (${expenseRule?.label || vl.rate_type} ${vl.rate_pct}%) — ${invoiceRow.invoice_number}`,
          tax_scheme: 'uk_vat_blocked',
          tax_rate: vl.rate_pct,
          tax_amount: irrecoverable,
          party_type: 'vendor',
          party_id: invoiceRow.vendor_id,
          currency_code: currency,
        });
      }
    }
    if (lines.length === 0) {
      lines.push({
        line_no: lineNo++,
        account_id: expenseAcc.account_id,
        debit: total,
        credit: 0,
        description: `Expense — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
        party_type: 'vendor',
        party_id: invoiceRow.vendor_id,
        currency_code: currency,
      });
    }
  } else if (tax > 0 && taxAcc) {
    lines.push({
      line_no: lineNo++,
      account_id: expenseAcc.account_id,
      debit: sub,
      credit: 0,
      description: `Expense — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
      tax_scheme: 'standard_vat_input',
      tax_rate: sub > 0 ? money((tax / sub) * 100) : null,
      tax_amount: tax,
      party_type: 'vendor',
      party_id: invoiceRow.vendor_id,
      currency_code: currency,
    });
    const { recoverable, irrecoverable } = splitVatRecovery(tax, expenseRule);
    if (recoverable > 0 && taxAcc) {
      lines.push({
        line_no: lineNo++,
        account_id: taxAcc.account_id,
        debit: recoverable,
        credit: 0,
        description: `Input tax — ${invoiceRow.invoice_number}`,
        tax_scheme: 'standard_vat_input',
        tax_amount: recoverable,
        party_type: 'vendor',
        party_id: invoiceRow.vendor_id,
        currency_code: currency,
      });
    }
    if (irrecoverable > 0 && blockedAcc) {
      lines.push({
        line_no: lineNo++,
        account_id: blockedAcc.account_id,
        debit: irrecoverable,
        credit: 0,
        description: `Irrecoverable VAT (${expenseRule?.label || 'blocked'}) — ${invoiceRow.invoice_number}`,
        tax_scheme: 'uk_vat_blocked',
        tax_amount: irrecoverable,
        party_type: 'vendor',
        party_id: invoiceRow.vendor_id,
        currency_code: currency,
      });
    }
  } else {
    lines.push({
      line_no: lineNo++,
      account_id: expenseAcc.account_id,
      debit: total,
      credit: 0,
      description: `Expense — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
      party_type: 'vendor',
      party_id: invoiceRow.vendor_id,
      currency_code: currency,
    });
  }

  // Credit AP with the actual sum of the debit lines just built, not the invoice's stated
  // total — per-rate amounts are each rounded to 2dp independently, so summing them can
  // drift a cent from the label. verifyVatArithmetic() already confirmed that sum is within
  // tolerance of the stated total before this invoice was allowed to auto-post; crediting the
  // real sum guarantees the journal balances exactly regardless of that rounding.
  const debitTotal = money(lines.reduce((s, l) => s + (l.debit || 0), 0));
  lines.push({
    line_no: lineNo++,
    account_id: ap.account_id,
    debit: 0,
    credit: debitTotal > 0 ? debitTotal : total,
    description: `AP — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
    party_type: 'vendor',
    party_id: invoiceRow.vendor_id,
    currency_code: currency,
  });

  const autoApprove = opts.autoApprove !== false;
  const result = await createJournalEntry(
    {
      entry_date: invoiceRow.invoice_date,
      description: `Supplier invoice ${invoiceRow.invoice_number}`,
      source_type: 'invoice',
      source_ref: String(invoiceId),
      reference: invoiceRow.invoice_number,
      period_id: period.period_id,
      created_by: opts.actor || 'invoice_import',
      lines,
    },
    { skipApproval: autoApprove }
  );

  const jeId = result.journal_entry.journal_entry_id;
  const now = new Date().toISOString();
  await supabase
    .from('invoice_header')
    .update({
      journal_entry_id: jeId,
      ledger_posted_at: result.journal_entry.status === 'posted' ? now : null,
      posting_error: null,
    })
    .eq('invoice_id', invoiceId);

  return { skipped: false, journal_entry_id: jeId, lines: result.lines };
}
