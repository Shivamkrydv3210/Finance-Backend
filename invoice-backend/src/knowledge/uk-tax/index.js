/**
 * UK Tax Knowledge Base — public query API.
 *
 * This is the only module other parts of the app should import from
 * `src/knowledge/uk-tax/`. Everything is a pure function of (arguments, asAt) —
 * no I/O, no database — so it's trivially testable and every answer can be
 * reproduced for a historical date. Every returned rule carries a `citation`.
 */
import { toIsoDate, resolveAsAt, ctFinancialYearFor, ukTaxYearFor } from './effectiveDating.js';
import { VAT_RATES, VAT_LIABILITY_TYPES, INPUT_TAX_BLOCKS, VAT_THRESHOLDS, VAT_ADMIN_RULES, RATE_MATCH_TOLERANCE_PCT } from './vat.js';
import { CORPORATION_TAX_RATES, CAPITAL_ALLOWANCES, CT_DISALLOWABLE, CT_DEADLINES, DIRECTORS_LOAN } from './corporationTax.js';
import { INCOME_TAX_BANDS, NATIONAL_INSURANCE, AUTO_ENROLMENT, STUDENT_LOANS, APPRENTICESHIP_LEVY, PERSONAL_ALLOWANCE, PAYROLL_OBLIGATIONS } from './payroll.js';
import { CIS_DEDUCTION_RATES, CIS_OBLIGATIONS, CIS_DOMESTIC_REVERSE_CHARGE, CIS_EXCLUDED_FROM_DEDUCTION } from './cis.js';
import {
  COMPANY_SIZE_THRESHOLDS,
  BALANCE_SHEET_HEADING_ORDER,
  PROFIT_AND_LOSS_HEADING_ORDER,
  STATUTORY_FORMAT_LABEL,
  STATUTORY_FORMAT_CITATION,
  FILING_DEADLINES,
  RECORD_KEEPING,
} from './companiesAct.js';
import { EXPENSE_RULES, findExpenseRule, IRRECOVERABLE_VAT_ACCOUNT_CODE } from './expenseRules.js';

export { toIsoDate };

// ─── VAT ──────────────────────────────────────────────────────────────────

/** The system's GL account mapping for VAT postings — not itself a legal fact, but the wiring every module should share instead of hardcoding codes. */
export const VAT_GL_ACCOUNTS = {
  input_recoverable: '1310',
  output_payable: '2110',
  control: '2120',
  irrecoverable: IRRECOVERABLE_VAT_ACCOUNT_CODE,
};

export function getVatRate(rateType, asAt) {
  const rule = resolveAsAt(
    VAT_RATES.filter((r) => r.rate_type === rateType),
    asAt
  );
  if (!rule) throw new Error(`No VAT rate found for "${rateType}" as at ${toIsoDate(asAt)}`);
  return rule;
}

/** Snaps a percentage to the VAT rate in force on that date (within tolerance), or 'non_standard'. */
export function classifyVatRate(ratePct, asAt) {
  const rate = Number(ratePct);
  if (!Number.isFinite(rate)) return 'non_standard';
  for (const type of ['standard', 'reduced', 'zero']) {
    const rule = getVatRate(type, asAt);
    if (Math.abs(rate - rule.value) <= RATE_MATCH_TOLERANCE_PCT) return type;
  }
  return 'non_standard';
}

export function getVatLiabilityType(key) {
  return VAT_LIABILITY_TYPES.find((t) => t.key === key) || null;
}

export function getVatRegistrationThreshold(asAt) {
  return resolveAsAt(
    VAT_THRESHOLDS.filter((t) => t.key === 'registration'),
    asAt
  );
}

export function getVatDeregistrationThreshold(asAt) {
  return resolveAsAt(
    VAT_THRESHOLDS.filter((t) => t.key === 'deregistration'),
    asAt
  );
}

export function getInputTaxBlock(key) {
  return INPUT_TAX_BLOCKS.find((b) => b.key === key) || null;
}

export function getVatAdminRules() {
  return VAT_ADMIN_RULES;
}

// ─── Corporation Tax ────────────────────────────────────────────────────────

function findCtRateRow(asAt) {
  const fy = ctFinancialYearFor(asAt);
  return CORPORATION_TAX_RATES.find((r) => r.financial_year === fy) || null;
}

/**
 * Corporation Tax due on a profit figure, applying Marginal Relief when the
 * profit falls between the lower and upper limits.
 *
 * Assumes augmented profits equal net profits (no franked investment income) —
 * the common case for a single company with no dividend income from other
 * companies. `associatedCompanies` proportionately divides the limits, per
 * CTA 2010 — pass the count of *other* associated companies (not including
 * this one).
 */
export function getCorporationTaxRate(profit, asAt, { associatedCompanies = 0 } = {}) {
  const row = findCtRateRow(asAt);
  if (!row) throw new Error(`No Corporation Tax rate found for ${toIsoDate(asAt)}`);
  const divisor = 1 + Math.max(0, associatedCompanies);
  const lowerLimit = row.lower_limit / divisor;
  const upperLimit = row.upper_limit / divisor;
  const p = Number(profit) || 0;

  let tax;
  let effective_rate_pct;
  let band;
  if (p <= 0) {
    tax = 0;
    effective_rate_pct = 0;
    band = 'nil';
  } else if (p <= lowerLimit) {
    tax = (p * row.small_profits_rate_pct) / 100;
    effective_rate_pct = row.small_profits_rate_pct;
    band = 'small_profits_rate';
  } else if (p >= upperLimit) {
    tax = (p * row.main_rate_pct) / 100;
    effective_rate_pct = row.main_rate_pct;
    band = 'main_rate';
  } else {
    const marginalRelief = (upperLimit - p) * row.marginal_relief_fraction;
    tax = (p * row.main_rate_pct) / 100 - marginalRelief;
    effective_rate_pct = (tax / p) * 100;
    band = 'marginal_relief';
  }

  return {
    financial_year: row.financial_year,
    profit: p,
    band,
    lower_limit: lowerLimit,
    upper_limit: upperLimit,
    tax_due: Math.round(tax * 100) / 100,
    effective_rate_pct: Math.round(effective_rate_pct * 100) / 100,
    main_rate_pct: row.main_rate_pct,
    small_profits_rate_pct: row.small_profits_rate_pct,
    marginal_relief_fraction_label: row.marginal_relief_fraction_label,
    citation: row.citation,
  };
}

export function getCtDisallowable(key) {
  if (key) return CT_DISALLOWABLE.find((d) => d.key === key) || null;
  return CT_DISALLOWABLE;
}

export function getCtDeadlines() {
  return CT_DEADLINES;
}

export function getDirectorsLoanRules() {
  return DIRECTORS_LOAN;
}

// ─── Capital allowances ─────────────────────────────────────────────────────

export function getAnnualInvestmentAllowance(asAt) {
  return resolveAsAt(CAPITAL_ALLOWANCES.annual_investment_allowance, asAt);
}

export function getFullExpensing(pool, asAt) {
  return resolveAsAt(
    CAPITAL_ALLOWANCES.full_expensing.filter((r) => r.applies_to === pool),
    asAt
  );
}

export function getFirstYearAllowance40(asAt) {
  return resolveAsAt(CAPITAL_ALLOWANCES.first_year_allowance_40pct, asAt);
}

/** Writing-down allowance for a pool ('main_pool' | 'special_rate_pool') as at a date. */
export function getCapitalAllowance(pool, asAt) {
  const rule = resolveAsAt(
    CAPITAL_ALLOWANCES.writing_down_allowance.filter((r) => r.pool === pool),
    asAt
  );
  if (!rule) throw new Error(`No writing-down allowance found for "${pool}" as at ${toIsoDate(asAt)}`);
  return rule;
}

export function getSmallPoolsAllowance(asAt) {
  return resolveAsAt(CAPITAL_ALLOWANCES.small_pools_allowance, asAt);
}

// ─── Payroll: Income Tax, NIC, auto-enrolment, student loans ────────────────

export function getPersonalAllowance(asAt) {
  const ty = ukTaxYearFor(asAt);
  return PERSONAL_ALLOWANCE.find((p) => p.tax_year === ty) || null;
}

/** @param {string} [region] - 'england_ni' | 'wales' | 'scotland' */
export function getIncomeTaxBands(asAt, region = 'england_ni') {
  const ty = ukTaxYearFor(asAt);
  return INCOME_TAX_BANDS.find((b) => b.tax_year === ty && b.region === region) || null;
}

export function getNicRates(asAt) {
  const ty = ukTaxYearFor(asAt);
  return NATIONAL_INSURANCE.find((n) => n.tax_year === ty) || null;
}

export function getApprenticeshipLevy(asAt) {
  const ty = ukTaxYearFor(asAt);
  return APPRENTICESHIP_LEVY.find((a) => a.tax_year === ty) || null;
}

export function getAutoEnrolmentThresholds(asAt) {
  const ty = ukTaxYearFor(asAt);
  return AUTO_ENROLMENT.find((a) => a.tax_year === ty) || null;
}

export function getStudentLoanThresholds(asAt) {
  const ty = ukTaxYearFor(asAt);
  return STUDENT_LOANS.find((s) => s.tax_year === ty) || null;
}

export function getPayrollObligations() {
  return PAYROLL_OBLIGATIONS;
}

// ─── CIS ─────────────────────────────────────────────────────────────────

/** @param {string} status - 'gross' | 'registered' | 'unregistered' */
export function getCisDeductionRate(status, asAt) {
  return resolveAsAt(
    CIS_DEDUCTION_RATES.filter((r) => r.status === status),
    asAt
  );
}

export function getCisObligations() {
  return CIS_OBLIGATIONS;
}

export function getCisDomesticReverseCharge() {
  return CIS_DOMESTIC_REVERSE_CHARGE;
}

export function getCisExcludedFromDeduction() {
  return CIS_EXCLUDED_FROM_DEDUCTION;
}

// ─── Companies Act: size classification, statutory formats ────────────────

/**
 * Classifies a company by size — meets a category if it satisfies at least 2 of
 * the 3 criteria. Returns the smallest (most generous) category that fits.
 */
export function classifyCompanySize({ turnover, balanceSheetTotal, employees }, asAt) {
  const order = ['micro_entity', 'small', 'medium'];
  for (const size of order) {
    const t = resolveAsAt(
      COMPANY_SIZE_THRESHOLDS.filter((c) => c.size === size),
      asAt
    );
    if (!t) continue;
    const criteriaMet = [turnover != null && turnover <= t.turnover_max, balanceSheetTotal != null && balanceSheetTotal <= t.balance_sheet_total_max, employees != null && employees <= t.employees_max].filter(
      Boolean
    ).length;
    if (criteriaMet >= t.criteria_required) return { size, thresholds: t };
  }
  return { size: 'large', thresholds: null };
}

export function getStatutoryHeadings() {
  return {
    balance_sheet: BALANCE_SHEET_HEADING_ORDER,
    profit_and_loss: PROFIT_AND_LOSS_HEADING_ORDER,
    format: STATUTORY_FORMAT_LABEL,
    citation: STATUTORY_FORMAT_CITATION,
  };
}

export function getFilingDeadlines() {
  return FILING_DEADLINES;
}

export function getRecordKeepingRules() {
  return RECORD_KEEPING;
}

// ─── Expense rules (VAT recovery + CT deductibility by category) ──────────

export function getExpenseRule(key) {
  return findExpenseRule(key);
}

export function listExpenseRules() {
  return EXPENSE_RULES;
}

// ─── Summary (for the /api/knowledge/summary endpoint and AI grounding) ────

export function getKnowledgeSummary(asAt) {
  const date = toIsoDate(asAt);
  return {
    as_at: date,
    vat: {
      standard_rate: getVatRate('standard', date).value,
      reduced_rate: getVatRate('reduced', date).value,
      zero_rate: getVatRate('zero', date).value,
      registration_threshold: getVatRegistrationThreshold(date)?.value,
    },
    corporation_tax: getCorporationTaxRate(0, date),
    capital_allowances: {
      aia: getAnnualInvestmentAllowance(date)?.value,
      main_pool_wda_pct: getCapitalAllowance('main_pool', date).rate_pct,
      special_rate_pool_wda_pct: getCapitalAllowance('special_rate_pool', date).rate_pct,
      first_year_allowance_40pct: getFirstYearAllowance40(date)?.rate_pct ?? null,
    },
    payroll: {
      personal_allowance: getPersonalAllowance(date)?.value,
      nic: getNicRates(date),
    },
    cis: {
      registered_pct: getCisDeductionRate('registered', date)?.rate_pct,
      unregistered_pct: getCisDeductionRate('unregistered', date)?.rate_pct,
    },
    statutory_format: STATUTORY_FORMAT_LABEL,
  };
}
