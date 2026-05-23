import { Router } from 'express';
import { analyzeForTaxOptimization } from '../services/ai/taxAdvisorService.js';
import { runAnomalyDetection } from '../services/ai/anomalyService.js';
import { narrateReport } from '../services/ai/reportNarratorService.js';
import { forecastCashFlow } from '../services/ai/cashFlowService.js';
import { analyzeVendors } from '../services/ai/vendorIntelService.js';
import { runComplianceAudit } from '../services/ai/complianceService.js';

const router = Router();

router.get('/ai/tax-optimization', async (_req, res) => {
  try {
    res.json(await analyzeForTaxOptimization());
  } catch (err) {
    console.error('AI Tax Advisor error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ai/anomalies', async (_req, res) => {
  try {
    res.json(await runAnomalyDetection());
  } catch (err) {
    console.error('AI Anomaly Detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai/narrate-report', async (req, res) => {
  try {
    const { report_type, from, to, as_of } = req.body || {};
    if (!report_type) return res.status(400).json({ error: 'report_type required (pl, tb, bs, tax)' });
    res.json(await narrateReport({ report_type, from, to, as_of }));
  } catch (err) {
    console.error('AI Report Narrator error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ai/cash-flow-forecast', async (_req, res) => {
  try {
    res.json(await forecastCashFlow());
  } catch (err) {
    console.error('AI Cash Flow Forecast error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ai/vendor-intelligence', async (_req, res) => {
  try {
    res.json(await analyzeVendors());
  } catch (err) {
    console.error('AI Vendor Intelligence error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/ai/compliance-check', async (_req, res) => {
  try {
    res.json(await runComplianceAudit());
  } catch (err) {
    console.error('AI Compliance Audit error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
