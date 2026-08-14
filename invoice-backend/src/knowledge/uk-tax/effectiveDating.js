/**
 * Effective-dating helpers.
 *
 * UK tax rates change at least annually, and this ledger posts historical
 * invoices — so a 2024 invoice must be judged against 2024 law, not today's.
 * Every rule in the knowledge base is a record with `effective_from` and
 * `effective_to` (null = still in force), and is resolved through here.
 */

/** Normalises a Date | ISO string | undefined to a YYYY-MM-DD string (today if omitted). */
export function toIsoDate(asAt) {
  if (!asAt) return new Date().toISOString().slice(0, 10);
  if (asAt instanceof Date) return asAt.toISOString().slice(0, 10);
  const s = String(asAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid date for tax lookup: ${asAt}`);
  return s;
}

/** True if `date` falls inside the rule's effective window (inclusive from, inclusive to). */
export function isInForce(rule, date) {
  if (rule.effective_from && date < rule.effective_from) return false;
  if (rule.effective_to && date > rule.effective_to) return false;
  return true;
}

/**
 * Picks the single rule in force on a date. If several overlap, the one with the
 * latest `effective_from` wins, so a superseding rule always beats the old one.
 * @returns {object|null}
 */
export function resolveAsAt(rules, asAt) {
  const date = toIsoDate(asAt);
  const inForce = (rules || []).filter((r) => isInForce(r, date));
  if (!inForce.length) return null;
  return inForce.reduce((best, r) => (!best || (r.effective_from || '') > (best.effective_from || '') ? r : best), null);
}

/** All rules in force on a date (for sets like income tax bands, where several apply at once). */
export function resolveAllAsAt(rules, asAt) {
  const date = toIsoDate(asAt);
  return (rules || []).filter((r) => isInForce(r, date));
}

/**
 * The UK tax year (6 April – 5 April) containing a date, e.g. '2026-08-12' → '2026/27'.
 * Used for payroll, income tax and auto-enrolment, which run on tax years rather
 * than calendar or financial years.
 */
export function ukTaxYearFor(asAt) {
  const date = toIsoDate(asAt);
  const [y, m, d] = date.split('-').map(Number);
  const startYear = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * The UK Corporation Tax financial year (1 April – 31 March) containing a date,
 * expressed as the calendar year it starts in: '2026-08-12' → 2026 (FY2026).
 */
export function ctFinancialYearFor(asAt) {
  const date = toIsoDate(asAt);
  const [y, m] = date.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}
