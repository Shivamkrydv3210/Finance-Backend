import { createHash } from 'crypto';
import { classifyVatRate, VAT_GL_ACCOUNTS } from '../../knowledge/uk-tax/index.js';

const AMOUNT_TOLERANCE = 0.02;

function mod97(n) {
  return ((n % 97) + 97) % 97;
}

/**
 * Structural validation only (Mod-97 check-digit algorithm HMRC publishes for
 * standard 9-digit VAT numbers, plus the pre-2010 "-55" variant). This does NOT
 * confirm the number is actually registered or belongs to the named supplier —
 * that requires a live HMRC MTD API lookup, which needs credentials this app
 * doesn't have. GD/HA (government/health authority) and 12-digit branch-suffixed
 * numbers use separate schemes and are accepted here as format-valid without a
 * checksum check.
 */
export function validateVatNumberFormat(rawVatNumber) {
  if (!rawVatNumber || !String(rawVatNumber).trim()) {
    return { valid: false, normalized: null, reason: 'missing' };
  }
  let s = String(rawVatNumber).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('GB')) s = s.slice(2);

  if (/^(GD|HA)\d{3}$/.test(s)) {
    return { valid: true, normalized: 'GB' + s, reason: null };
  }
  if (!/^\d{9}(\d{3})?$/.test(s)) {
    return { valid: false, normalized: 'GB' + s, reason: 'wrong_length_or_format' };
  }

  const base9 = s.slice(0, 9);
  if (s.length === 12) {
    return { valid: true, normalized: 'GB' + s, reason: null };
  }

  const digits = base9.split('').map(Number);
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let total = 0;
  for (let i = 0; i < 7; i++) total += digits[i] * weights[i];
  total += digits[7] * 10 + digits[8];

  const valid = mod97(total) === 0 || mod97(total - 55) === 0;
  return { valid, normalized: 'GB' + base9, reason: valid ? null : 'checksum_failed' };
}

/** Companies House CRN: 8 digits, or a 2-letter registration prefix (SC/NI/OC/...) + 6 digits. */
export function validateCompanyNumberFormat(rawCrn) {
  if (!rawCrn || !String(rawCrn).trim()) return { valid: false, normalized: null };
  const s = String(rawCrn).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const valid = /^\d{8}$/.test(s) || /^[A-Z]{2}\d{6}$/.test(s);
  return { valid, normalized: s };
}

/** UK bank sort code: 6 digits (format-only — no public checksum). */
export function validateSortCode(rawSortCode) {
  if (!rawSortCode) return { valid: false, normalized: null };
  const s = String(rawSortCode).replace(/[^0-9]/g, '');
  return { valid: /^\d{6}$/.test(s), normalized: s };
}

/** UK bank account number: 8 digits (format-only). Returns last4 for storage — never persist the full number. */
export function validateAccountNumberFormat(rawAccountNumber) {
  if (!rawAccountNumber) return { valid: false, normalized: null, last4: null };
  const s = String(rawAccountNumber).replace(/[^0-9]/g, '');
  const valid = /^\d{8}$/.test(s);
  return { valid, normalized: s, last4: valid ? s.slice(-4) : null };
}

/**
 * Snaps an extracted rate to the UK VAT rate actually in force on `asAt` (defaults
 * to today) — sourced from the knowledge base, not a hardcoded 20/5/0, so a
 * historical invoice is judged against the rate that applied on its own date
 * (e.g. 17.5% before January 2011).
 */
export function inferUkVatRateType(ratePct, asAt) {
  return classifyVatRate(ratePct, asAt);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Verifies net * rate = VAT for each rate bucket, and that the buckets sum to the invoice total.
 * Accepts either a real multi-rate breakdown or a single line synthesized from legacy header fields.
 */
export function verifyVatArithmetic(vatLines, totalAmount) {
  const lines = (vatLines || []).map((ln) => {
    const net = round2(ln.net_amount);
    const vat = round2(ln.vat_amount);
    const rate = Number(ln.rate_pct) || 0;
    const expected = round2(net * (rate / 100));
    const variance = round2(vat - expected);
    return {
      ...ln,
      net_amount: net,
      vat_amount: vat,
      rate_pct: rate,
      expected_vat_amount: expected,
      variance,
      is_valid: Math.abs(variance) <= AMOUNT_TOLERANCE,
    };
  });

  const flags = [];
  lines.forEach((ln, i) => {
    if (!ln.is_valid) {
      flags.push(`vat_rate_mismatch_line_${i + 1}: expected ${ln.expected_vat_amount}, got ${ln.vat_amount} (${ln.rate_type} @ ${ln.rate_pct}%)`);
    }
    if (ln.rate_type === 'non_standard') {
      flags.push(`non_standard_vat_rate_line_${i + 1}: ${ln.rate_pct}%`);
    }
  });

  const sumNet = round2(lines.reduce((s, l) => s + l.net_amount, 0));
  const sumVat = round2(lines.reduce((s, l) => s + l.vat_amount, 0));
  const totalMatches = Math.abs(round2(sumNet + sumVat) - round2(totalAmount)) <= AMOUNT_TOLERANCE;
  if (!totalMatches) {
    flags.push(`total_mismatch: net(${sumNet}) + vat(${sumVat}) != total(${round2(totalAmount)})`);
  }

  return {
    lines,
    allValid: lines.every((l) => l.is_valid),
    totalMatches,
    flags,
  };
}

// GL accounts that carry VAT — sourced from the knowledge base's VAT_GL_ACCOUNTS
// mapping (1310 input recoverable, 2110 output payable, 2120 control, 6250
// irrecoverable) rather than a locally hardcoded list.
const VAT_ACCOUNT_CODES = new Set(Object.values(VAT_GL_ACCOUNTS));

/**
 * Manual journals bypass the invoice-extraction pipeline entirely, so none of the
 * per-invoice VAT checks apply to them — a caller can currently post any tax_rate/
 * tax_amount on a line with zero verification. This closes that gap using the same
 * shape invoicePostingService.js already builds: lines tagged with a tax_rate are
 * grouped by rate, and the amount posted to a known VAT account (1310/2110/2120/6250) at
 * that rate must equal (sum of the other lines at that rate) * rate / 100.
 * Journals that don't touch a VAT account at all are left alone (touchesVat: false).
 * @param {Array<{account_code: string, tax_rate: number|null, debit: number, credit: number}>} lines
 * @param {string|Date} [asAt] - the journal's entry_date, so the rate is judged against the law in force then
 */
export function verifyManualJournalVat(lines, asAt) {
  const taxed = (lines || []).filter((l) => l.tax_rate != null && !Number.isNaN(Number(l.tax_rate)));
  const touchesVat = taxed.some((l) => VAT_ACCOUNT_CODES.has(l.account_code));
  if (!touchesVat) return { touchesVat: false, allValid: true, flags: [] };

  const byRate = new Map();
  for (const l of taxed) {
    const rate = round2(l.tax_rate);
    if (!byRate.has(rate)) byRate.set(rate, { net: 0, vat: 0, hasVatLine: false });
    const bucket = byRate.get(rate);
    const amount = Number(l.debit || 0) + Number(l.credit || 0);
    if (VAT_ACCOUNT_CODES.has(l.account_code)) {
      bucket.vat += amount;
      bucket.hasVatLine = true;
    } else {
      bucket.net += amount;
    }
  }

  const flags = [];
  for (const [rate, bucket] of byRate) {
    if (!bucket.hasVatLine) continue;
    const rateType = classifyVatRate(rate, asAt);
    if (rateType === 'non_standard') flags.push(`non_standard_vat_rate: ${rate}%`);
    const expected = round2(bucket.net * (rate / 100));
    if (Math.abs(round2(bucket.vat - expected)) > AMOUNT_TOLERANCE) {
      flags.push(`vat_rate_mismatch at ${rate}%: expected ${expected}, got ${round2(bucket.vat)} (net ${round2(bucket.net)})`);
    }
  }

  return { touchesVat: true, allValid: flags.length === 0, flags };
}

/** SHA-256 over normalized invoice identity fields — used for duplicate detection. */
export function computeContentHash({ vendor_name, invoice_number, total_amount, invoice_date }) {
  const key = [
    String(vendor_name || '').trim().toLowerCase(),
    String(invoice_number || '').trim().toUpperCase(),
    round2(total_amount).toFixed(2),
    String(invoice_date || '').slice(0, 10),
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}
