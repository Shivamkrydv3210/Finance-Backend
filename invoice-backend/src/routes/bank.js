import { Router } from 'express';
import {
  createBankAccount,
  listBankAccounts,
  importBankRows,
  listBankTransactions,
  suggestMatchesForTransaction,
  recordMatch,
} from '../services/bank/bankService.js';

const router = Router();

router.post('/bank/accounts', async (req, res) => {
  try {
    const row = await createBankAccount(req.body || {});
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/bank/accounts', async (_req, res) => {
  try {
    res.json({ accounts: await listBankAccounts() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Body: { rows: [{ txn_date, amount, description?, reference?, balance_after? }], filename? }
 * Or CSV string in body.csv with header row: date,amount,description,reference
 */
router.post('/bank/accounts/:bankAccountId/import', async (req, res) => {
  try {
    const bankAccountId = Number(req.params.bankAccountId);
    let rows = req.body?.rows;
    if (!rows && req.body?.csv) {
      rows = parseSimpleCsv(req.body.csv);
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Provide rows[] or csv string' });
    }
    const out = await importBankRows(bankAccountId, rows, req.body?.filename);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/bank/accounts/:bankAccountId/transactions', async (req, res) => {
  try {
    const list = await listBankTransactions(Number(req.params.bankAccountId), {
      status: req.query.status,
      fromDate: req.query.from,
      toDate: req.query.to,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json({ transactions: list });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/bank/transactions/:bankTxnId/suggestions', async (req, res) => {
  try {
    res.json(await suggestMatchesForTransaction(Number(req.params.bankTxnId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bank/transactions/:bankTxnId/match', async (req, res) => {
  try {
    const row = await recordMatch(Number(req.params.bankTxnId), req.body || {});
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function parseSimpleCsv(text) {
  const lines = String(text)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name, ...alts) => {
    const all = [name, ...alts];
    for (const a of all) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = idx('date', 'txn_date', 'transaction_date');
  const iAmt = idx('amount', 'amt');
  const iDesc = idx('description', 'desc', 'narration');
  const iRef = idx('reference', 'ref');
  const iBal = idx('balance', 'balance_after');
  if (iDate < 0 || iAmt < 0) throw new Error('CSV must include date and amount columns');

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const txn_date = cols[iDate]?.slice(0, 10);
    const amount = parseFloat(String(cols[iAmt]).replace(/,/g, ''));
    if (!txn_date || Number.isNaN(amount)) continue;
    out.push({
      txn_date,
      amount,
      description: iDesc >= 0 ? cols[iDesc] : null,
      reference: iRef >= 0 ? cols[iRef] : null,
      balance_after: iBal >= 0 ? parseFloat(String(cols[iBal]).replace(/,/g, '')) : null,
      raw: { row: cols },
    });
  }
  return out;
}

export default router;
