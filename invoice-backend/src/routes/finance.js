import { Router } from 'express';
import { supabase } from '../db.js';
import { listAccounts, getAccountByCode } from '../services/ledger/accountService.js';
import { listPeriods, updatePeriodStatus, getPeriodForDate } from '../services/ledger/periodService.js';
import { createJournalEntry, listJournalEntries, setJournalApproval, postDraftJournal } from '../services/ledger/journalService.js';
import { postInvoiceToLedger } from '../services/posting/invoicePostingService.js';
import { trialBalance, profitAndLoss, balanceSheet, taxRegister } from '../services/reports/financialReportService.js';

const router = Router();

router.get('/finance/accounts', async (_req, res) => {
  try {
    res.json({ accounts: await listAccounts(true) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/periods', async (_req, res) => {
  try {
    res.json({ periods: await listPeriods(36) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/finance/periods/:periodId/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const row = await updatePeriodStatus(Number(req.params.periodId), status);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/reports/trial-balance', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
    res.json({ report: 'trial_balance', rows: await trialBalance(from, to) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/reports/pl', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    res.json(await profitAndLoss(from, to));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/reports/balance-sheet', async (req, res) => {
  try {
    const { as_of } = req.query;
    if (!as_of) return res.status(400).json({ error: 'as_of required' });
    res.json(await balanceSheet(as_of));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/reports/tax-register', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    res.json({ report: 'tax_register', rows: await taxRegister(from, to) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Advisor / localization pack: TB + tax lines in one JSON (extend with country mappers later). */
router.get('/finance/reports/export-pack', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    const [tb, tax] = await Promise.all([trialBalance(from, to), taxRegister(from, to)]);
    res.json({
      version: 1,
      period: { from, to },
      trial_balance: tb,
      tax_register: tax,
      localization_note: 'Map tax_scheme values to return lines in country-specific exporters (e.g. India GST).',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/finance/journals', async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    res.json({ entries: await listJournalEntries({ fromDate: from, toDate: to, limit: limit ? Number(limit) : 100 }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/finance/journals', async (req, res) => {
  try {
    const { entry_date, description, reference, lines, created_by, auto_approve } = req.body || {};
    if (!entry_date || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: 'entry_date and at least two lines required' });
    }
    const period = await getPeriodForDate(entry_date);
    if (period.status === 'locked') return res.status(400).json({ error: 'Period locked' });

    const resolved = [];
    let lineNo = 1;
    for (const ln of lines) {
      let accountId = ln.account_id;
      if (!accountId && ln.account_code) {
        const acc = await getAccountByCode(String(ln.account_code));
        if (!acc) return res.status(400).json({ error: `Unknown account_code ${ln.account_code}` });
        accountId = acc.account_id;
      }
      if (!accountId) return res.status(400).json({ error: 'Each line needs account_id or account_code' });
      resolved.push({
        line_no: lineNo++,
        account_id: accountId,
        debit: Number(ln.debit || 0),
        credit: Number(ln.credit || 0),
        description: ln.description,
        dimensions: ln.dimensions,
        tax_scheme: ln.tax_scheme,
        tax_rate: ln.tax_rate,
        tax_amount: ln.tax_amount,
        party_type: ln.party_type,
        party_id: ln.party_id,
        currency_code: ln.currency_code,
      });
    }

    const result = await createJournalEntry(
      {
        entry_date,
        description,
        source_type: 'manual',
        source_ref: null,
        reference,
        period_id: period.period_id,
        created_by: created_by || 'api',
        lines: resolved,
      },
      { skipApproval: auto_approve !== false }
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/finance/invoices/:invoiceId/post-ledger', async (req, res) => {
  try {
    const id = Number(req.params.invoiceId);
    const { data: inv, error } = await supabase.from('invoice_header').select('*').eq('invoice_id', id).single();
    if (error || !inv) return res.status(404).json({ error: 'Invoice not found' });
    const out = await postInvoiceToLedger(id, inv, { actor: req.body?.actor || 'api' });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/finance/journals/:journalEntryId/approval', async (req, res) => {
  try {
    const { approval_status, actor } = req.body || {};
    const row = await setJournalApproval(Number(req.params.journalEntryId), {
      approval_status,
      actor: actor || 'api',
    });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/finance/journals/:journalEntryId/post', async (req, res) => {
  try {
    const row = await postDraftJournal(Number(req.params.journalEntryId), req.body?.actor || 'api');
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
