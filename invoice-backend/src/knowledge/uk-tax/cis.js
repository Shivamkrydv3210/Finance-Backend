import { cite } from './sources.js';

/**
 * Construction Industry Scheme (CIS).
 *
 * Contractors must deduct tax at source from payments to subcontractors for
 * construction work. The rate depends on the subcontractor's verification status
 * with HMRC. Deductions are taken from the labour element only — materials, VAT,
 * CIS-registered plant hire and certain other costs are excluded from the
 * deduction base, which is a very common source of error.
 */

export const CIS_DEDUCTION_RATES = [
  {
    status: 'gross',
    label: 'Gross payment status',
    rate_pct: 0,
    description: 'Subcontractor holds gross payment status; the contractor makes no deduction and the subcontractor settles their own liability.',
    effective_from: '2007-04-06',
    effective_to: null,
    citation: cite('CIS_340', 'paras 6.4–6.6'),
  },
  {
    status: 'registered',
    label: 'Registered — net payment status',
    rate_pct: 20,
    description: 'Standard deduction for a subcontractor registered with CIS and successfully matched during verification.',
    effective_from: '2007-04-06',
    effective_to: null,
    citation: cite('CIS_340'),
  },
  {
    status: 'unregistered',
    label: 'Unregistered or unmatched',
    rate_pct: 30,
    description: 'Higher deduction where the subcontractor is not registered for CIS, or cannot be matched during HMRC verification.',
    effective_from: '2007-04-06',
    effective_to: null,
    citation: cite('CIS_340'),
  },
];

/** Amounts excluded from the deduction base — deductions apply to the labour element only. */
export const CIS_EXCLUDED_FROM_DEDUCTION = [
  'VAT charged by the subcontractor',
  'Materials, consumable stores and fuel (except fuel for travelling)',
  'Plant hire paid for by the subcontractor',
  'Manufacturing or prefabricating materials',
];

export const CIS_OBLIGATIONS = {
  verification: {
    description: 'Contractors must verify every new subcontractor with HMRC before the first payment to establish the correct deduction rate.',
    citation: cite('CIS_340'),
  },
  monthly_return: {
    description: 'A monthly CIS return must be filed by the 19th of each month, covering the tax month ended on the 5th. Nil returns are required if no payments were made.',
    citation: cite('CIS_340'),
  },
  payment_deadline: {
    description: 'CIS deductions must be paid to HMRC by the 22nd of the month (19th if paying by post), alongside PAYE.',
    citation: cite('CIS_340'),
  },
  deduction_statement: {
    description: 'Contractors must give each subcontractor a payment and deduction statement within 14 days of the end of the tax month.',
    citation: cite('CIS_340'),
  },
  late_filing_penalty: {
    description: 'Penalties start at £100 for a return 1 day late, rising to £200 at 2 months, and £300 or 5% of the deductions at 6 and 12 months.',
    citation: cite('FA_2004_CIS'),
  },
};

/**
 * VAT domestic reverse charge for construction services — mandatory since March
 * 2021 and frequently mishandled. Where it applies, the supplier does not charge
 * VAT; the customer accounts for both the output and input VAT on their own return.
 */
export const CIS_DOMESTIC_REVERSE_CHARGE = {
  applies_when: [
    'The supply is of construction services reportable under CIS',
    'The supply is standard-rated or reduced-rated (not zero-rated)',
    'Both parties are VAT registered',
    'The customer is not an end user or intermediary supplier',
  ],
  effect:
    'The supplier issues an invoice showing no VAT charged, stating that the domestic reverse charge applies and that the customer must account for the VAT. The customer records both output VAT and (subject to the normal rules) input VAT, giving a net nil cash effect.',
  effective_from: '2021-03-01',
  citation: cite('VAT_NOTICE_700_22'),
};
