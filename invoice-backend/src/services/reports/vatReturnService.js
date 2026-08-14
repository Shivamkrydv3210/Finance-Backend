/**
 * UK VAT Return (Boxes 1–9) computed from the posted ledger.
 *
 * Every box keeps the journal lines that produced it, so a filed figure can be
 * drilled back to source rather than taken on trust. The derivation rules for
 * each box are returned alongside the numbers in `basis` — a VAT return that
 * cannot explain itself is not much use in an enquiry.
 */
import crypto from 'crypto';
import { supabase } from '../../db.js';
import { loadPostedLines } from './financialReportService.js';
import { VAT_GL_ACCOUNTS, getVatAdminRules } from '../../knowledge/uk-tax/index.js';

/** The VAT control accounts themselves — never part of a net sales/purchases value. */
const VAT_ACCOUNT_CODES = new Set(Object.values(VAT_GL_ACCOUNTS));

/** The Corporation Tax charge is not a purchase, so it stays out of Box 7. */
const CT_CHARGE_ACCOUNT_CODE = '8000';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isFixedAsset(account) {
  return String(account?.statutory_heading || '').startsWith('Fixed assets');
}

/**
 * Box 7 counts the net value of what was bought: trading expenses plus capital
 * additions. Irrecoverable VAT (posted to 6250) is excluded because it is VAT,
 * not the net value of a supply, even though it lands in an expense account.
 */
function countsTowardPurchases(account) {
  const code = account?.code;
  if (!code || VAT_ACCOUNT_CODES.has(code) || code === CT_CHARGE_ACCOUNT_CODE) return false;
  if (account.account_type === 'expense') return true;
  return account.account_type === 'asset' && isFixedAsset(account);
}

function contribution(line, amount) {
  return {
    journal_line_id: line.journal_line_id,
    journal_entry_id: line.journal_entry_id,
    account_code: line.account?.code ?? null,
    tax_scheme: line.tax_scheme ?? null,
    amount: round2(amount),
    entry_date: line.entry_date ?? null,
    description: line.description ?? null,
  };
}

/**
 * Computes the nine VAT return boxes for a period.
 * @param {string} fromDate - YYYY-MM-DD inclusive
 * @param {string} toDate - YYYY-MM-DD inclusive
 */
export async function computeVatReturn(fromDate, toDate) {
  const lines = await loadPostedLines(fromDate, toDate);

  const boxes = { box_1: 0, box_2: 0, box_3: 0, box_4: 0, box_5: 0, box_6: 0, box_7: 0, box_8: 0, box_9: 0 };
  const contributions = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

  for (const line of lines) {
    const account = line.account;
    const code = account?.code;
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (code === VAT_GL_ACCOUNTS.output_payable) {
      const outputVat = credit - debit;
      if (outputVat !== 0) {
        boxes.box_1 += outputVat;
        contributions[1].push(contribution(line, outputVat));
      }
      continue;
    }

    if (code === VAT_GL_ACCOUNTS.input_recoverable) {
      const inputVat = debit - credit;
      if (inputVat !== 0) {
        boxes.box_4 += inputVat;
        contributions[4].push(contribution(line, inputVat));
      }
      continue;
    }

    if (account?.account_type === 'revenue') {
      const netSales = credit - debit;
      if (netSales !== 0) {
        boxes.box_6 += netSales;
        contributions[6].push(contribution(line, netSales));
      }
      continue;
    }

    if (countsTowardPurchases(account)) {
      const netPurchases = debit - credit;
      if (netPurchases !== 0) {
        boxes.box_7 += netPurchases;
        contributions[7].push(contribution(line, netPurchases));
      }
    }
  }

  boxes.box_1 = round2(boxes.box_1);
  boxes.box_4 = round2(boxes.box_4);
  boxes.box_6 = round2(boxes.box_6);
  boxes.box_7 = round2(boxes.box_7);
  boxes.box_3 = round2(boxes.box_1 + boxes.box_2);
  boxes.box_5 = round2(boxes.box_3 - boxes.box_4);

  const content_hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ from: fromDate, to: toDate, ...boxes }))
    .digest('hex');

  return {
    report: 'vat_return',
    period: { from: fromDate, to: toDate },
    currency: 'GBP',
    boxes,
    net_position: boxes.box_5 >= 0 ? 'payable_to_hmrc' : 'reclaim_from_hmrc',
    net_amount: Math.abs(boxes.box_5),
    contributions,
    line_counts: Object.fromEntries(Object.entries(contributions).map(([box, rows]) => [box, rows.length])),
    basis: BOX_BASIS,
    unsupported_boxes: UNSUPPORTED_BOXES,
    mtd: getVatAdminRules().making_tax_digital ?? null,
    content_hash,
    computed_at: new Date().toISOString(),
  };
}

/** How each box was derived — returned with every computation so the figures are auditable. */
const BOX_BASIS = {
  box_1: `VAT due on sales: net credits on VAT output account ${VAT_GL_ACCOUNTS.output_payable}.`,
  box_2: 'VAT due on acquisitions from Northern Ireland: not derivable from the ledger — no acquisition data is captured.',
  box_3: 'Total VAT due: Box 1 + Box 2.',
  box_4: `VAT reclaimed on purchases: net debits on VAT input account ${VAT_GL_ACCOUNTS.input_recoverable}. Blocked input VAT is excluded automatically because it is posted to ${VAT_GL_ACCOUNTS.irrecoverable} (Irrecoverable VAT) at posting time.`,
  box_5: 'Net VAT: Box 3 − Box 4. Positive is payable to HMRC, negative is reclaimable.',
  box_6: 'Total value of sales excluding VAT: net credits on revenue accounts.',
  box_7: `Total value of purchases excluding VAT: net debits on expense accounts and fixed-asset additions, excluding the VAT control accounts and the Corporation Tax charge (${CT_CHARGE_ACCOUNT_CODE}).`,
  box_8: 'Value of dispatches to Northern Ireland: not derivable from the ledger.',
  box_9: 'Value of acquisitions from Northern Ireland: not derivable from the ledger.',
};

const UNSUPPORTED_BOXES = [
  { box: 2, reason: 'No EU/Northern Ireland acquisition data is captured, so this box is reported as zero.' },
  { box: 8, reason: 'No goods dispatch data is captured, so this box is reported as zero.' },
  { box: 9, reason: 'No goods acquisition data is captured, so this box is reported as zero.' },
];

/**
 * Persists a computed return and its line-level trail, replacing any existing
 * draft for the same period. Finalised returns are never overwritten — a filed
 * return has to stay exactly as it was filed.
 */
export async function saveVatReturn(computed, { notes } = {}) {
  const { from, to } = computed.period;

  const { data: existing } = await supabase
    .from('vat_returns')
    .select('vat_return_id, status')
    .eq('period_from', from)
    .eq('period_to', to)
    .maybeSingle();

  if (existing && existing.status !== 'draft') {
    throw new Error(`VAT return for ${from} to ${to} is already ${existing.status} and cannot be recomputed`);
  }

  const row = {
    period_from: from,
    period_to: to,
    ...computed.boxes,
    status: 'draft',
    content_hash: computed.content_hash,
    computed_at: computed.computed_at,
    notes: notes ?? null,
  };

  const { data: saved, error } = await supabase
    .from('vat_returns')
    .upsert(row, { onConflict: 'period_from,period_to' })
    .select('vat_return_id')
    .single();
  if (error) throw new Error(error.message);

  const returnId = saved.vat_return_id;
  await supabase.from('vat_return_lines').delete().eq('vat_return_id', returnId);

  const lineRows = Object.entries(computed.contributions).flatMap(([box, rows]) =>
    rows.map((r) => ({
      vat_return_id: returnId,
      box: Number(box),
      journal_line_id: r.journal_line_id,
      journal_entry_id: r.journal_entry_id,
      account_code: r.account_code,
      tax_scheme: r.tax_scheme,
      amount: r.amount,
      entry_date: r.entry_date,
      description: r.description,
    }))
  );

  if (lineRows.length) {
    const { error: lineError } = await supabase.from('vat_return_lines').insert(lineRows);
    if (lineError) throw new Error(lineError.message);
  }

  return { vat_return_id: returnId, saved_lines: lineRows.length };
}
