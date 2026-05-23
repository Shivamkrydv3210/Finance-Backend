import { Router } from 'express';
import { extractFromImageUrl } from '../services/extractService.js';
import { saveExtractedInvoice, saveTypedInvoice } from '../services/saveService.js';
import { queryInvoicesNL } from '../services/queryService.js';
import { getInvoiceStats } from '../services/statsService.js';
import { listInvoices, getInvoiceById } from '../services/invoiceListService.js';

const router = Router();

router.get('/invoices', async (req, res) => {
  try {
    const result = await listInvoices({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const row = await getInvoiceById(req.params.invoiceId);
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/extract - body: { url }
router.post('/extract', async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await extractFromImageUrl(url);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/invoices - body: either { extracted: {...} } or flat fields { vendor_name, invoice_number, ... }
router.post('/invoices', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.extracted && typeof body.extracted === 'object') {
      const result = await saveExtractedInvoice(body.extracted, {
        post_to_ledger: body.post_to_ledger,
        actor: body.actor,
      });
      res.json(result);
    } else {
      const result = await saveTypedInvoice({
        vendor_name: body.vendor_name,
        invoice_number: body.invoice_number,
        invoice_date: body.invoice_date,
        total_amount: body.total_amount,
        currency: body.currency,
        category: body.category,
        tax_amount: body.tax_amount,
        subtotal: body.subtotal,
        notes: body.notes,
        vendor_email: body.vendor_email,
        vendor_phone: body.vendor_phone,
        vendor_address: body.vendor_address,
        due_date: body.due_date,
        payment_mode: body.payment_mode,
        post_to_ledger: body.post_to_ledger,
      });
      res.json(result);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/query - body: { question }
router.post('/query', async (req, res) => {
  try {
    const { question } = req.body || {};
    const result = await queryInvoicesNL(question);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/stats?period=2025-07
router.get('/stats', async (req, res) => {
  try {
    const period = req.query.period || '';
    const result = await getInvoiceStats(period);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
