import { cite } from './sources.js';

/**
 * UK VAT: rates, liability categories, input tax recovery blocks, thresholds and
 * record-keeping rules. Verified against gov.uk August 2026.
 *
 * Historical rates are included deliberately — this ledger posts back-dated
 * invoices, and an invoice dated 2009 must be validated at 15%, not 20%.
 */

export const VAT_RATES = [
  {
    rate_type: 'standard',
    value: 17.5,
    effective_from: '1991-04-01',
    effective_to: '2008-11-30',
    citation: cite('VAT_ACT_1994', 's.2(1)'),
  },
  {
    rate_type: 'standard',
    value: 15,
    effective_from: '2008-12-01',
    effective_to: '2009-12-31',
    citation: cite('VAT_ACT_1994', 's.2(1) — temporary reduction'),
  },
  {
    rate_type: 'standard',
    value: 17.5,
    effective_from: '2010-01-01',
    effective_to: '2011-01-03',
    citation: cite('VAT_ACT_1994', 's.2(1)'),
  },
  {
    rate_type: 'standard',
    value: 20,
    effective_from: '2011-01-04',
    effective_to: null,
    citation: cite('VAT_ACT_1994', 's.2(1)'),
  },
  {
    rate_type: 'reduced',
    value: 5,
    effective_from: '1997-09-01',
    effective_to: null,
    citation: cite('VAT_ACT_1994', 's.29A / Schedule 7A'),
  },
  {
    rate_type: 'zero',
    value: 0,
    effective_from: '1973-04-01',
    effective_to: null,
    citation: cite('VAT_ACT_1994', 's.30 / Schedule 8'),
  },
];

/**
 * Liability categories. `exempt` and `outside_scope` are not rates — they carry no
 * VAT and, critically, differ from zero-rated: zero-rated supplies are taxable
 * (so they count toward the registration threshold and allow input tax recovery),
 * whereas exempt supplies do neither.
 */
export const VAT_LIABILITY_TYPES = [
  {
    key: 'standard',
    label: 'Standard rated',
    taxable: true,
    allows_input_recovery: true,
    examples: ['Most goods and services', 'Catering and hot food', 'Alcoholic drinks', 'Confectionery and crisps', 'Adult clothing and footwear', 'Vehicle sales and repairs', 'Business fuel and power'],
    citation: cite('VAT_RATES_GUIDE'),
  },
  {
    key: 'reduced',
    label: 'Reduced rated (5%)',
    taxable: true,
    allows_input_recovery: true,
    examples: ['Domestic fuel and power', 'Mobility aids for the elderly', 'Smoking cessation products', 'Children’s car seats and cycle helmets', 'Renovation of long-empty dwellings', 'Conversions to multiple dwellings'],
    citation: cite('VAT_RATES_GUIDE'),
  },
  {
    key: 'zero',
    label: 'Zero rated (0%)',
    taxable: true,
    allows_input_recovery: true,
    examples: ['Most food for human consumption (not catering, hot food, confectionery, crisps, alcohol)', 'Books, newspapers, magazines, printed music, maps', 'Children’s clothing and footwear', 'Prescriptions and dispensed medicines', 'Equipment for blind or disabled people', 'International freight and passenger transport (10+ capacity)', 'Energy-saving materials (to 31 March 2027)', 'Animal feed and plants'],
    citation: cite('VAT_RATES_GUIDE'),
  },
  {
    key: 'exempt',
    label: 'Exempt',
    taxable: false,
    allows_input_recovery: false,
    examples: ['Insurance and financial services', 'Education by an eligible body', 'Health services (doctors, dentists, opticians)', 'Betting, gaming and lotteries', 'Residential property lettings', 'Royal Mail universal postal services', 'Cultural admissions', 'Sports and physical activities'],
    citation: cite('VAT_ACT_1994', 's.31 / Schedule 9'),
  },
  {
    key: 'outside_scope',
    label: 'Outside the scope of VAT',
    taxable: false,
    allows_input_recovery: false,
    examples: ['Voluntary donations to charity', 'Statutory tolls levied by a public authority', 'Wages and salaries', 'Dividends', 'Most transactions outside the UK'],
    citation: cite('VAT_NOTICE_700'),
  },
];

/**
 * Input tax recovery blocks. UK law denies recovery on these regardless of how
 * clearly they are business expenditure — this is exactly what the ledger used to
 * get wrong by routing every input VAT amount to the recoverable account.
 */
export const INPUT_TAX_BLOCKS = [
  {
    key: 'business_entertainment',
    label: 'Business (client) entertainment',
    blocked: true,
    reason: 'Input tax on entertaining clients, customers or other non-employees is specifically blocked.',
    exceptions: ['Entertainment of employees (staff entertainment) is recoverable to the extent it is for a business purpose.', 'Entertainment of overseas customers may be recoverable in limited circumstances.'],
    citation: cite('VAT_NOTICE_700_65'),
  },
  {
    key: 'motor_car_purchase',
    label: 'Purchase of a motor car',
    blocked: true,
    reason: 'VAT on buying a car (including fitted accessories and delivery) is blocked unless the car is used exclusively for business with no private use available — a test very few cars meet.',
    exceptions: ['Cars used exclusively for business (e.g. stock in trade, driving-school cars, taxis, self-drive hire).', 'Commercial vehicles, vans and lorries are not "cars" and are recoverable.'],
    citation: cite('VAT_NOTICE_700_64'),
  },
  {
    key: 'motor_car_lease',
    label: 'Leasing a motor car',
    blocked: false,
    partial_recovery_pct: 50,
    reason: 'Only 50% of the VAT on leasing a car is recoverable, to reflect private use.',
    exceptions: [],
    citation: cite('VAT_NOTICE_700_64'),
  },
  {
    key: 'non_business_use',
    label: 'Non-business or private use',
    blocked: true,
    reason: 'VAT on goods and services not used for business purposes is not input tax at all and cannot be recovered.',
    exceptions: ['Where there is mixed use, the VAT must be apportioned and only the business portion recovered.'],
    citation: cite('VAT_NOTICE_700'),
  },
  {
    key: 'exempt_supplies',
    label: 'Costs attributable to exempt supplies',
    blocked: true,
    reason: 'Input tax attributable to exempt supplies is not normally deductible, subject to the partial exemption de minimis limits.',
    exceptions: ['Recoverable if the business falls within the partial exemption de minimis limits.'],
    citation: cite('VAT_NOTICE_700'),
  },
];

export const VAT_THRESHOLDS = [
  {
    key: 'registration',
    label: 'VAT registration threshold (taxable turnover in any rolling 12 months)',
    value: 90000,
    currency: 'GBP',
    effective_from: '2024-04-01',
    effective_to: null,
    citation: cite('VAT_REGISTRATION'),
  },
  {
    key: 'registration',
    label: 'VAT registration threshold (taxable turnover in any rolling 12 months)',
    value: 85000,
    currency: 'GBP',
    effective_from: '2017-04-01',
    effective_to: '2024-03-31',
    citation: cite('VAT_REGISTRATION'),
  },
  {
    key: 'deregistration',
    label: 'VAT deregistration threshold',
    value: 88000,
    currency: 'GBP',
    effective_from: '2024-04-01',
    effective_to: null,
    citation: cite('VAT_REGISTRATION'),
  },
];

/** Time limits and record-keeping obligations that the close/compliance modules check against. */
export const VAT_ADMIN_RULES = {
  input_tax_claim_limit_years: {
    value: 4,
    description: 'Input tax must be claimed within 4 years of the due date of the return for the period in which it became chargeable.',
    citation: cite('VAT_NOTICE_700'),
  },
  record_retention_years: {
    value: 6,
    description: 'VAT records must be kept for at least 6 years.',
    citation: cite('VAT_NOTICE_700'),
  },
  bad_debt_relief_months: {
    value: 6,
    description: 'Bad debt relief may be claimed once the debt is over 6 months old (and written off in the accounts).',
    citation: cite('VAT_NOTICE_700'),
  },
  making_tax_digital: {
    description:
      'VAT-registered businesses must keep digital records and file VAT returns using functional compatible software, with digital links between systems — manual re-typing of figures between systems breaks the digital link requirement.',
    citation: cite('VAT_NOTICE_700_22'),
  },
  /** What must appear on a valid VAT invoice for the recipient to recover the input tax. */
  valid_invoice_requirements: {
    required_fields: [
      'A sequential invoice number that uniquely identifies the document',
      'The supplier’s name, address and VAT registration number',
      'The customer’s name and address',
      'The time of supply (tax point)',
      'The date of issue (if different from the tax point)',
      'A description sufficient to identify the goods or services supplied',
      'For each description: quantity, unit price, rate of VAT and amount payable excluding VAT',
      'The gross total amount payable excluding VAT',
      'The rate of any cash discount offered',
      'The total amount of VAT chargeable, in sterling',
    ],
    citation: cite('VAT_NOTICE_700', 'sections 16–17'),
  },
};

/** Tolerance (percentage points) for snapping an extracted rate to a statutory rate. */
export const RATE_MATCH_TOLERANCE_PCT = 0.5;
