import { supabase } from '../../db.js';
import { getStatutoryHeadings } from '../../knowledge/uk-tax/index.js';

const { balance_sheet: BS_HEADING_ORDER, profit_and_loss: PL_HEADING_ORDER, format: STATUTORY_FORMAT } = getStatutoryHeadings();

async function loadAccountsMap(accountIds) {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('accounts').select('*').in('account_id', ids);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((a) => [a.account_id, a]));
}

export async function loadPostedLines(fromDate, toDate) {
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
        statutory_heading: ln.account?.statutory_heading,
        statutory_sort_order: ln.account?.statutory_sort_order || 0,
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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Debit-normal for assets/expenses, credit-normal for liabilities/equity/revenue. */
function naturalBalance(row) {
  if (row.account_type === 'asset' || row.account_type === 'expense') return round2(row.debit - row.credit);
  return round2(row.credit - row.debit);
}

/** Groups accumulated account rows into statutory-heading sections, in canonical order. Unheaded accounts land in "Unclassified" rather than disappearing. */
function buildStatutorySections(rows, headingOrder) {
  const byHeading = new Map();
  for (const r of rows) {
    const heading = r.statutory_heading || 'Unclassified';
    if (!byHeading.has(heading)) byHeading.set(heading, []);
    byHeading.get(heading).push({ code: r.code, name: r.name, amount: naturalBalance(r), sort_order: r.statutory_sort_order || 0 });
  }
  const orderedHeadings = [...headingOrder, ...[...byHeading.keys()].filter((h) => !headingOrder.includes(h))];
  const sections = [];
  for (const heading of orderedHeadings) {
    const lines = byHeading.get(heading);
    if (!lines || lines.length === 0) continue;
    lines.sort((a, b) => a.sort_order - b.sort_order || (a.code || '').localeCompare(b.code || ''));
    sections.push({ heading, lines, subtotal: round2(lines.reduce((s, l) => s + l.amount, 0)) });
  }
  return sections;
}

function sectionSubtotal(sections, heading) {
  return sections.find((s) => s.heading === heading)?.subtotal || 0;
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
  const plAccounts = byAcc.filter((r) => r.account_type === 'revenue' || r.account_type === 'expense');
  const statutorySections = buildStatutorySections(plAccounts, PL_HEADING_ORDER);
  const turnover = sectionSubtotal(statutorySections, 'Turnover');
  const costOfSales = sectionSubtotal(statutorySections, 'Cost of sales');
  const grossProfit = round2(turnover - costOfSales);
  const adminExpenses = sectionSubtotal(statutorySections, 'Administrative expenses');
  const operatingProfit = round2(grossProfit - adminExpenses);
  const interestPayable = sectionSubtotal(statutorySections, 'Interest payable and similar charges');
  const profitBeforeTax = round2(operatingProfit - interestPayable);
  const taxation = sectionSubtotal(statutorySections, 'Taxation');
  const profitAfterTax = round2(profitBeforeTax - taxation);

  return {
    period: { from: fromDate, to: toDate },
    revenue_total: revenue,
    expense_total: expense,
    net_income: revenue - expense,
    lines: detail,
    statutory: {
      format: STATUTORY_FORMAT + ' (P&L)',
      sections: statutorySections,
      turnover,
      cost_of_sales: costOfSales,
      gross_profit: grossProfit,
      administrative_expenses: adminExpenses,
      operating_profit: operatingProfit,
      interest_payable: interestPayable,
      profit_before_tax: profitBeforeTax,
      taxation,
      profit_after_tax: profitAfterTax,
    },
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

  const bsAccounts = byAcc.filter((r) => r.account_type === 'asset' || r.account_type === 'liability' || r.account_type === 'equity');
  const statutorySections = buildStatutorySections(bsAccounts, BS_HEADING_ORDER);
  const fixedAssets = round2(
    sectionSubtotal(statutorySections, 'Fixed assets - Intangible') + sectionSubtotal(statutorySections, 'Fixed assets - Tangible')
  );
  const currentAssets = round2(
    sectionSubtotal(statutorySections, 'Current assets - Stocks') +
      sectionSubtotal(statutorySections, 'Current assets - Debtors') +
      sectionSubtotal(statutorySections, 'Current assets - Cash at bank and in hand')
  );
  const creditorsWithinOneYear = sectionSubtotal(statutorySections, 'Creditors: amounts falling due within one year');
  const creditorsAfterOneYear = sectionSubtotal(statutorySections, 'Creditors: amounts falling due after more than one year');
  const provisions = sectionSubtotal(statutorySections, 'Provisions for liabilities');
  const capitalAndReserves = sectionSubtotal(statutorySections, 'Capital and reserves');
  const netCurrentAssets = round2(currentAssets - creditorsWithinOneYear);
  const totalAssetsLessCurrentLiabilities = round2(fixedAssets + netCurrentAssets);
  const netAssets = round2(totalAssetsLessCurrentLiabilities - creditorsAfterOneYear - provisions);

  return {
    as_of: asOfDate,
    assets: { lines: assets, total: assetsSum },
    liabilities: { lines: liabilities, total: liabSum },
    equity: { lines: equity, total: eqSum },
    computed_retained_check: retained,
    assets_equals_liabilities_plus_equity: Math.abs(assetsSum - liabSum - eqSum) < 0.01,
    statutory: {
      format: STATUTORY_FORMAT,
      sections: statutorySections,
      fixed_assets: fixedAssets,
      current_assets: currentAssets,
      creditors_within_one_year: creditorsWithinOneYear,
      net_current_assets: netCurrentAssets,
      total_assets_less_current_liabilities: totalAssetsLessCurrentLiabilities,
      creditors_after_one_year: creditorsAfterOneYear,
      provisions_for_liabilities: provisions,
      net_assets: netAssets,
      capital_and_reserves: capitalAndReserves,
      net_assets_equals_capital_and_reserves: Math.abs(netAssets - capitalAndReserves) < 0.01,
    },
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
