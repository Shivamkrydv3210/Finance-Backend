import { cite } from './sources.js';

/**
 * Per-expense-category tax treatment — the single place that decides whether an
 * expense's VAT is recoverable and whether it's deductible for Corporation Tax,
 * so `invoicePostingService.js` and the AI advisors read the same answer.
 *
 * `gl_account_code` reuses the existing UK statutory chart of accounts (built
 * earlier) wherever a suitable account already exists, rather than proliferating
 * new codes. `6250` (Irrecoverable VAT) is the one genuinely new account this
 * knowledge base requires — nothing previously represented "VAT that failed
 * recovery" as its own line, so it was silently claimed as recoverable.
 *
 * `expense_category` is the richer taxonomy carried on `invoice_header.expense_category`
 * (nullable, additive). It is distinct from the older 5-bucket `category` column
 * (fuel/maintenance/repair/parts/other) that AI extraction still populates and that
 * `accountService.expenseAccountCodeForCategory` still serves — that mapping is
 * left untouched for backward compatibility; this module is consulted *in addition*,
 * when a more specific `expense_category` is available.
 */

export const IRRECOVERABLE_VAT_ACCOUNT_CODE = '6250';

export const EXPENSE_RULES = [
  {
    key: 'client_entertainment',
    label: 'Client / business entertainment',
    vat_recoverable: false,
    vat_blocked_reason: 'Business entertainment VAT is specifically blocked from recovery.',
    vat_citation: cite('VAT_NOTICE_700_65'),
    ct_deductible: false,
    ct_reason: 'Business entertainment expenditure is disallowable and must be added back in the CT computation.',
    ct_citation: cite('CTA_2009', 'ss.1298–1300'),
    gl_account_code: '5900',
  },
  {
    key: 'staff_entertainment',
    label: 'Staff entertainment',
    vat_recoverable: true,
    ct_deductible: true,
    ct_note: 'Deductible as staff welfare, but a separate £150/head/year exemption applies for Income Tax/NIC purposes on annual events (not a VAT or CT rule).',
    citation: cite('VAT_NOTICE_700_65'),
    gl_account_code: '5900',
  },
  {
    key: 'motor_car_purchase',
    label: 'Motor car — purchase',
    vat_recoverable: false,
    vat_blocked_reason: 'VAT on buying a car is blocked unless it is used exclusively for business with no private use available.',
    vat_citation: cite('VAT_NOTICE_700_64'),
    ct_deductible: true,
    ct_note: 'Relieved through capital allowances (WDA main pool 18%/14%, or special rate pool 6% depending on CO2 emissions), not as a revenue deduction.',
    ct_citation: cite('CAPITAL_ALLOWANCES_RATES'),
    gl_account_code: '1500',
  },
  {
    key: 'motor_car_lease',
    label: 'Motor car — lease/hire',
    vat_recoverable: true,
    vat_partial_recovery_pct: 50,
    vat_note: 'Only 50% of lease VAT is recoverable, to reflect private use.',
    vat_citation: cite('VAT_NOTICE_700_64'),
    ct_deductible: true,
    gl_account_code: '6140',
  },
  {
    key: 'fuel',
    label: 'Fuel',
    vat_recoverable: true,
    vat_note: 'Recoverable in full only if there is no private mileage, or the fuel scale charge is accounted for; otherwise apportion or use the scale charge.',
    vat_citation: cite('VAT_NOTICE_700_64'),
    ct_deductible: true,
    gl_account_code: '5100',
  },
  {
    key: 'motor_running_costs',
    label: 'Motor running costs (repairs, servicing, parking)',
    vat_recoverable: true,
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700_64'),
    gl_account_code: '6140',
  },
  {
    key: 'subsistence',
    label: 'Travel and subsistence',
    vat_recoverable: true,
    vat_note: 'Recoverable for business travel away from the normal workplace; ordinary commuting does not qualify.',
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '6150',
  },
  {
    key: 'depreciation',
    label: 'Depreciation / amortisation',
    vat_recoverable: null,
    vat_note: 'Not a supply — no VAT arises on a depreciation charge itself.',
    ct_deductible: false,
    ct_reason: 'Accounting depreciation is disallowable; capital allowances are given instead.',
    ct_citation: cite('CTA_2009', 's.53'),
    gl_account_code: '6220',
  },
  {
    key: 'fines_penalties',
    label: 'Fines and penalties',
    vat_recoverable: false,
    vat_blocked_reason: 'A statutory fine or penalty is not a supply for VAT purposes.',
    ct_deductible: false,
    ct_reason: 'Fines and penalties are not incurred wholly and exclusively for the trade.',
    ct_citation: cite('CTA_2009', 's.54'),
    gl_account_code: '5900',
  },
  {
    key: 'legal_professional',
    label: 'Legal and professional fees',
    vat_recoverable: true,
    ct_deductible: true,
    ct_note: 'Fees on capital transactions (e.g. buying a property or another company) are capital, not revenue, and are disallowable.',
    citation: cite('CTA_2009', 's.53'),
    gl_account_code: '6180',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    vat_recoverable: true,
    vat_note: 'Most business insurance premiums carry Insurance Premium Tax (IPT), not VAT, and IPT is not recoverable as input VAT.',
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '6120',
  },
  {
    key: 'rent_rates',
    label: 'Rent and business rates',
    vat_recoverable: true,
    vat_note: 'Commercial rent is exempt unless the landlord has opted to tax; check the invoice before assuming VAT is chargeable.',
    ct_deductible: true,
    citation: cite('VAT_ACT_1994', 'Schedule 9 Group 1'),
    gl_account_code: '6100',
  },
  {
    key: 'other',
    label: 'Other / general business expense',
    vat_recoverable: true,
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '5900',
  },
  // Legacy 5-bucket fleet taxonomy (still populated by AI extraction via
  // invoice_header.category) — included here so accountService.js can source its
  // whole category→GL map from this single file. Ordinary recoverable/deductible
  // business expenses; no special VAT or CT treatment applies.
  {
    key: 'fleet_maintenance',
    label: 'Vehicle maintenance',
    vat_recoverable: true,
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '5200',
  },
  {
    key: 'fleet_repair',
    label: 'Vehicle repair',
    vat_recoverable: true,
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '5300',
  },
  {
    key: 'fleet_parts',
    label: 'Vehicle parts',
    vat_recoverable: true,
    ct_deductible: true,
    citation: cite('VAT_NOTICE_700'),
    gl_account_code: '5400',
  },
];

export function findExpenseRule(key) {
  return EXPENSE_RULES.find((r) => r.key === key) || null;
}
