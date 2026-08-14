/**
 * Citation registry for the UK tax knowledge base.
 *
 * Every rule in this knowledge base carries a citation drawn from here, so any
 * figure the system posts, validates against, or shows an advisor can be traced
 * back to the statute or HMRC notice it came from. Verified against gov.uk /
 * legislation.gov.uk in August 2026.
 *
 * `checked_on` records when the figures sourced from each were last verified —
 * UK rates change at least annually (Finance Act, Autumn Budget), so anything
 * materially older than the current tax year should be re-checked before relying
 * on it for filing.
 */

export const SOURCES = {
  VAT_ACT_1994: {
    legislation: 'Value Added Tax Act 1994',
    url: 'https://www.legislation.gov.uk/ukpga/1994/23/contents',
    checked_on: '2026-08-12',
  },
  VAT_RATES_GUIDE: {
    legislation: 'VAT rates on different goods and services (HMRC guidance)',
    url: 'https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services',
    checked_on: '2026-08-12',
  },
  VAT_NOTICE_700: {
    legislation: 'VAT Notice 700: the VAT guide',
    url: 'https://www.gov.uk/guidance/vat-guide-notice-700',
    checked_on: '2026-08-12',
  },
  VAT_NOTICE_700_64: {
    legislation: 'VAT Notice 700/64: motoring expenses',
    url: 'https://www.gov.uk/guidance/vat-motoring-expenses-notice-70064',
    checked_on: '2026-08-12',
  },
  VAT_NOTICE_700_65: {
    legislation: 'VAT Notice 700/65: business entertainment',
    url: 'https://www.gov.uk/guidance/vat-on-business-entertainment-notice-70065',
    checked_on: '2026-08-12',
  },
  VAT_NOTICE_700_22: {
    legislation: 'VAT Notice 700/22: Making Tax Digital for VAT',
    url: 'https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat',
    checked_on: '2026-08-12',
  },
  VAT_REGISTRATION: {
    legislation: 'VAT registration thresholds (HMRC guidance)',
    url: 'https://www.gov.uk/vat-registration-thresholds',
    checked_on: '2026-08-12',
  },
  CTA_2009: {
    legislation: 'Corporation Tax Act 2009',
    url: 'https://www.legislation.gov.uk/ukpga/2009/4/contents',
    checked_on: '2026-08-12',
  },
  CTA_2010: {
    legislation: 'Corporation Tax Act 2010',
    url: 'https://www.legislation.gov.uk/ukpga/2010/4/contents',
    checked_on: '2026-08-12',
  },
  CT_RATES: {
    legislation: 'Corporation Tax rates and allowances (HMRC)',
    url: 'https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax',
    checked_on: '2026-08-12',
  },
  CT_MARGINAL_RELIEF: {
    legislation: 'CTM03925 — Marginal Relief (HMRC Company Taxation Manual)',
    url: 'https://www.gov.uk/hmrc-internal-manuals/company-taxation-manual/ctm03925',
    checked_on: '2026-08-12',
  },
  CAA_2001: {
    legislation: 'Capital Allowances Act 2001',
    url: 'https://www.legislation.gov.uk/ukpga/2001/2/contents',
    checked_on: '2026-08-12',
  },
  CAPITAL_ALLOWANCES_RATES: {
    legislation: 'Work out your writing down allowances: rates and pools (HMRC)',
    url: 'https://www.gov.uk/work-out-capital-allowances/rates-and-pools',
    checked_on: '2026-08-12',
  },
  CAPITAL_ALLOWANCES_2026_CHANGE: {
    legislation: 'Capital allowances: new first-year allowance and reducing main rate writing-down allowances',
    url: 'https://www.gov.uk/government/publications/new-first-year-allowance-and-main-rate-of-writing-down-allowances/capital-allowances-new-first-year-allowance-and-reducing-main-rate-writing-down-allowances',
    checked_on: '2026-08-12',
  },
  EMPLOYER_RATES_2026_27: {
    legislation: 'Rates and thresholds for employers 2026 to 2027 (HMRC)',
    url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
    checked_on: '2026-08-12',
  },
  ITEPA_2003: {
    legislation: 'Income Tax (Earnings and Pensions) Act 2003',
    url: 'https://www.legislation.gov.uk/ukpga/2003/1/contents',
    checked_on: '2026-08-12',
  },
  PAYE_REGS_2003: {
    legislation: 'The Income Tax (Pay As You Earn) Regulations 2003',
    url: 'https://www.legislation.gov.uk/uksi/2003/2682/contents/made',
    checked_on: '2026-08-12',
  },
  PENSIONS_ACT_2008: {
    legislation: 'Pensions Act 2008 (automatic enrolment)',
    url: 'https://www.legislation.gov.uk/ukpga/2008/30/contents',
    checked_on: '2026-08-12',
  },
  AE_THRESHOLDS_2026_27: {
    legislation: 'Review of the Automatic Enrolment Earnings Trigger and Qualifying Earnings Band for 2026/27 (DWP)',
    url: 'https://www.gov.uk/government/publications/review-of-the-automatic-enrolment-earnings-trigger-and-qualifying-earnings-band-for-202627/review-of-the-automatic-enrolment-earnings-trigger-and-qualifying-earnings-band-for-202627',
    checked_on: '2026-08-12',
  },
  CIS_340: {
    legislation: 'Construction Industry Scheme: guide for contractors and subcontractors (CIS 340)',
    url: 'https://www.gov.uk/government/publications/construction-industry-scheme-cis-340/construction-industry-scheme-a-guide-for-contractors-and-subcontractors-cis-340',
    checked_on: '2026-08-12',
  },
  FA_2004_CIS: {
    legislation: 'Finance Act 2004 Part 3 Chapter 3 (Construction Industry Scheme)',
    url: 'https://www.legislation.gov.uk/ukpga/2004/12/part/3/chapter/3',
    checked_on: '2026-08-12',
  },
  COMPANIES_ACT_2006: {
    legislation: 'Companies Act 2006',
    url: 'https://www.legislation.gov.uk/ukpga/2006/46/contents',
    checked_on: '2026-08-12',
  },
  SI_2008_409: {
    legislation: 'The Small Companies and Groups (Accounts and Directors’ Report) Regulations 2008 (SI 2008/409), Schedule 1',
    url: 'https://www.legislation.gov.uk/uksi/2008/409/schedule/1',
    checked_on: '2026-08-12',
  },
  SI_2024_1303: {
    legislation: 'The Companies (Accounts and Reports) (Amendment and Transitional Provision) Regulations 2024 (SI 2024/1303)',
    url: 'https://www.legislation.gov.uk/uksi/2024/1303/made',
    checked_on: '2026-08-12',
  },
  COMPANY_SIZE_THRESHOLDS: {
    legislation: 'Prepare annual accounts: micro-entities, small and dormant companies (Companies House)',
    url: 'https://www.gov.uk/annual-accounts/microentities-small-and-dormant-companies',
    checked_on: '2026-08-12',
  },
};

/**
 * Builds a citation object for attaching to a rule.
 * @param {keyof typeof SOURCES} sourceKey
 * @param {string} [detail] - pinpoint reference, e.g. 's.2(1)' or 'para 12.2'
 */
export function cite(sourceKey, detail) {
  const src = SOURCES[sourceKey];
  if (!src) throw new Error(`Unknown citation source: ${sourceKey}`);
  return { ...src, detail: detail || null };
}
