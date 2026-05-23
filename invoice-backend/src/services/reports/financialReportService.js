import { supabase } from '../../db.js';

async function loadAccountsMap(accountIds) {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('accounts').select('*').in('account_id', ids);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((a) => [a.account_id, a]));
}

async function loadPostedLines(fromDate, toDate) {
  const { data: entries, error: e1 } = await supabase
    .from('journal_entries')
    .select('journal_entry_id, entry_date')
    .eq('status', 'posted')
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate);
  if (e1) throw new Error(e1.message);
  if (!entries?.length) return [];

  const jeIds = entries.map((j) => j.journal_entry_id);
  const { data: lines, error: e2 } = await supabase.from('journal_lines').select('*').in('journal_entry_id', jeIds);
  if (e2) throw new Error(e2.message);
  const dateByJe = Object.fromEntries(entries.map((j) => [j.journal_entry_id, j.entry_date]));
  const accMap = await loadAccountsMap((lines || []).map((l) => l.account_id));
  return (lines || []).map((ln) => ({
    ...ln,
    entry_date: dateByJe[ln.journal_entry_id],
    account: accMap.get(ln.account_id),
  }));
}

async function loadPostedLinesThrough(asOfDate) {
  const { data: entries, error: e1 } = await supabase
    .from('journal_entries')
    .select('journal_entry_id, entry_date')
    .eq('status', 'posted')
    .lte('entry_date', asOfDate);
  if (e1) throw new Error(e1.message);
  if (!entries?.length) return [];

  const jeIds = entries.map((j) => j.journal_entry_id);
  const { data: lines, error: e2 } = await supabase.from('journal_lines').select('*').in('journal_entry_id', jeIds);
  if (e2) throw new Error(e2.message);
  const dateByJe = Object.fromEntries(entries.map((j) => [j.journal_entry_id, j.entry_date]));
  const accMap = await loadAccountsMap((lines || []).map((l) => l.account_id));
  return (lines || []).map((ln) => ({
    ...ln,
    entry_date: dateByJe[ln.journal_entry_id],
    account: accMap.get(ln.account_id),
  }));
}

function accumulateByAccount(lines) {
  const map = new Map();
  for (const ln of lines) {
    const id = ln.account_id;
    if (!map.has(id)) {
      map.set(id, {
        account_id: id,
        code: ln.account?.code,
        name: ln.account?.name,
        account_type: ln.account?.account_type,
        debit: 0,
        credit: 0,
      });
    }
    const row = map.get(id);
    row.debit += Number(ln.debit || 0);
    row.credit += Number(ln.credit || 0);
  }
  return [...map.values()].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

export async function trialBalance(fromDate, toDate) {
  const lines = await loadPostedLines(fromDate, toDate);
  const rows = accumulateByAccount(lines);
  return rows.map((r) => ({
    ...r,
    net_debit_balance: r.debit - r.credit,
  }));
}

export async function profitAndLoss(fromDate, toDate) {
  const lines = await loadPostedLines(fromDate, toDate);
  const byAcc = accumulateByAccount(lines);
  let revenue = 0;
  let expense = 0;
  const detail = { revenue: [], expense: [] };
  for (const r of byAcc) {
    const net = r.credit - r.debit;
    if (r.account_type === 'revenue') {
      revenue += net;
      detail.revenue.push({ code: r.code, name: r.name, amount: net });
    } else if (r.account_type === 'expense') {
      const expAmt = r.debit - r.credit;
      expense += expAmt;
      detail.expense.push({ code: r.code, name: r.name, amount: expAmt });
    }
  }
  return {
    period: { from: fromDate, to: toDate },
    revenue_total: revenue,
    expense_total: expense,
    net_income: revenue - expense,
    lines: detail,
  };
}

export async function balanceSheet(asOfDate) {
  const lines = await loadPostedLinesThrough(asOfDate);
  const byAcc = accumulateByAccount(lines);
  const assets = [];
  const liabilities = [];
  const equity = [];
  let assetsSum = 0;
  let liabSum = 0;
  let eqSum = 0;
  for (const r of byAcc) {
    const debit = r.debit;
    const credit = r.credit;
    if (r.account_type === 'asset') {
      const bal = debit - credit;
      assets.push({ code: r.code, name: r.name, balance: bal });
      assetsSum += bal;
    } else if (r.account_type === 'liability') {
      const bal = credit - debit;
      liabilities.push({ code: r.code, name: r.name, balance: bal });
      liabSum += bal;
    } else if (r.account_type === 'equity') {
      const bal = credit - debit;
      equity.push({ code: r.code, name: r.name, balance: bal });
      eqSum += bal;
    }
  }
  const retained = assetsSum - liabSum - eqSum;
  return {
    as_of: asOfDate,
    assets: { lines: assets, total: assetsSum },
    liabilities: { lines: liabilities, total: liabSum },
    equity: { lines: equity, total: eqSum },
    computed_retained_check: retained,
    assets_equals_liabilities_plus_equity: Math.abs(assetsSum - liabSum - eqSum) < 0.01,
  };
}

export async function taxRegister(fromDate, toDate) {
  const lines = await loadPostedLines(fromDate, toDate);
  const taxLines = lines.filter((l) => l.tax_scheme || l.tax_amount);
  return taxLines.map((l) => ({
    entry_date: l.entry_date,
    account_code: l.account?.code,
    tax_scheme: l.tax_scheme,
    tax_rate: l.tax_rate,
    tax_amount: l.tax_amount,
    debit: l.debit,
    credit: l.credit,
    description: l.description,
  }));
}
