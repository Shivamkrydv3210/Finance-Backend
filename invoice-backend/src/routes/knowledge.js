import { Router } from 'express';
import {
  getKnowledgeSummary,
  getVatRate,
  getVatLiabilityType,
  getVatRegistrationThreshold,
  getVatDeregistrationThreshold,
  getInputTaxBlock,
  getVatAdminRules,
  getCorporationTaxRate,
  getAnnualInvestmentAllowance,
  getFullExpensing,
  getFirstYearAllowance40,
  getCapitalAllowance,
  getSmallPoolsAllowance,
  getCtDisallowable,
  getCtDeadlines,
  getDirectorsLoanRules,
  getPersonalAllowance,
  getIncomeTaxBands,
  getNicRates,
  getApprenticeshipLevy,
  getAutoEnrolmentThresholds,
  getStudentLoanThresholds,
  getPayrollObligations,
  getCisDeductionRate,
  getCisObligations,
  getCisDomesticReverseCharge,
  classifyCompanySize,
  getStatutoryHeadings,
  getFilingDeadlines,
  getRecordKeepingRules,
  listExpenseRules,
  getExpenseRule,
} from '../knowledge/uk-tax/index.js';

const router = Router();

// GET /api/knowledge/summary?as_at=YYYY-MM-DD
router.get('/knowledge/summary', (req, res) => {
  try {
    res.json(getKnowledgeSummary(req.query.as_at));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/vat?as_at=YYYY-MM-DD
router.get('/knowledge/vat', (req, res) => {
  try {
    const asAt = req.query.as_at;
    res.json({
      as_at: asAt || new Date().toISOString().slice(0, 10),
      rates: { standard: getVatRate('standard', asAt), reduced: getVatRate('reduced', asAt), zero: getVatRate('zero', asAt) },
      liability_types: ['standard', 'reduced', 'zero', 'exempt', 'outside_scope'].map(getVatLiabilityType),
      registration_threshold: getVatRegistrationThreshold(asAt),
      deregistration_threshold: getVatDeregistrationThreshold(asAt),
      input_tax_blocks: ['business_entertainment', 'motor_car_purchase', 'motor_car_lease', 'non_business_use', 'exempt_supplies'].map(getInputTaxBlock),
      admin_rules: getVatAdminRules(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/corporation-tax?as_at=YYYY-MM-DD&profit=100000&associated_companies=0
router.get('/knowledge/corporation-tax', (req, res) => {
  try {
    const asAt = req.query.as_at;
    const profit = req.query.profit != null ? Number(req.query.profit) : 100000;
    const associatedCompanies = req.query.associated_companies != null ? Number(req.query.associated_companies) : 0;
    res.json({
      rate_calculation: getCorporationTaxRate(profit, asAt, { associatedCompanies }),
      capital_allowances: {
        annual_investment_allowance: getAnnualInvestmentAllowance(asAt),
        full_expensing_main_pool: getFullExpensing('main_pool', asAt),
        full_expensing_special_rate_pool: getFullExpensing('special_rate_pool', asAt),
        first_year_allowance_40pct: getFirstYearAllowance40(asAt),
        writing_down_allowance_main_pool: getCapitalAllowance('main_pool', asAt),
        writing_down_allowance_special_rate_pool: getCapitalAllowance('special_rate_pool', asAt),
        small_pools_allowance: getSmallPoolsAllowance(asAt),
      },
      disallowable_expenditure: getCtDisallowable(),
      deadlines: getCtDeadlines(),
      directors_loan: getDirectorsLoanRules(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/payroll?as_at=YYYY-MM-DD&region=england_ni
router.get('/knowledge/payroll', (req, res) => {
  try {
    const asAt = req.query.as_at;
    const region = req.query.region || 'england_ni';
    res.json({
      personal_allowance: getPersonalAllowance(asAt),
      income_tax_bands: getIncomeTaxBands(asAt, region),
      nic: getNicRates(asAt),
      apprenticeship_levy: getApprenticeshipLevy(asAt),
      auto_enrolment: getAutoEnrolmentThresholds(asAt),
      student_loans: getStudentLoanThresholds(asAt),
      obligations: getPayrollObligations(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/cis?as_at=YYYY-MM-DD
router.get('/knowledge/cis', (req, res) => {
  try {
    const asAt = req.query.as_at;
    res.json({
      deduction_rates: {
        gross: getCisDeductionRate('gross', asAt),
        registered: getCisDeductionRate('registered', asAt),
        unregistered: getCisDeductionRate('unregistered', asAt),
      },
      obligations: getCisObligations(),
      domestic_reverse_charge: getCisDomesticReverseCharge(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/expense-rules
router.get('/knowledge/expense-rules', (_req, res) => {
  try {
    res.json({ rules: listExpenseRules() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/expense-rules/:key
router.get('/knowledge/expense-rules/:key', (req, res) => {
  try {
    const rule = getExpenseRule(req.params.key);
    if (!rule) return res.status(404).json({ error: `No expense rule for "${req.params.key}"` });
    res.json(rule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/knowledge/companies-act?as_at=YYYY-MM-DD
router.get('/knowledge/companies-act', (req, res) => {
  try {
    res.json({
      statutory_headings: getStatutoryHeadings(),
      filing_deadlines: getFilingDeadlines(),
      record_keeping: getRecordKeepingRules(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/knowledge/company-size - body: { turnover, balance_sheet_total, employees, as_at? }
router.post('/knowledge/company-size', (req, res) => {
  try {
    const { turnover, balance_sheet_total, employees, as_at } = req.body || {};
    res.json(classifyCompanySize({ turnover, balanceSheetTotal: balance_sheet_total, employees }, as_at));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
