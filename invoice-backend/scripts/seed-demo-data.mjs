#!/usr/bin/env node
/**
 * Large realistic demo dataset for Supabase (India-style transport / ops invoices).
 *
 * Safe re-run: removes ONLY rows tagged as seed (see wipeSeedData).
 *
 * Usage (from repo root .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   cd invoice-backend && node scripts/seed-demo-data.mjs
 *   node scripts/seed-demo-data.mjs --invoices=5000 --vendors=220 --bankTxns=4000
 *   node scripts/seed-demo-data.mjs --matchPct=45   (share of posted invoices linked to bank payments)
 *   node scripts/seed-demo-data.mjs --skip-wipe   (append only — may duplicate invoice# if not unique)
 *
 * npm run db:seed
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const NUM_INVOICES = Math.min(Math.max(parseInt(args.invoices, 10) || 3500, 50), 20000);
const NUM_VENDORS = Math.min(Math.max(parseInt(args.vendors, 10) || 200, 20), 600);
const NUM_BANK_TXNS = Math.min(Math.max(parseInt(args.bankTxns, 10) || 3200, 50), 8000);
const MATCH_PCT = Math.min(Math.max(parseFloat(String(args.matchPct === true ? '' : args.matchPct || '')) || 0.42, 0), 0.85);
const SKIP_WIPE = args['skip-wipe'] === true || args.skipWipe === true;

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function money2(n) {
  return Math.round(n * 100) / 100;
}

/** Shared billing inboxes for vendor-graph / duplicate-vendor testing */
const SHARED_VENDOR_EMAILS = [
  'billing@seed-fleet-partners.in',
  'accounts@seed-transport-hub.in',
  'ap@seed-logistics-group.in',
  'vendor-payments@seed-ops.in',
  'procurement@seed-commercial.in',
  'finance@seed-works.in',
];

function addDaysIso(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Spread across last ~540 days; ~14% cluster on last 3 days of month (close-integrity testing) */
function randomInvoiceDate() {
  const daysAgo = randInt(0, 540);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  if (Math.random() < 0.14) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = randInt(Math.max(1, last - 2), last);
    d.setUTCFullYear(y, m, day);
  }
  return d.toISOString().slice(0, 10);
}

const CATEGORIES = ['fuel', 'maintenance', 'repair', 'parts', 'other'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Lucknow'];
const SUFFIXES = ['Logistics Pvt Ltd', 'Transport Co', 'Auto Works', 'Petroleum Distributors', 'Spares & Service', 'Fleet Solutions', 'Garage & Repairs', 'Commercial Fuels', 'Parts Hub', 'Engineering Services'];

const FIRST_NAMES = ['Sharma', 'Patel', 'Singh', 'Reddy', 'Iyer', 'Khan', 'Verma', 'Mehta', 'Joshi', 'Nair', 'Desai', 'Kapoor', 'Malhotra', 'Agarwal', 'Rao'];

async function wipeSeedData(supabase) {
  console.log('Wiping previous seed data (tagged rows only)…');

  const { data: seedHeaders } = await supabase.from('invoice_header').select('invoice_id').eq('source', 'seed_demo');
  const invIds = (seedHeaders || []).map((r) => r.invoice_id);

  if (invIds.length) {
    const { data: jes } = await supabase
      .from('journal_entries')
      .select('journal_entry_id')
      .eq('source_type', 'invoice')
      .in(
        'source_ref',
        invIds.map(String)
      );

    const jeIds = (jes || []).map((j) => j.journal_entry_id);
    if (jeIds.length) {
      await supabase.from('reconciliation_matches').delete().in('journal_entry_id', jeIds);
      await supabase.from('journal_lines').delete().in('journal_entry_id', jeIds);
      await supabase.from('journal_entries').delete().in('journal_entry_id', jeIds);
    }
    await supabase.from('invoice_line_items').delete().in('invoice_id', invIds);
    const idStrs = invIds.map(String);
    await supabase.from('document_attachments').delete().eq('entity_type', 'invoice_header').in('entity_id', idStrs);
    await supabase.from('invoice_header').delete().in('invoice_id', invIds);
  }

  const { data: seedManual } = await supabase.from('journal_entries').select('journal_entry_id').eq('source_type', 'manual').like('reference', 'SEED-MANUAL-%');
  const manualJe = (seedManual || []).map((j) => j.journal_entry_id);
  if (manualJe.length) {
    await supabase.from('reconciliation_matches').delete().in('journal_entry_id', manualJe);
    await supabase.from('journal_lines').delete().in('journal_entry_id', manualJe);
    await supabase.from('journal_entries').delete().in('journal_entry_id', manualJe);
  }

  const { data: seedRevJe } = await supabase.from('journal_entries').select('journal_entry_id').like('reference', 'SEED-REV-%');
  const { data: seedDraftJe } = await supabase.from('journal_entries').select('journal_entry_id').like('reference', 'SEED-DRAFT-%');
  const extraJeIds = [...new Set([...(seedRevJe || []), ...(seedDraftJe || [])].map((j) => j.journal_entry_id))];
  if (extraJeIds.length) {
    await supabase.from('reconciliation_matches').delete().in('journal_entry_id', extraJeIds);
    await supabase.from('journal_lines').delete().in('journal_entry_id', extraJeIds);
    await supabase.from('journal_entries').delete().in('journal_entry_id', extraJeIds);
  }

  await supabase.from('vendors').delete().like('vendor_name', 'ZZZ_SEED%');

  const { data: seedBanks } = await supabase.from('bank_accounts').select('bank_account_id').like('name', '[SEED]%');
  const bankIds = (seedBanks || []).map((b) => b.bank_account_id);
  for (const bid of bankIds) {
    await supabase.from('reconciliation_matches').delete().in(
      'bank_txn_id',
      (await supabase.from('bank_transactions').select('bank_txn_id').eq('bank_account_id', bid)).data?.map((t) => t.bank_txn_id) || []
    );
    await supabase.from('bank_transactions').delete().eq('bank_account_id', bid);
    await supabase.from('bank_import_batches').delete().eq('bank_account_id', bid);
  }
  await supabase.from('bank_accounts').delete().like('name', '[SEED]%');

  await supabase.from('document_attachments').delete().eq('entity_type', 'seed_demo_invoice');
  await supabase.from('fixed_assets').delete().like('name', 'ZZZ_SEED%');
  await supabase.from('fixed_assets').delete().like('name', 'ZZZ_SEED_BAD%');
  await supabase.from('audit_events').delete().eq('actor', 'seed_script');

  console.log('Wipe complete.');
}

async function ensureFiscalPeriods(supabase) {
  const start = new Date();
  start.setMonth(start.getMonth() - 20);
  const end = new Date();
  end.setMonth(end.getMonth() + 2);

  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    // Match periodService.js — calendar dates in UTC to avoid IST/local shifting last day to prior date in DB
    const startStr = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    const endStr = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const { error } = await supabase.from('fiscal_periods').insert({
      period_year: y,
      period_month: m,
      start_date: startStr,
      end_date: endStr,
      status: 'open',
    });
    if (error && error.code !== '23505') console.warn('fiscal_periods:', error.message);
  }
  console.log('Fiscal periods ensured (insert missing months only).');
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (repo root).');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const { postInvoiceToLedger } = await import('../src/services/posting/invoicePostingService.js');

  if (!SKIP_WIPE) await wipeSeedData(supabase);
  else console.log('Skipping wipe (--skip-wipe).');

  await ensureFiscalPeriods(supabase);

  const { data: accRows } = await supabase.from('accounts').select('account_id,code');
  const accByCode = Object.fromEntries((accRows || []).map((a) => [a.code, a.account_id]));
  const required = ['2000', '1310', '5100', '5200', '5300', '5400', '5900', '1100'];
  for (const c of required) {
    if (!accByCode[c]) {
      console.error(`Missing account code ${c}. Run schema seed (06 / 00_run_all_in_order.sql).`);
      process.exit(1);
    }
  }

  console.log(`Creating ${NUM_VENDORS} vendors…`);
  const vendorRows = [];
  for (let i = 0; i < NUM_VENDORS; i++) {
    const city = pick(CITIES);
    const name = `ZZZ_SEED ${pick(FIRST_NAMES)} ${pick(SUFFIXES)} ${i + 1}`;
    const sharedEmail = i < 36 ? SHARED_VENDOR_EMAILS[i % SHARED_VENDOR_EMAILS.length] : `accounts+seed${i}@example-demo.local`;
    const sharedPhone = i >= 12 && i < 28 ? `98100${String(10000 + (i % 6)).slice(-5)}` : `9${String(100000000 + i).slice(0, 9)}`;
    const skipAddr = i >= 40 && i < 55;
    vendorRows.push({
      vendor_name: name,
      vendor_email: sharedEmail,
      vendor_phone: sharedPhone,
      vendor_address: skipAddr ? null : `${randInt(1, 200)} Industrial Area, ${city}`,
    });
  }

  const vendorIds = [];
  const V_CHUNK = 80;
  for (let i = 0; i < vendorRows.length; i += V_CHUNK) {
    const chunk = vendorRows.slice(i, i + V_CHUNK);
    const { data, error } = await supabase.from('vendors').insert(chunk).select('id');
    if (error) throw new Error('vendors: ' + error.message);
    vendorIds.push(...(data || []).map((r) => r.id));
  }

  const { data: vendorLookup } = await supabase.from('vendors').select('id,vendor_name').in('id', vendorIds);
  const vmap = Object.fromEntries((vendorLookup || []).map((v) => [v.id, v.vendor_name]));

  const lineDesc = {
    fuel: ['HSD Bulk Supply', 'Diesel — Fleet fill', 'High speed diesel', 'IOCL Retail — HSD'],
    maintenance: ['Periodic service', 'Engine tune-up', 'Brake overhaul', 'Oil & filters'],
    repair: ['Axle repair', 'Body dent work', 'Alternator replacement', 'Radiator service'],
    parts: ['Spare parts — OEM', 'Tyre set', 'Battery 12V', 'Clutch plate kit'],
    other: ['Toll & parking', 'Misc charges', 'Administrative fee', 'Loading charges'],
  };

  console.log(`Creating ${NUM_INVOICES} invoices + lines…`);
  const INV_CHUNK = 120;
  let posted = 0;
  const runId = Date.now();

  for (let batchStart = 0; batchStart < NUM_INVOICES; batchStart += INV_CHUNK) {
    const batchEnd = Math.min(batchStart + INV_CHUNK, NUM_INVOICES);
    const headers = [];
    for (let i = batchStart; i < batchEnd; i++) {
      let cat = pick(CATEGORIES);
      if (Math.random() < 0.065 && cat === 'fuel') cat = 'other';
      const withGst = Math.random() > 0.11;
      let gross = money2(randInt(800, 420000) + Math.random());
      if (Math.random() < 0.028) gross = money2(randInt(50, 420) * 1000);
      const tax = withGst ? money2((gross * 18) / 118) : 0;
      const sub = money2(gross - tax);
      const invNo = `DEMO-${runId}-${i}`;
      const vid = pick(vendorIds);
      headers.push({
        vendor_id: vid,
        vendor_name: vmap[vid] || 'Unknown',
        invoice_number: invNo,
        invoice_date: randomInvoiceDate(),
        due_date: null,
        category: cat,
        currency: Math.random() > 0.92 ? 'USD' : 'INR',
        subtotal: sub,
        tax_amount: tax,
        total_amount: gross,
        payment_mode: pick(['NEFT', 'UPI', 'Cash', 'Card', 'Cheque']),
        invoice_type: 'Tax Invoice',
        notes: `Seed batch ref ${runId}`,
        file_url: null,
        source: 'seed_demo',
      });
    }

    const { data: inserted, error: hErr } = await supabase.from('invoice_header').insert(headers).select('invoice_id,vendor_name,invoice_number,invoice_date,category,total_amount,subtotal,tax_amount,currency,vendor_id');
    if (hErr) throw new Error('invoice_header: ' + hErr.message);

    const lineBatches = [];
    for (let j = 0; j < inserted.length; j++) {
      const inv = inserted[j];
      const cat = inv.category;
      const nLines = randInt(1, cat === 'fuel' ? 2 : 4);
      let remain = inv.subtotal || inv.total_amount;
      for (let ln = 1; ln <= nLines; ln++) {
        const isLast = ln === nLines;
        const amt = isLast ? money2(remain) : money2(remain * (0.25 + Math.random() * 0.35));
        remain = money2(remain - amt);
        const qty = ln === 1 && cat === 'fuel' ? money2(randInt(40, 220)) : 1;
        const unit = ln === 1 && cat === 'fuel' && qty ? money2(amt / qty) : amt;
        lineBatches.push({
          invoice_id: inv.invoice_id,
          line_number: ln,
          description: pick(lineDesc[cat] || lineDesc.other),
          sub_expenditure: cat,
          quantity: qty,
          unit_price: unit,
          line_amount: amt,
        });
      }
    }

    const { error: lErr } = await supabase.from('invoice_line_items').insert(lineBatches);
    if (lErr) throw new Error('invoice_line_items: ' + lErr.message);

    for (const inv of inserted) {
      const { data: full } = await supabase.from('invoice_header').select('*').eq('invoice_id', inv.invoice_id).single();
      try {
        await postInvoiceToLedger(inv.invoice_id, full, { actor: 'seed_script', autoApprove: true });
        posted++;
      } catch (e) {
        console.warn('Ledger post failed for', inv.invoice_id, e.message);
      }
    }

    console.log(`  … ${batchEnd} / ${NUM_INVOICES} invoices, ${posted} posted to ledger`);
  }

  console.log('Creating manual journals (SEED-MANUAL-*)…');
  const { data: periods } = await supabase.from('fiscal_periods').select('period_id,start_date').order('start_date', { ascending: false }).limit(18);

  const expenseIds = [accByCode['5100'], accByCode['5200'], accByCode['5900']];
  const apId = accByCode['2000'];

  for (let m = 0; m < 45; m++) {
    const per = pick(periods || [{ period_id: 1, start_date: '2025-01-01' }]);
    const amt = money2(randInt(2000, 95000));
    const d = per.start_date || '2025-01-15';
    const ref = `SEED-MANUAL-${runId}-${m}`;
    const { data: je, error: jeE } = await supabase
      .from('journal_entries')
      .insert({
        entry_date: d,
        description: 'Seed manual accrual / adjustment',
        source_type: 'manual',
        source_ref: ref,
        reference: ref,
        period_id: per.period_id,
        status: 'posted',
        approval_status: 'approved',
        created_by: 'seed_script',
        approved_by: 'seed_script',
        approved_at: new Date().toISOString(),
        posted_at: new Date().toISOString(),
      })
      .select('journal_entry_id')
      .single();
    if (jeE) continue;
    const expId = pick(expenseIds);
    const line1 = {
      journal_entry_id: je.journal_entry_id,
      line_no: 1,
      account_id: expId,
      debit: amt,
      credit: 0,
      description: 'Operating expense (seed)',
    };
    if (Math.random() > 0.65) {
      line1.tax_scheme = 'standard_vat_input';
      line1.tax_rate = 18;
      line1.tax_amount = money2(amt * 0.18);
    }
    await supabase.from('journal_lines').insert([
      line1,
      {
        journal_entry_id: je.journal_entry_id,
        line_no: 2,
        account_id: apId,
        debit: 0,
        credit: amt,
        description: 'Accrued payable (seed)',
      },
    ]);
  }

  console.log('Creating draft / pending journals (SEED-DRAFT-*, compliance testing)…');
  const revId = accByCode['4000'];
  const bankGlId = accByCode['1100'];
  for (let k = 0; k < 20; k++) {
    const per = pick(periods || [{ period_id: 1, start_date: '2025-01-01' }]);
    const ref = `SEED-DRAFT-${runId}-${k}`;
    const { data: dje, error: dErr } = await supabase
      .from('journal_entries')
      .insert({
        entry_date: per.start_date || '2025-06-01',
        description: 'Seed accrual — not yet posted',
        source_type: 'manual',
        source_ref: ref,
        reference: ref,
        period_id: per.period_id,
        status: 'draft',
        approval_status: Math.random() > 0.35 ? 'pending' : 'approved',
        created_by: 'seed_script',
      })
      .select('journal_entry_id')
      .single();
    if (dErr || !dje) continue;
    const petty = money2(randInt(800, 45000));
    await supabase.from('journal_lines').insert([
      { journal_entry_id: dje.journal_entry_id, line_no: 1, account_id: accByCode['5900'], debit: petty, credit: 0, description: 'Draft expense' },
      { journal_entry_id: dje.journal_entry_id, line_no: 2, account_id: apId, debit: 0, credit: petty, description: 'Draft AP' },
    ]);
  }

  console.log('Creating posted revenue journals (SEED-REV-*, P&L / narrator testing)…');
  for (let r = 0; r < 28; r++) {
    const per = pick(periods || [{ period_id: 1, start_date: '2025-04-01' }]);
    const amt = money2(randInt(12000, 420000));
    const d = addDaysIso(per.start_date || '2025-04-01', randInt(0, 27));
    const ref = `SEED-REV-${runId}-${r}`;
    const { data: rje, error: rErr } = await supabase
      .from('journal_entries')
      .insert({
        entry_date: d,
        description: 'Seed customer receipt / freight revenue',
        source_type: 'system',
        source_ref: ref,
        reference: ref,
        period_id: per.period_id,
        status: 'posted',
        approval_status: 'approved',
        created_by: 'seed_script',
        approved_by: 'seed_script',
        approved_at: new Date().toISOString(),
        posted_at: new Date().toISOString(),
      })
      .select('journal_entry_id')
      .single();
    if (rErr || !rje) continue;
    await supabase.from('journal_lines').insert([
      { journal_entry_id: rje.journal_entry_id, line_no: 1, account_id: bankGlId, debit: amt, credit: 0, description: 'Bank receipt' },
      {
        journal_entry_id: rje.journal_entry_id,
        line_no: 2,
        account_id: revId,
        debit: 0,
        credit: amt,
        description: 'Transport / logistics revenue',
        tax_scheme: Math.random() > 0.5 ? 'standard_vat_output' : null,
        tax_rate: Math.random() > 0.5 ? 18 : null,
        tax_amount: Math.random() > 0.5 ? money2(amt * (18 / 118)) : null,
      },
    ]);
  }

  console.log('Creating bank accounts + transactions…');
  const bankNames = ['[SEED] HDFC Current ****4821', '[SEED] ICICI Ops ****9033', '[SEED] SBI Fleet ****1102'];
  const bankIds = [];
  for (const nm of bankNames) {
    const { data: ba, error: bErr } = await supabase
      .from('bank_accounts')
      .insert({ name: nm, currency_code: 'INR', gl_account_id: accByCode['1100'], last_four: String(randInt(1000, 9999)) })
      .select('bank_account_id')
      .single();
    if (!bErr && ba) bankIds.push(ba.bank_account_id);
  }

  const txnRows = [];
  let txCount = 0;
  const perBank = Math.max(1, Math.floor(NUM_BANK_TXNS / Math.max(bankIds.length, 1)));
  for (const bid of bankIds) {
    for (let t = 0; t < perBank && txCount < NUM_BANK_TXNS; t++) {
      const amt = money2(randInt(-250000, 180000) + Math.random());
      txnRows.push({
        bank_account_id: bid,
        txn_date: randomInvoiceDate(),
        amount: amt,
        description: pick(['NEFT — vendor', 'UPI inward', 'Fuel card settlement', 'CMS credit', 'Charges', 'Salary batch', 'GST refund credit']),
        reference: `SEED-TXN-${runId}-${txCount}-${bid}`,
        reconciliation_status: Math.random() > 0.55 ? 'unmatched' : 'suggested',
      });
      txCount++;
    }
  }

  const T_CHUNK = 200;
  for (let i = 0; i < txnRows.length; i += T_CHUNK) {
    const { error: tErr } = await supabase.from('bank_transactions').insert(txnRows.slice(i, i + T_CHUNK));
    if (tErr) console.warn('bank_transactions chunk:', tErr.message);
  }

  let paymentMatches = 0;
  if (bankIds.length) {
    console.log(`Backfilling bank ↔ AP reconciliation (~${Math.round(MATCH_PCT * 100)}% of posted INR invoices)…`);
    const { data: postedInv } = await supabase
      .from('invoice_header')
      .select('invoice_id,total_amount,invoice_date,vendor_name,journal_entry_id,currency')
      .eq('source', 'seed_demo')
      .not('journal_entry_id', 'is', null)
      .eq('currency', 'INR');
    const pool = postedInv || [];
    const targetN = Math.min(pool.length, Math.floor(pool.length * MATCH_PCT));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const toMatch = shuffled.slice(0, targetN);
    const jeIds = [...new Set(toMatch.map((inv) => inv.journal_entry_id))];
    const { data: apLines } = await supabase
      .from('journal_lines')
      .select('journal_entry_id, journal_line_id')
      .in('journal_entry_id', jeIds)
      .eq('account_id', apId)
      .gt('credit', 0);
    const apByJe = {};
    for (const row of apLines || []) {
      if (!apByJe[row.journal_entry_id]) apByJe[row.journal_entry_id] = row.journal_line_id;
    }
    const PAY_CHUNK = 120;
    for (let i = 0; i < toMatch.length; i += PAY_CHUNK) {
      const slice = toMatch.slice(i, i + PAY_CHUNK);
      const payRows = slice.map((inv) => ({
        bank_account_id: bankIds[randInt(0, bankIds.length - 1)],
        txn_date: addDaysIso(inv.invoice_date, randInt(0, 18)),
        amount: money2(-Math.abs(Number(inv.total_amount))),
        description: `NEFT OUT ${String(inv.vendor_name || 'Vendor').slice(0, 42)}`,
        reference: `SEED-PAY-${runId}-${inv.invoice_id}`,
        reconciliation_status: 'matched',
      }));
      const { data: payIns, error: pErr } = await supabase.from('bank_transactions').insert(payRows).select('bank_txn_id');
      if (pErr) {
        console.warn('payment bank_transactions:', pErr.message);
        continue;
      }
      const matches = [];
      for (let j = 0; j < slice.length; j++) {
        const inv = slice[j];
        const jline = apByJe[inv.journal_entry_id];
        const bt = payIns[j];
        if (!jline || !bt) continue;
        matches.push({
          bank_txn_id: bt.bank_txn_id,
          journal_entry_id: inv.journal_entry_id,
          journal_line_id: jline,
          match_type: pick(['rule', 'manual', 'suggested']),
          confidence: money2(88 + Math.random() * 11),
          note: 'Seed payment ↔ AP',
        });
      }
      if (matches.length) {
        const { error: mErr } = await supabase.from('reconciliation_matches').insert(matches);
        if (!mErr) paymentMatches += matches.length;
        else console.warn('reconciliation_matches:', mErr.message);
      }
    }
  }

  console.log('Creating fixed assets…');
  const faRows = [];
  for (let i = 0; i < 28; i++) {
    faRows.push({
      name: `ZZZ_SEED Vehicle / Plant ${i + 1}`,
      acquisition_date: randomInvoiceDate(),
      cost: money2(randInt(150000, 4500000)),
      salvage_value: money2(randInt(0, 50000)),
      depreciation_method: pick(['straight_line', 'declining_balance']),
      useful_life_months: pick([60, 84, 120]),
      gl_asset_account_id: accByCode['1200'],
      gl_accum_dep_account_id: accByCode['1200'],
      gl_dep_expense_account_id: accByCode['5900'],
      tax_scheme: 'capex_gst',
      notes: 'Seed fixed asset',
    });
  }
  await supabase.from('fixed_assets').insert(faRows);

  const badFa = [];
  for (let b = 0; b < 6; b++) {
    badFa.push({
      name: `ZZZ_SEED_BAD Incomplete asset ${b + 1}`,
      acquisition_date: randomInvoiceDate(),
      cost: money2(randInt(80000, 900000)),
      salvage_value: 0,
      depreciation_method: 'straight_line',
      useful_life_months: b % 2 === 0 ? null : 60,
      gl_asset_account_id: accByCode['1200'],
      gl_accum_dep_account_id: b % 3 === 0 ? null : accByCode['1200'],
      gl_dep_expense_account_id: b % 3 === 1 ? null : accByCode['5900'],
      tax_scheme: null,
      notes: 'Seed incomplete FA config (compliance testing)',
    });
  }
  await supabase.from('fixed_assets').insert(badFa);

  console.log('Creating document attachment metadata (invoice_header for compliance + legacy seed_demo_invoice)…');
  const { data: allSeedInv } = await supabase.from('invoice_header').select('invoice_id,total_amount').eq('source', 'seed_demo');
  const attHeader = [];
  const attLegacy = [];
  for (const row of allSeedInv || []) {
    const tot = Number(row.total_amount);
    const docRoll = Math.random();
    if (tot >= 12000 && docRoll < 0.78) {
      attHeader.push({
        entity_type: 'invoice_header',
        entity_id: String(row.invoice_id),
        public_url: `https://storage.demo.invalid/invoices/${runId}/${row.invoice_id}.pdf`,
        file_name: `Tax_Invoice_${row.invoice_id}.pdf`,
        mime_type: 'application/pdf',
        uploaded_by: 'seed_script',
      });
    } else if (tot >= 4000 && docRoll < 0.42) {
      attHeader.push({
        entity_type: 'invoice_header',
        entity_id: String(row.invoice_id),
        public_url: `https://storage.demo.invalid/invoices/${runId}/${row.invoice_id}.pdf`,
        file_name: `INV_${row.invoice_id}.pdf`,
        mime_type: 'application/pdf',
        uploaded_by: 'seed_script',
      });
    } else if (docRoll < 0.06) {
      attLegacy.push({
        entity_type: 'seed_demo_invoice',
        entity_id: String(row.invoice_id),
        public_url: `https://example.invalid/legacy/${row.invoice_id}.pdf`,
        file_name: `legacy_${row.invoice_id}.pdf`,
        mime_type: 'application/pdf',
        uploaded_by: 'seed_script',
      });
    }
  }
  const A_CHUNK = 300;
  for (let i = 0; i < attHeader.length; i += A_CHUNK) {
    const { error: aErr } = await supabase.from('document_attachments').insert(attHeader.slice(i, i + A_CHUNK));
    if (aErr) console.warn('document_attachments (invoice_header):', aErr.message);
  }
  for (let i = 0; i < attLegacy.length; i += A_CHUNK) {
    await supabase.from('document_attachments').insert(attLegacy.slice(i, i + A_CHUNK));
  }

  console.log('Seeding month-end tasks (empty periods only)…');
  for (const p of (periods || []).slice(0, 8)) {
    const { data: has } = await supabase.from('month_end_tasks').select('task_id').eq('period_id', p.period_id).limit(1);
    if (has?.length) continue;
    const rows = [
      { period_id: p.period_id, task_key: 'bank_reconciled', title: 'Bank accounts reconciled', sort_order: 10 },
      { period_id: p.period_id, task_key: 'review_accruals', title: 'Review accruals and prepayments', sort_order: 20 },
      { period_id: p.period_id, task_key: 'review_ap_aging', title: 'Review AP aging', sort_order: 30 },
      { period_id: p.period_id, task_key: 'tax_summary', title: 'Prepare tax summary / advisor pack', sort_order: 40 },
      { period_id: p.period_id, task_key: 'lock_period', title: 'Soft-close or lock period after sign-off', sort_order: 50 },
    ];
    await supabase.from('month_end_tasks').insert(rows);
  }

  await supabase.from('audit_events').insert({
    entity_type: 'system',
    entity_id: 'seed',
    action: 'demo_dataset_loaded',
    payload: {
      invoices: NUM_INVOICES,
      vendors: NUM_VENDORS,
      bank_txns_misc: txnRows.length,
      bank_payment_matches: paymentMatches,
      match_pct: MATCH_PCT,
      runId,
    },
    actor: 'seed_script',
  });

  console.log('\nDone.');
  console.log(`  Invoices (seed_demo): ${NUM_INVOICES}`);
  console.log(`  Vendors (ZZZ_SEED%): ${NUM_VENDORS}`);
  console.log(`  Ledger posts attempted: ${posted}`);
  console.log(`  Bank accounts: ${bankNames.length}, misc txns: ${txnRows.length}, AP payment matches: ${paymentMatches}`);
  console.log(`  Attachments on invoice_header: ${attHeader.length} (+ legacy seed_demo_invoice: ${attLegacy.length})`);
  console.log('Open http://localhost:3001/ → Reports, Bank, Money Trace, AI modules, Month-end.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
