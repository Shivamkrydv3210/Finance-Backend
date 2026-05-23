import { Router } from 'express';
import { traceFromQuery } from '../services/trace/moneyTraceService.js';

const router = Router();

/**
 * GET /api/trace?from=invoice:123|je:45|journal_line:9|bank_txn:1|account:5100
 * For account: also pass from=YYYY-MM-DD&to=YYYY-MM-DD&limit=25
 */
router.get('/trace', async (req, res) => {
  try {
    const fromParam = req.query.from || req.query.q;
    if (!fromParam) {
      return res.status(400).json({
        error: 'Query param "from" required, e.g. from=invoice:123, je:45, journal_line:9, bank_txn:1, account:5100',
      });
    }
    const result = await traceFromQuery(fromParam, {
      fromDate: req.query.from_date || req.query.period_from,
      toDate: req.query.to_date || req.query.period_to,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
