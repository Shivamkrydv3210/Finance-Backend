import { supabase } from '../../db.js';

export async function createBankAccount({ name, currency_code = 'GBP', gl_account_code = '1100', last_four }) {
  const { data: acc } = await supabase.from('accounts').select('account_id').eq('code', gl_account_code).single();
  if (!acc) throw new Error(`GL account ${gl_account_code} not found`);
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      name,
      currency_code,
      gl_account_id: acc.account_id,
      last_four: last_four || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listBankAccounts() {
  const { data: banks, error } = await supabase.from('bank_accounts').select('*').eq('is_active', true);
  if (error) throw new Error(error.message);
  const ids = [...new Set((banks || []).map((b) => b.gl_account_id))];
  const { data: accs } = ids.length ? await supabase.from('accounts').select('account_id,code,name').in('account_id', ids) : { data: [] };
  const map = new Map((accs || []).map((a) => [a.account_id, a]));
  return (banks || []).map((b) => ({ ...b, gl_account: map.get(b.gl_account_id) || null }));
}

/**
 * Import rows: { txn_date, amount, description?, reference? }
 */
export async function importBankRows(bankAccountId, rows, sourceFilename) {
  const { data: batch, error: bErr } = await supabase
    .from('bank_import_batches')
    .insert({
      bank_account_id: bankAccountId,
      source_filename: sourceFilename || 'upload.csv',
      row_count: rows.length,
    })
    .select()
    .single();
  if (bErr) throw new Error(bErr.message);

  const txRows = rows.map((r) => ({
    bank_account_id: bankAccountId,
    import_batch_id: batch.import_batch_id,
    txn_date: r.txn_date,
    amount: Number(r.amount),
    description: r.description || null,
    reference: r.reference || null,
    balance_after: r.balance_after != null ? Number(r.balance_after) : null,
    raw_row: r.raw || {},
    reconciliation_status: 'unmatched',
  }));

  const { data: inserted, error: tErr } = await supabase.from('bank_transactions').insert(txRows).select();
  if (tErr) throw new Error(tErr.message);
  return { import_batch_id: batch.import_batch_id, inserted: inserted?.length || 0 };
}

export async function listBankTransactions(bankAccountId, { status, fromDate, toDate, limit = 200 } = {}) {
  let q = supabase
    .from('bank_transactions')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('reconciliation_status', status);
  if (fromDate) q = q.gte('txn_date', fromDate);
  if (toDate) q = q.lte('txn_date', toDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Suggest invoice_header matches for a bank transaction (amount + date proximity).
 */
export async function suggestMatchesForTransaction(bankTxnId) {
  const { data: txn, error } = await supabase.from('bank_transactions').select('*').eq('bank_txn_id', bankTxnId).single();
  if (error) throw new Error(error.message);
  const amt = Math.abs(Number(txn.amount));
  const d = new Date(txn.txn_date);
  const from = new Date(d);
  from.setDate(from.getDate() - 14);
  const to = new Date(d);
  to.setDate(to.getDate() + 14);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const { data: inv, error: e2 } = await supabase
    .from('invoice_header')
    .select('invoice_id, invoice_number, vendor_name, total_amount, invoice_date, journal_entry_id')
    .gte('invoice_date', fromStr)
    .lte('invoice_date', toStr);
  if (e2) throw new Error(e2.message);

  const suggestions = (inv || [])
    .map((row) => {
      const diff = Math.abs(Number(row.total_amount) - amt);
      const score = diff < 0.01 ? 100 : diff < 1 ? 90 : diff < amt * 0.01 ? 70 : diff < amt * 0.05 ? 50 : 0;
      return { ...row, amount_diff: diff, confidence: score };
    })
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  return { bank_txn: txn, suggestions };
}

export async function recordMatch(bankTxnId, { journal_entry_id, journal_line_id, match_type = 'manual', confidence, note }) {
  const { data: existing } = await supabase.from('reconciliation_matches').select('match_id').eq('bank_txn_id', bankTxnId).maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from('reconciliation_matches')
      .update({ journal_entry_id, journal_line_id, match_type, confidence, note })
      .eq('bank_txn_id', bankTxnId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from('bank_transactions').update({ reconciliation_status: 'matched' }).eq('bank_txn_id', bankTxnId);
    return data;
  }
  const { data, error } = await supabase
    .from('reconciliation_matches')
    .insert({
      bank_txn_id: bankTxnId,
      journal_entry_id,
      journal_line_id,
      match_type,
      confidence,
      note,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await supabase.from('bank_transactions').update({ reconciliation_status: 'matched' }).eq('bank_txn_id', bankTxnId);
  return data;
}
