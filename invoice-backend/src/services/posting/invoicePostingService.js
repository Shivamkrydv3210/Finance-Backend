import { supabase } from '../../db.js';
import { getPeriodForDate } from '../ledger/periodService.js';
import { getAccountByCode, expenseAccountCodeForCategory } from '../ledger/accountService.js';
import { createJournalEntry } from '../ledger/journalService.js';

function money(n) {
  return Math.round(Number(n) * 100) / 100;
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

  const ap = await getAccountByCode('2000');
  const expenseCode = expenseAccountCodeForCategory(invoiceRow.category);
  const expenseAcc = await getAccountByCode(expenseCode);
  const taxAcc = await getAccountByCode('1310');

  if (!ap || !expenseAcc) {
    throw new Error('Default GL accounts missing — run schema 06_seed_default_accounts.sql');
  }

  const total = money(invoiceRow.total_amount);
  const tax = money(invoiceRow.tax_amount || 0);
  const subRaw = invoiceRow.subtotal != null ? money(invoiceRow.subtotal) : money(total - tax);
  const sub = subRaw > 0 ? subRaw : Math.max(0, money(total - tax));

  const lines = [];
  let lineNo = 1;

  if (tax > 0 && taxAcc) {
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
      currency_code: invoiceRow.currency || 'INR',
    });
    lines.push({
      line_no: lineNo++,
      account_id: taxAcc.account_id,
      debit: tax,
      credit: 0,
      description: `Input tax — ${invoiceRow.invoice_number}`,
      tax_scheme: 'standard_vat_input',
      party_type: 'vendor',
      party_id: invoiceRow.vendor_id,
      currency_code: invoiceRow.currency || 'INR',
    });
  } else {
    lines.push({
      line_no: lineNo++,
      account_id: expenseAcc.account_id,
      debit: total,
      credit: 0,
      description: `Expense — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
      party_type: 'vendor',
      party_id: invoiceRow.vendor_id,
      currency_code: invoiceRow.currency || 'INR',
    });
  }

  lines.push({
    line_no: lineNo++,
    account_id: ap.account_id,
    debit: 0,
    credit: total,
    description: `AP — ${invoiceRow.vendor_name || ''} #${invoiceRow.invoice_number}`,
    party_type: 'vendor',
    party_id: invoiceRow.vendor_id,
    currency_code: invoiceRow.currency || 'INR',
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
