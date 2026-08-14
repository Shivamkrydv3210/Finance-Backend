import { cite } from './sources.js';

/**
 * Companies Act 2006 reporting: company size classification, the statutory
 * accounts formats, filing deadlines and record retention.
 *
 * The statutory heading orders below are the single source of truth for how the
 * balance sheet and P&L are grouped — financialReportService.js imports them from
 * here rather than keeping its own copy.
 */

/**
 * Size thresholds. A company qualifies for a size category if it meets at least
 * TWO of the three criteria. The monetary thresholds were uplifted by roughly 50%
 * by SI 2024/1303 for financial years beginning on or after 6 April 2025.
 */
export const COMPANY_SIZE_THRESHOLDS = [
  {
    size: 'micro_entity',
    label: 'Micro-entity',
    turnover_max: 1000000,
    balance_sheet_total_max: 500000,
    employees_max: 10,
    criteria_required: 2,
    effective_from: '2025-04-06',
    effective_to: null,
    citation: cite('COMPANY_SIZE_THRESHOLDS'),
  },
  {
    size: 'small',
    label: 'Small company',
    turnover_max: 15000000,
    balance_sheet_total_max: 7500000,
    employees_max: 50,
    criteria_required: 2,
    effective_from: '2025-04-06',
    effective_to: null,
    citation: cite('COMPANY_SIZE_THRESHOLDS'),
  },
  {
    size: 'medium',
    label: 'Medium-sized company',
    turnover_max: 54000000,
    balance_sheet_total_max: 27000000,
    employees_max: 250,
    criteria_required: 2,
    effective_from: '2025-04-06',
    effective_to: null,
    citation: cite('SI_2024_1303', 'reg 10'),
  },
  // Pre-uplift thresholds, retained so historical periods classify correctly.
  {
    size: 'micro_entity',
    label: 'Micro-entity',
    turnover_max: 632000,
    balance_sheet_total_max: 316000,
    employees_max: 10,
    criteria_required: 2,
    effective_from: '2016-01-01',
    effective_to: '2025-04-05',
    citation: cite('COMPANIES_ACT_2006', 's.384A'),
  },
  {
    size: 'small',
    label: 'Small company',
    turnover_max: 10200000,
    balance_sheet_total_max: 5100000,
    employees_max: 50,
    criteria_required: 2,
    effective_from: '2016-01-01',
    effective_to: '2025-04-05',
    citation: cite('COMPANIES_ACT_2006', 's.382'),
  },
  {
    size: 'medium',
    label: 'Medium-sized company',
    turnover_max: 36000000,
    balance_sheet_total_max: 18000000,
    employees_max: 250,
    criteria_required: 2,
    effective_from: '2016-01-01',
    effective_to: '2025-04-05',
    citation: cite('COMPANIES_ACT_2006', 's.465'),
  },
];

/**
 * Balance sheet captions in statutory order — SI 2008/409 Schedule 1, Format 1.
 * Every GL account carries a `statutory_heading` matching one of these strings.
 */
export const BALANCE_SHEET_HEADING_ORDER = [
  'Fixed assets - Intangible',
  'Fixed assets - Tangible',
  'Current assets - Stocks',
  'Current assets - Debtors',
  'Current assets - Cash at bank and in hand',
  'Creditors: amounts falling due within one year',
  'Creditors: amounts falling due after more than one year',
  'Provisions for liabilities',
  'Capital and reserves',
];

/** Profit and loss captions in statutory order — SI 2008/409 Schedule 1, Format 1. */
export const PROFIT_AND_LOSS_HEADING_ORDER = [
  'Turnover',
  'Cost of sales',
  'Administrative expenses',
  'Interest payable and similar charges',
  'Taxation',
];

export const STATUTORY_FORMAT_LABEL = 'Companies Act 2006 / SI 2008/409 Sch 1, Format 1';

export const STATUTORY_FORMAT_CITATION = cite('SI_2008_409', 'Schedule 1, Format 1');

export const FILING_DEADLINES = {
  private_company_accounts: {
    months_after_period_end: 9,
    description: 'A private company must file its accounts with Companies House within 9 months of the accounting reference date.',
    citation: cite('COMPANIES_ACT_2006', 's.442'),
  },
  public_company_accounts: {
    months_after_period_end: 6,
    description: 'A public company must file its accounts within 6 months of the accounting reference date.',
    citation: cite('COMPANIES_ACT_2006', 's.442'),
  },
  confirmation_statement: {
    description: 'A confirmation statement must be filed at least once every 12 months, within 14 days of the end of the review period.',
    citation: cite('COMPANIES_ACT_2006', 's.853A'),
  },
};

export const RECORD_KEEPING = {
  accounting_records_years: {
    value: 6,
    description:
      'A private company must keep adequate accounting records for 3 years (6 years for a public company); HMRC separately requires company records to be kept for 6 years from the end of the accounting period. Records must be sufficient to show and explain the company’s transactions and disclose its financial position with reasonable accuracy at any time.',
    citation: cite('COMPANIES_ACT_2006', 'ss.386–388'),
  },
  correction_principle: {
    description:
      'Posted accounting entries must not be edited or deleted. Corrections are made by a new, linked, opposite-signed entry so the audit trail remains complete and the records continue to explain the transactions.',
    citation: cite('COMPANIES_ACT_2006', 'ss.386–388'),
  },
};
