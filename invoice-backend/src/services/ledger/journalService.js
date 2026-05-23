import { supabase } from '../../db.js';

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
    currency_code: ln.currency_code || 'INR',
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
  let q = supabase
    .from('journal_entries')
    .select('*')
    .eq('status', 'posted')
    .order('entry_date', { ascending: false })
    .limit(limit);
  if (fromDate) q = q.gte('entry_date', fromDate);
  if (toDate) q = q.lte('entry_date', toDate);
  const { data: entries, error } = await q;
  if (error) throw new Error(error.message);
  if (!entries?.length) return [];
  const ids = entries.map((e) => e.journal_entry_id);
  const { data: lines, error: le } = await supabase.from('journal_lines').select('*').in('journal_entry_id', ids);
  if (le) throw new Error(le.message);
  const byJe = new Map();
  for (const ln of lines || []) {
    if (!byJe.has(ln.journal_entry_id)) byJe.set(ln.journal_entry_id, []);
    byJe.get(ln.journal_entry_id).push(ln);
  }
  return entries.map((e) => ({ ...e, journal_lines: byJe.get(e.journal_entry_id) || [] }));
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
