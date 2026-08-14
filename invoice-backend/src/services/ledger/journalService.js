import { supabase } from '../../db.js';
import { getPeriodForDate } from './periodService.js';

const MAX_JOURNAL_PAGE_SIZE = 200;

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/**
 * @param {object} params
 * @param {string} params.entry_date
 * @param {string} params.description
 * @param {string} params.source_type
 * @param {string|null} params.source_ref
 * @param {number} params.period_id
 * @param {string} [params.created_by]
 * @param {Array<{line_no:number, account_id:number, debit:number, credit:number, description?:string, dimensions?:object, tax_scheme?:string, tax_rate?:number, tax_amount?:number, party_type?:string, party_id?:number, currency_code?:string}>} params.lines
 * @param {{ skipApproval?: boolean }} [opts]
 */
export async function createJournalEntry(params, opts = {}) {
  const lines = params.lines || [];
  let debitSum = 0;
  let creditSum = 0;
  for (const ln of lines) {
    debitSum += round4(ln.debit || 0);
    creditSum += round4(ln.credit || 0);
  }
  if (Math.abs(round4(debitSum - creditSum)) > 0.009) {
    throw new Error(`Journal not balanced: debits ${debitSum} credits ${creditSum}`);
  }
  if (lines.length === 0) throw new Error('Journal must have at least one line');

  const approval_status = opts.skipApproval !== false ? 'approved' : 'pending';
  const now = new Date().toISOString();

  const { data: period, error: pe } = await supabase
    .from('fiscal_periods')
    .select('status')
    .eq('period_id', params.period_id)
    .single();
  if (pe) throw new Error(pe.message);
  if (period.status === 'locked') throw new Error('Period is locked; cannot post journals');

  const insertRow = {
    entry_date: params.entry_date,
    description: params.description || null,
    source_type: params.source_type || 'manual',
    source_ref: params.source_ref ?? null,
    reference: params.reference || null,
    period_id: params.period_id,
    status: 'draft',
    approval_status,
    created_by: params.created_by || 'system',
    approved_by: approval_status === 'approved' ? (params.created_by || 'system') : null,
    approved_at: approval_status === 'approved' ? now : null,
  };

  const initialStatus = approval_status === 'approved' ? 'posted' : 'draft';
  const insertRowFull = {
    ...insertRow,
    status: initialStatus,
    posted_at: approval_status === 'approved' ? now : null,
  };

  const { data: je, error: jeErr } = await supabase.from('journal_entries').insert(insertRowFull).select().single();
  if (jeErr) {
    if (jeErr.code === '23505') throw new Error('Duplicate journal for this source (idempotency)');
    throw new Error(jeErr.message);
  }

  const lineRows = lines.map((ln) => ({
    journal_entry_id: je.journal_entry_id,
    line_no: ln.line_no,
    account_id: ln.account_id,
    debit: round4(ln.debit || 0),
    credit: round4(ln.credit || 0),
    description: ln.description || null,
    dimensions: ln.dimensions || {},
    tax_scheme: ln.tax_scheme || null,
    tax_rate: ln.tax_rate ?? null,
    tax_amount: ln.tax_amount != null ? round4(ln.tax_amount) : null,
    party_type: ln.party_type || null,
    party_id: ln.party_id ?? null,
    currency_code: ln.currency_code || 'GBP',
  }));

  const { error: jlErr } = await supabase.from('journal_lines').insert(lineRows);
  if (jlErr) {
    await supabase.from('journal_entries').delete().eq('journal_entry_id', je.journal_entry_id);
    throw new Error(jlErr.message);
  }

  if (approval_status === 'approved') {
    await supabase.from('audit_events').insert({
      entity_type: 'journal_entry',
      entity_id: String(je.journal_entry_id),
      action: 'posted',
      payload: { source_type: je.source_type, source_ref: je.source_ref },
      actor: params.created_by || 'system',
    });
  }

  const { data: finalJe } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', je.journal_entry_id).single();
  return { journal_entry: finalJe, lines: lineRows.length };
}

export async function listJournalEntries({ fromDate, toDate, limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), MAX_JOURNAL_PAGE_SIZE);
  let q = supabase
    .from('journal_entries')
    .select('*', { count: 'exact' })
    .eq('status', 'posted')
    .order('entry_date', { ascending: false })
    .limit(lim);
  if (fromDate) q = q.gte('entry_date', fromDate);
  if (toDate) q = q.lte('entry_date', toDate);
  const { data: entries, error, count } = await q;
  if (error) throw new Error(error.message);
  if (!entries?.length) return { entries: [], total: count ?? 0 };
  const ids = entries.map((e) => e.journal_entry_id);
  const { data: lines, error: le } = await supabase.from('journal_lines').select('*').in('journal_entry_id', ids).order('line_no');
  if (le) throw new Error(le.message);

  const accountIds = [...new Set((lines || []).map((l) => l.account_id).filter(Boolean))];
  const { data: accounts } = accountIds.length
    ? await supabase.from('accounts').select('account_id, code, name').in('account_id', accountIds)
    : { data: [] };
  const accMap = new Map((accounts || []).map((a) => [a.account_id, a]));

  const byJe = new Map();
  for (const ln of lines || []) {
    if (!byJe.has(ln.journal_entry_id)) byJe.set(ln.journal_entry_id, []);
    const acc = accMap.get(ln.account_id);
    byJe.get(ln.journal_entry_id).push({ ...ln, account_code: acc?.code || null, account_name: acc?.name || null });
  }
  return { entries: entries.map((e) => ({ ...e, journal_lines: byJe.get(e.journal_entry_id) || [] })), total: count ?? entries.length };
}

/**
 * Reverses a posted journal entry with a new, linked, opposite-signed entry — the
 * compliant way to correct a mistake (Companies Act 2006 s.386-388: records must
 * explain the company's transactions; posted entries are never edited or deleted).
 * The (source_type, source_ref) unique constraint also prevents double-voiding.
 */
export async function voidJournalEntry(journalEntryId, { reason, actor } = {}) {
  if (!reason || !reason.trim()) throw new Error('A reason is required to void a journal entry');
  const { data: je, error: e1 } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', journalEntryId).single();
  if (e1 || !je) throw new Error('Journal entry not found');
  if (je.status !== 'posted') throw new Error('Only posted entries can be voided');
  if (je.voided_at) throw new Error('Journal entry already voided');

  const { data: lines, error: le } = await supabase.from('journal_lines').select('*').eq('journal_entry_id', journalEntryId).order('line_no');
  if (le) throw new Error(le.message);

  const today = new Date().toISOString().slice(0, 10);
  const period = await getPeriodForDate(today);
  if (period.status === 'locked') throw new Error('Current period is locked; cannot post a reversal');

  const reversedLines = (lines || []).map((ln, i) => ({
    line_no: i + 1,
    account_id: ln.account_id,
    debit: Number(ln.credit || 0),
    credit: Number(ln.debit || 0),
    description: `Reversal of JE #${journalEntryId}${ln.description ? ' — ' + ln.description : ''}`,
    dimensions: ln.dimensions,
    tax_scheme: ln.tax_scheme,
    tax_rate: ln.tax_rate,
    tax_amount: ln.tax_amount,
    party_type: ln.party_type,
    party_id: ln.party_id,
    currency_code: ln.currency_code,
  }));

  const result = await createJournalEntry(
    {
      entry_date: today,
      description: `Reversal of JE #${journalEntryId}: ${reason}`,
      source_type: 'reversal',
      source_ref: String(journalEntryId),
      reference: je.reference,
      period_id: period.period_id,
      created_by: actor || 'system',
      lines: reversedLines,
    },
    { skipApproval: true }
  );

  const newJeId = result.journal_entry.journal_entry_id;
  const now = new Date().toISOString();

  await supabase
    .from('journal_entries')
    .update({ voided_at: now, void_reason: reason, reversed_by_journal_entry_id: newJeId, updated_at: now })
    .eq('journal_entry_id', journalEntryId);
  await supabase.from('journal_entries').update({ reverses_journal_entry_id: journalEntryId }).eq('journal_entry_id', newJeId);
  await supabase.from('audit_events').insert({
    entity_type: 'journal_entry',
    entity_id: String(journalEntryId),
    action: 'voided',
    payload: { reason, reversed_by_journal_entry_id: newJeId },
    actor: actor || 'system',
  });

  return { voided_journal_entry_id: journalEntryId, reversal_journal_entry_id: newJeId, lines: result.lines };
}

/**
 * Move draft journal to posted after approval (period must be open).
 */
export async function postDraftJournal(journalEntryId, actor) {
  const now = new Date().toISOString();
  const { data: je, error: e1 } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', journalEntryId).single();
  if (e1) throw new Error(e1.message);
  if (je.status !== 'draft') throw new Error('Only draft entries can be posted');
  if (je.approval_status !== 'approved') throw new Error('Journal must be approved before posting');
  const { data: per } = await supabase.from('fiscal_periods').select('status').eq('period_id', je.period_id).single();
  if (per?.status === 'locked') throw new Error('Period is locked');

  const { data: posted, error: e2 } = await supabase
    .from('journal_entries')
    .update({ status: 'posted', posted_at: now, updated_at: now })
    .eq('journal_entry_id', journalEntryId)
    .select()
    .single();
  if (e2) throw new Error(e2.message);
  await supabase.from('audit_events').insert({
    entity_type: 'journal_entry',
    entity_id: String(journalEntryId),
    action: 'posted',
    payload: {},
    actor: actor || 'system',
  });
  return posted;
}

export async function setJournalApproval(journalEntryId, { approval_status, actor }) {
  if (!['pending', 'approved', 'rejected'].includes(approval_status)) throw new Error('Invalid approval_status');
  const patch = {
    approval_status,
    updated_at: new Date().toISOString(),
  };
  if (approval_status === 'approved') {
    patch.approved_by = actor || 'system';
    patch.approved_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('journal_entries')
    .update(patch)
    .eq('journal_entry_id', journalEntryId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await supabase.from('audit_events').insert({
    entity_type: 'journal_entry',
    entity_id: String(journalEntryId),
    action: `approval_${approval_status}`,
    payload: {},
    actor: actor || 'system',
  });
  return data;
}
