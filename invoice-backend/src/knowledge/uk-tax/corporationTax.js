import { cite } from './sources.js';

/**
 * UK Corporation Tax rates, marginal relief and capital allowances.
 * Rates are keyed to the CT financial year (1 April – 31 March), which is why the
 * effective dates here run April-to-March rather than on the 6 April tax year used
 * for payroll. Verified against gov.uk August 2026.
 */

export const CORPORATION_TAX_RATES = [
  {
    financial_year: 2023,
    main_rate_pct: 25,
    small_profits_rate_pct: 19,
    lower_limit: 50000,
    upper_limit: 250000,
    marginal_relief_fraction: 3 / 200,
    marginal_relief_fraction_label: '3/200',
    effective_from: '2023-04-01',
    effective_to: '2024-03-31',
    citation: cite('CT_RATES'),
  },
  {
    financial_year: 2024,
    main_rate_pct: 25,
    small_profits_rate_pct: 19,
    lower_limit: 50000,
    upper_limit: 250000,
    marginal_relief_fraction: 3 / 200,
    marginal_relief_fraction_label: '3/200',
    effective_from: '2024-04-01',
    effective_to: '2025-03-31',
    citation: cite('CT_RATES'),
  },
  {
    financial_year: 2025,
    main_rate_pct: 25,
    small_profits_rate_pct: 19,
    lower_limit: 50000,
    upper_limit: 250000,
    marginal_relief_fraction: 3 / 200,
    marginal_relief_fraction_label: '3/200',
    effective_from: '2025-04-01',
    effective_to: '2026-03-31',
    citation: cite('CT_RATES'),
  },
  {
    financial_year: 2026,
    main_rate_pct: 25,
    small_profits_rate_pct: 19,
    lower_limit: 50000,
    upper_limit: 250000,
    marginal_relief_fraction: 3 / 200,
    marginal_relief_fraction_label: '3/200',
    effective_from: '2026-04-01',
    effective_to: '2027-03-31',
    citation: cite('CT_RATES'),
  },
];

/** Ring fence (oil and gas) profits are taxed on a separate scale. */
export const RING_FENCE_RATES = [
  {
    main_rate_pct: 30,
    small_profits_rate_pct: 19,
    lower_limit: 50000,
    upper_limit: 250000,
    marginal_relief_fraction: 11 / 400,
    marginal_relief_fraction_label: '11/400',
    effective_from: '2023-04-01',
    effective_to: null,
    citation: cite('CT_RATES'),
  },
];

/**
 * Capital allowances.
 *
 * Two entries here postdate January 2026 and were confirmed from gov.uk during
 * planning: the 40% first-year allowance introduced for expenditure from
 * 1 January 2026, and the main-pool writing-down allowance cut from 18% to 14%
 * (1 April 2026 for Corporation Tax, 6 April 2026 for Income Tax businesses).
 * Periods straddling those dates use a time-apportioned hybrid rate.
 */
export const CAPITAL_ALLOWANCES = {
  annual_investment_allowance: [
    {
      value: 1000000,
      currency: 'GBP',
      description: 'Annual Investment Allowance — 100% relief on qualifying plant and machinery up to this annual cap.',
      effective_from: '2019-01-01',
      effective_to: null,
      citation: cite('CAA_2001', 's.51A'),
    },
  ],
  full_expensing: [
    {
      rate_pct: 100,
      applies_to: 'main_pool',
      description: 'Full expensing — 100% first-year allowance on qualifying new and unused main-rate plant and machinery. Companies only.',
      conditions: ['New and unused assets only', 'Excludes cars', 'Excludes assets for leasing (with limited exceptions)', 'Corporation Tax payers only'],
      effective_from: '2023-04-01',
      effective_to: null,
      citation: cite('CAA_2001', 's.39 / s.45S'),
    },
    {
      rate_pct: 50,
      applies_to: 'special_rate_pool',
      description: '50% first-year allowance on qualifying new and unused special-rate plant and machinery (e.g. integral features).',
      conditions: ['New and unused assets only', 'Corporation Tax payers only'],
      effective_from: '2023-04-01',
      effective_to: null,
      citation: cite('CAA_2001', 's.45S'),
    },
  ],
  first_year_allowance_40pct: [
    {
      rate_pct: 40,
      applies_to: 'main_pool',
      description:
        '40% first-year allowance on main-rate expenditure where full expensing or the AIA is unavailable or not claimed. Notably extends first-year relief to unincorporated businesses and to assets bought for leasing.',
      conditions: ['Excludes second-hand assets', 'Excludes cars', 'Excludes overseas leasing'],
      effective_from: '2026-01-01',
      effective_to: null,
      citation: cite('CAPITAL_ALLOWANCES_2026_CHANGE'),
    },
  ],
  writing_down_allowance: [
    {
      pool: 'main_pool',
      rate_pct: 18,
      description: 'Main pool writing-down allowance, reducing balance basis.',
      effective_from: '2012-04-01',
      effective_to: '2026-03-31',
      citation: cite('CAPITAL_ALLOWANCES_RATES'),
    },
    {
      pool: 'main_pool',
      rate_pct: 14,
      description:
        'Main pool writing-down allowance reduced from 18% to 14%. Applies from 1 April 2026 for Corporation Tax and 6 April 2026 for Income Tax; a hybrid time-apportioned rate applies to chargeable periods straddling the change.',
      effective_from: '2026-04-01',
      effective_to: null,
      citation: cite('CAPITAL_ALLOWANCES_2026_CHANGE'),
    },
    {
      pool: 'special_rate_pool',
      rate_pct: 6,
      description: 'Special rate pool writing-down allowance (integral features, long-life assets, thermal insulation, high-emission cars).',
      effective_from: '2019-04-01',
      effective_to: null,
      citation: cite('CAPITAL_ALLOWANCES_RATES'),
    },
  ],
  small_pools_allowance: [
    {
      value: 1000,
      currency: 'GBP',
      description: 'Where the main or special rate pool balance is £1,000 or less, the whole balance may be written off instead of claiming WDA.',
      effective_from: '2008-04-01',
      effective_to: null,
      citation: cite('CAPITAL_ALLOWANCES_RATES'),
    },
  ],
};

/** Special rate pool contents — used to route fixed assets to the right pool. */
export const SPECIAL_RATE_POOL_ASSETS = [
  'Integral features (lifts, escalators, heating, air conditioning, electrical and water systems)',
  'Long-life assets (useful life of 25 years or more, where annual spend exceeds £100,000)',
  'Thermal insulation of buildings',
  'Solar panels',
  'Cars with CO2 emissions above the main-rate threshold',
];

/**
 * Expenditure that is disallowable for Corporation Tax and must be added back to
 * accounting profit when computing taxable profit.
 */
export const CT_DISALLOWABLE = [
  {
    key: 'client_entertainment',
    label: 'Client / business entertainment',
    disallowed: true,
    reason: 'Business entertainment expenditure is not deductible in computing trading profits.',
    citation: cite('CTA_2009', 'ss.1298–1300'),
  },
  {
    key: 'depreciation',
    label: 'Depreciation and amortisation of tangible fixed assets',
    disallowed: true,
    reason: 'Accounting depreciation is not deductible; capital allowances are given instead.',
    citation: cite('CTA_2009', 's.53'),
  },
  {
    key: 'fines_penalties',
    label: 'Fines and penalties',
    disallowed: true,
    reason: 'Fines and penalties for breaking the law are not incurred wholly and exclusively for the trade.',
    citation: cite('CTA_2009', 's.54'),
  },
  {
    key: 'capital_expenditure',
    label: 'Capital expenditure',
    disallowed: true,
    reason: 'Items of a capital nature are not deductible as revenue expenses; relieve via capital allowances instead.',
    citation: cite('CTA_2009', 's.53'),
  },
  {
    key: 'dividends',
    label: 'Dividends and other profit distributions',
    disallowed: true,
    reason: 'Distributions of profit are not an expense of the trade.',
    citation: cite('CTA_2010', 'Part 23'),
  },
];

/** Payment and filing deadlines the close/compliance module can check against. */
export const CT_DEADLINES = {
  payment_small: {
    description: 'Corporation Tax is due 9 months and 1 day after the end of the accounting period (companies not liable to pay by instalments).',
    citation: cite('CTA_2010'),
  },
  return_filing: {
    description: 'The CT600 company tax return must be filed within 12 months of the end of the accounting period.',
    citation: cite('COMPANIES_ACT_2006'),
  },
  quarterly_instalments: {
    description: 'Companies with augmented profits above £1.5m (reduced by associated companies) must pay by quarterly instalments; above £20m, on an accelerated basis.',
    citation: cite('CTA_2010'),
  },
};

/** Director's loan (s455) charge — a very common SME issue worth surfacing. */
export const DIRECTORS_LOAN = {
  s455_rate_pct: 33.75,
  description:
    'A s455 charge arises where a close company loans money to a participator and the loan is still outstanding 9 months and 1 day after the end of the accounting period. Refundable once the loan is repaid.',
  citation: cite('CTA_2010', 's.455'),
};
