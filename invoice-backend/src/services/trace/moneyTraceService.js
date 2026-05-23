import { supabase } from '../../db.js';

/**
 * Money Trace — deterministic chain: attachments → invoice → journal → bank match.
 * Gaps are explicit (not posted, no attachment, no bank reconciliation).
 */

async function accountsMapForLines(lines) {
  const ids = [...new Set((lines || []).map((l) => l.account_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('accounts').select('account_id,code,name,account_type').in('account_id', ids);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((a) => [a.account_id, a]));
}

function withAccounts(lines, map) {
  return (lines || []).map((ln) => ({ ...ln, account: map.get(ln.account_id) || null }));
}

async function listAttachmentsForInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('entity_type', 'invoice_header')
    .eq('entity_id', String(invoiceId));
  if (error) throw new Error(error.message);
  return data || [];
}

async function resolveJournalEntryForInvoice(inv) {
  if (!inv) return null;
  if (inv.journal_entry_id) {
    const { data, error } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', inv.journal_entry_id).maybeSingle();
    if (!error && data) return data;
  }
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('source_type', 'invoice')
    .eq('source_ref', String(inv.invoice_id))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function resolveInvoiceForJournalEntry(je) {
  if (!je) return null;
  if (je.source_type === 'invoice' && je.source_ref != null && je.source_ref !== '') {
    const id = Number(je.source_ref);
    if (!Number.isNaN(id)) {
      const { data } = await supabase.from('invoice_header').select('*').eq('invoice_id', id).maybeSingle();
      if (data) return data;
    }
  }
  const { data } = await supabase.from('invoice_header').select('*').eq('journal_entry_id', je.journal_entry_id).maybeSingle();
  return data || null;
}

async function loadJournalLines(journalEntryId) {
  const { data, error } = await supabase.from('journal_lines').select('*').eq('journal_entry_id', journalEntryId).order('line_no');
  if (error) throw new Error(error.message);
  const map = await accountsMapForLines(data);
  return withAccounts(data || [], map);
}

async function enrichBankTxn(txn) {
  if (!txn) return null;
  let bankAccount = null;
  if (txn.bank_account_id) {
    const { data: ba } = await supabase.from('bank_accounts').select('*').eq('bank_account_id', txn.bank_account_id).maybeSingle();
    bankAccount = ba;
    if (ba?.gl_account_id) {
      const { data: gl } = await supabase.from('accounts').select('account_id,code,name').eq('account_id', ba.gl_account_id).maybeSingle();
      bankAccount = { ...ba, gl_account: gl || null };
    }
  }
  return { transaction: txn, bank_account: bankAccount };
}

async function loadBankSide(journalEntryId) {
  const { data: matches, error: mErr } = await supabase.from('reconciliation_matches').select('*').eq('journal_entry_id', journalEntryId);
  if (mErr) throw new Error(mErr.message);
  if (!matches?.length) {
    return { reconciliation_matches: [], transactions: [], primary: null };
  }
  const txns = [];
  const enriched = [];
  for (const match of matches) {
    const { data: txn, error: tErr } = await supabase.from('bank_transactions').select('*').eq('bank_txn_id', match.bank_txn_id).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    const e = await enrichBankTxn(txn);
    enriched.push({ reconciliation_match: match, transaction: e?.transaction || null, bank_account: e?.bank_account || null });
    if (txn) txns.push(txn);
  }
  const primary = enriched[0] || null;
  return {
    reconciliation_matches: matches,
    transactions: txns,
    linked: enriched,
    reconciliation_match: primary?.reconciliation_match || null,
    transaction: primary?.transaction || null,
    bank_account: primary?.bank_account || null,
  };
}

function computeGaps({ invoice, journal_entry, journal_lines, attachments, bank, posting_error }) {
  const gaps = [];
  if (invoice) {
    if (!attachments?.length) gaps.push('no_attachment');
    if (posting_error) gaps.push('posting_error');
  }
  if (invoice && !journal_entry) {
    if (invoice.journal_entry_id || posting_error) gaps.push('invoice_not_posted_to_ledger');
    else gaps.push('no_journal_for_invoice');
  }
  if (journal_entry && !invoice && journal_entry.source_type === 'invoice') {
    gaps.push('invoice_record_missing');
  }
  if (journal_entry && journal_lines?.length && !(bank?.reconciliation_matches?.length > 0)) {
    const hasApLine = journal_lines.some((l) => l.account?.code === '2000' && Number(l.credit) > 0);
    if (hasApLine) gaps.push('no_bank_reconciliation');
  }
  return [...new Set(gaps)];
}

async function assembleTrace({ anchor, invoice, journal_entry, journal_lines, bank }) {
  let inv = invoice;
  let je = journal_entry;
  let lines = journal_lines;
  let attachments = [];
  let bankSide = bank || { reconciliation_matches: [], transactions: [], linked: [], reconciliation_match: null, transaction: null, bank_account: null };

  if (inv && !je) je = await resolveJournalEntryForInvoice(inv);
  if (je && !inv) inv = await resolveInvoiceForJournalEntry(je);
  if (je && !lines) lines = await loadJournalLines(je.journal_entry_id);
  if (!(bankSide.reconciliation_matches?.length > 0) && je) bankSide = await loadBankSide(je.journal_entry_id);
  if (inv) attachments = await listAttachmentsForInvoice(inv.invoice_id);

  const posting_error = inv?.posting_error || null;
  const gaps = computeGaps({
    invoice: inv,
    journal_entry: je,
    journal_lines: lines,
    attachments,
    bank: bankSide,
    posting_error,
  });

  return {
    anchor,
    gaps,
    document_attachments: attachments,
    invoice: inv,
    journal_entry: je,
    journal_lines: lines || [],
    bank: bankSide,
    posting_error,
  };
}

export async function traceFromInvoice(invoiceId) {
  const id = Number(invoiceId);
  if (Number.isNaN(id)) throw new Error('Invalid invoice id');
  const { data: inv, error } = await supabase.from('invoice_header').select('*').eq('invoice_id', id).single();
  if (error || !inv) throw new Error('Invoice not found');
  return assembleTrace({ anchor: { type: 'invoice', id }, invoice: inv });
}

export async function traceFromJournalEntry(journalEntryId) {
  const id = Number(journalEntryId);
  if (Number.isNaN(id)) throw new Error('Invalid journal_entry id');
  const { data: je, error } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', id).single();
  if (error || !je) throw new Error('Journal entry not found');
  const lines = await loadJournalLines(id);
  const bank = await loadBankSide(id);
  return assembleTrace({ anchor: { type: 'journal_entry', id }, journal_entry: je, journal_lines: lines, bank });
}

export async function traceFromJournalLine(journalLineId) {
  const id = Number(journalLineId);
  if (Number.isNaN(id)) throw new Error('Invalid journal_line id');
  const { data: line, error } = await supabase.from('journal_lines').select('*').eq('journal_line_id', id).single();
  if (error || !line) throw new Error('Journal line not found');
  const bundle = await traceFromJournalEntry(line.journal_entry_id);
  return {
    ...bundle,
    anchor: { type: 'journal_line', id, journal_entry_id: line.journal_entry_id, line_no: line.line_no },
    highlighted_journal_line_id: id,
  };
}

export async function traceFromBankTxn(bankTxnId) {
  const id = Number(bankTxnId);
  if (Number.isNaN(id)) throw new Error('Invalid bank_txn id');
  const { data: txn, error } = await supabase.from('bank_transactions').select('*').eq('bank_txn_id', id).single();
  if (error || !txn) throw new Error('Bank transaction not found');

  let bankAccount = null;
  if (txn.bank_account_id) {
    const { data: ba } = await supabase.from('bank_accounts').select('*').eq('bank_account_id', txn.bank_account_id).maybeSingle();
    bankAccount = ba;
    if (ba?.gl_account_id) {
      const { data: gl } = await supabase.from('accounts').select('account_id,code,name').eq('account_id', ba.gl_account_id).maybeSingle();
      bankAccount = { ...ba, gl_account: gl || null };
    }
  }

  const { data: match } = await supabase.from('reconciliation_matches').select('*').eq('bank_txn_id', id).maybeSingle();

  if (!match?.journal_entry_id) {
    return {
      anchor: { type: 'bank_txn', id },
      gaps: ['no_journal_link'],
      document_attachments: [],
      invoice: null,
      journal_entry: null,
      journal_lines: [],
      bank: {
        reconciliation_matches: match ? [match] : [],
        transactions: [txn],
        linked: [{ reconciliation_match: match, transaction: txn, bank_account: bankAccount }],
        reconciliation_match: match,
        transaction: txn,
        bank_account: bankAccount,
      },
      posting_error: null,
    };
  }

  const { data: je } = await supabase.from('journal_entries').select('*').eq('journal_entry_id', match.journal_entry_id).single();
  const lines = await loadJournalLines(match.journal_entry_id);
  const bankSide = await loadBankSide(match.journal_entry_id);

  return assembleTrace({
    anchor: { type: 'bank_txn', id },
    journal_entry: je,
    journal_lines: lines,
    bank: bankSide,
  });
}

export async function traceFromAccountCode(accountCode, fromDate, toDate, limit = 25) {
  if (!fromDate || !toDate) throw new Error('from and to (YYYY-MM-DD) are required for account trace');
  const code = String(accountCode).trim();
  const { data: acc, error: aErr } = await supabase.from('accounts').select('*').eq('code', code).maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!acc) throw new Error(`Unknown account code ${code}`);

  const { data: entries, error: eErr } = await supabase
    .from('journal_entries')
    .select('journal_entry_id, entry_date, description, source_type, source_ref, status')
    .eq('status', 'posted')
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate)
    .order('entry_date', { ascending: false })
    .limit(400);
  if (eErr) throw new Error(eErr.message);
  if (!entries?.length) {
    return {
      mode: 'account_browse',
      account: { code: acc.code, name: acc.name, account_type: acc.account_type },
      period: { from: fromDate, to: toDate },
      traces: [],
      message: 'No posted journals in range',
    };
  }

  const jeIds = entries.map((e) => e.journal_entry_id);
  const { data: jlines, error: lErr } = await supabase
    .from('journal_lines')
    .select('*')
    .eq('account_id', acc.account_id)
    .in('journal_entry_id', jeIds);
  if (lErr) throw new Error(lErr.message);

  const jeWithLine = new Set((jlines || []).map((l) => l.journal_entry_id));
  const filteredEntries = entries.filter((e) => jeWithLine.has(e.journal_entry_id)).slice(0, limit);

  const traces = [];
  for (const e of filteredEntries) {
    const bundle = await traceFromJournalEntry(e.journal_entry_id);
    traces.push({
      ...bundle,
      anchor: { type: 'account_hit', account_code: code, journal_entry_id: e.journal_entry_id, entry_date: e.entry_date },
    });
  }

  return {
    mode: 'account_browse',
    account: { code: acc.code, name: acc.name, account_type: acc.account_type },
    period: { from: fromDate, to: toDate },
    traces,
    trace_count: traces.length,
  };
}

/**
 * @param {string} fromParam - e.g. invoice:123, je:45, journal_line:9, bank_txn:1, account:5100
 */
export async function traceFromQuery(fromParam, { fromDate, toDate, limit } = {}) {
  const raw = String(fromParam || '').trim();
  const m = raw.match(/^(invoice|inv|je|journal_entry|jl|journal_line|bank_txn|bank|account)\s*:\s*(.+)$/i);
  if (!m) throw new Error('Invalid from= parameter. Use invoice:ID, je:ID, journal_line:ID, bank_txn:ID, account:CODE');

  const kind = m[1].toLowerCase();
  const rest = m[2].trim();

  if (kind === 'invoice' || kind === 'inv') return traceFromInvoice(rest);
  if (kind === 'je' || kind === 'journal_entry') return traceFromJournalEntry(rest);
  if (kind === 'jl' || kind === 'journal_line') return traceFromJournalLine(rest);
  if (kind === 'bank_txn' || kind === 'bank') return traceFromBankTxn(rest);
  if (kind === 'account') return traceFromAccountCode(rest, fromDate, toDate, limit ? Number(limit) : 25);

  throw new Error('Unsupported anchor type');
}
