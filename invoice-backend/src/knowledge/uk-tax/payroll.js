import { cite } from './sources.js';

/**
 * UK payroll: income tax, National Insurance, auto-enrolment pensions and student
 * loans. Keyed to the UK tax year (6 April – 5 April). Figures for 2026/27
 * verified against HMRC's "Rates and thresholds for employers 2026 to 2027".
 *
 * Income tax on earnings is devolved to Scotland (6 bands, different rates) and
 * partially to Wales (currently matching England/NI) — so band lookups are always
 * region-qualified. National Insurance is NOT devolved and is UK-wide.
 */

export const PERSONAL_ALLOWANCE = [
  {
    tax_year: '2026/27',
    value: 12570,
    currency: 'GBP',
    taper_threshold: 100000,
    taper_note: 'Reduced by £1 for every £2 of adjusted net income above £100,000, so it is fully withdrawn at £125,140.',
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
];

/**
 * Income tax bands. Thresholds are expressed as taxable income *above the personal
 * allowance* for England/NI/Wales (HMRC publishes them that way), and the Scottish
 * bands likewise sit on top of the personal allowance.
 */
export const INCOME_TAX_BANDS = [
  {
    tax_year: '2026/27',
    region: 'england_ni',
    bands: [
      { name: 'Basic rate', rate_pct: 20, from: 0, to: 37700 },
      { name: 'Higher rate', rate_pct: 40, from: 37701, to: 125140 },
      { name: 'Additional rate', rate_pct: 45, from: 125141, to: null },
    ],
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
  {
    tax_year: '2026/27',
    region: 'wales',
    bands: [
      { name: 'Basic rate', rate_pct: 20, from: 0, to: 37700 },
      { name: 'Higher rate', rate_pct: 40, from: 37701, to: 125140 },
      { name: 'Additional rate', rate_pct: 45, from: 125141, to: null },
    ],
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
  {
    tax_year: '2026/27',
    region: 'scotland',
    bands: [
      { name: 'Starter rate', rate_pct: 19, from: 0, to: 3967 },
      { name: 'Basic rate', rate_pct: 20, from: 3968, to: 16956 },
      { name: 'Intermediate rate', rate_pct: 21, from: 16957, to: 31092 },
      { name: 'Higher rate', rate_pct: 42, from: 31093, to: 62430 },
      { name: 'Advanced rate', rate_pct: 45, from: 62431, to: 125140 },
      { name: 'Top rate', rate_pct: 48, from: 125141, to: null },
    ],
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
];

export const NATIONAL_INSURANCE = [
  {
    tax_year: '2026/27',
    class: 'class_1',
    thresholds: {
      lower_earnings_limit: 6708,
      secondary_threshold: 5000,
      primary_threshold: 12570,
      upper_earnings_limit: 50270,
    },
    employee_rates: [
      { name: 'Main rate', rate_pct: 8, from: 12570, to: 50270 },
      { name: 'Additional rate', rate_pct: 2, from: 50270, to: null },
    ],
    employer_rates: [{ name: 'Secondary rate', rate_pct: 15, from: 5000, to: null }],
    employment_allowance: 10500,
    class_1a_rate_pct: 15,
    class_1a_note: 'Class 1A is payable by the employer on most taxable benefits in kind reported on P11D.',
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
];

export const APPRENTICESHIP_LEVY = [
  {
    tax_year: '2026/27',
    rate_pct: 0.5,
    allowance: 15000,
    description: 'Payable at 0.5% of the annual pay bill, with a £15,000 annual allowance — so it only bites on pay bills above £3 million.',
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
];

/**
 * Automatic enrolment (Pensions Act 2008). Minimum total contribution is 8% of
 * qualifying earnings, of which the employer must fund at least 3%.
 */
export const AUTO_ENROLMENT = [
  {
    tax_year: '2026/27',
    earnings_trigger: 10000,
    qualifying_earnings_lower: 6240,
    qualifying_earnings_upper: 50270,
    minimum_total_contribution_pct: 8,
    minimum_employer_contribution_pct: 3,
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('AE_THRESHOLDS_2026_27'),
  },
];

export const STUDENT_LOANS = [
  {
    tax_year: '2026/27',
    plans: [
      { plan: 'Plan 2', annual_threshold: 29385, rate_pct: 9 },
      { plan: 'Postgraduate loan', annual_threshold: 21000, rate_pct: 6 },
    ],
    effective_from: '2026-04-06',
    effective_to: '2027-04-05',
    citation: cite('EMPLOYER_RATES_2026_27'),
  },
];

/** RTI and payroll filing obligations. */
export const PAYROLL_OBLIGATIONS = {
  fps: {
    description: 'A Full Payment Submission (FPS) must reach HMRC on or before the date employees are paid.',
    citation: cite('PAYE_REGS_2003'),
  },
  eps: {
    description: 'An Employer Payment Summary (EPS) is filed by the 19th of the following tax month to claim reductions such as the Employment Allowance or statutory pay recovery.',
    citation: cite('PAYE_REGS_2003'),
  },
  payment_deadline: {
    description: 'PAYE and NIC are payable to HMRC by the 22nd of the following tax month (19th if paying by post). Small employers may qualify to pay quarterly.',
    citation: cite('PAYE_REGS_2003'),
  },
  p11d: {
    description: 'P11D and P11D(b) returns for taxable benefits in kind are due by 6 July following the end of the tax year; Class 1A NIC is payable by 22 July.',
    citation: cite('ITEPA_2003'),
  },
};
