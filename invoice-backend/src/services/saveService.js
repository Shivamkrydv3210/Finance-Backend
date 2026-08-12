import { supabase } from '../db.js';
import { postInvoiceToLedger } from './posting/invoicePostingService.js';
import {
  validateVatNumberFormat,
  validateCompanyNumberFormat,
  validateSortCode,
  validateAccountNumberFormat,
  inferUkVatRateType,
  verifyVatArithmetic,
  computeContentHash,
} from './validation/ukValidation.js';
import { listExpenseRules } from '../knowledge/uk-tax/index.js';

const EXPENSE_CATEGORY_KEYS = new Set(listExpenseRules().map((r) => r.key));

/** Only stores a recognized knowledge-base category — anything else is left null rather than silently mis-triggering (or missing) VAT-recovery/CT-deductibility rules. */
function normalizeExpenseCategory(raw) {
  const k = String(raw || '').toLowerCase().trim();
  return EXPENSE_CATEGORY_KEYS.has(k) ? k : null;
}

const CATEGORY_MAP = {
  fuel: 'fuel',
  petrol: 'fuel',
  diesel: 'fuel',
  petroleum: 'fuel',
  'fuel expense': 'fuel',
  hsd: 'fuel',
  maintenance: 'maintenance',
  repair: 'repair',
  parts: 'parts',
  spare: 'parts',
  spares: 'parts',
};

const MIN_CONFIDENCE = 0.7;

function parseAmount(v) {
  return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

function normalizeCategory(category) {
  const key = String(category ?? '').toLowerCase().trim();
  return CATEGORY_MAP[key] || 'other';
}

/**
 * Resolves a vendor by the most reliable identifier available (VAT number, then
 * Companies House number, then exact name) instead of the old substring match,
 * which could silently merge unrelated vendors sharing a common word.
 * Flags a mismatch if an invoice's VAT number disagrees with what's already on file
 * for the matched vendor — a real fraud/data-quality signal, not just noise.
 */
async function resolveVendor(extracted) {
  const name = extracted.vendor_name || 'Unknown';
  const vatCheck = validateVatNumberFormat(extracted.vat_registration_number);
  const crnCheck = validateCompanyNumberFormat(extracted.company_registration_number);
  const sortCheck = validateSortCode(extracted.sort_code);
  const acctCheck = validateAccountNumberFormat(extracted.account_number);
  const addr = extracted.address || {};
  const flags = [];

  let existing = null;
  if (vatCheck.normalized) {
    const { data } = await supabase.from('vendors').select('*').eq('vat_number', vatCheck.normalized).limit(1);
    if (data?.length) existing = data[0];
  }
  if (!existing && crnCheck.normalized) {
    const { data } = await supabase.from('vendors').select('*').eq('company_registration_number', crnCheck.normalized).limit(1);
    if (data?.length) existing = data[0];
  }
  if (!existing) {
    const { data } = await supabase.from('vendors').select('*').ilike('vendor_name', name).limit(1);
    if (data?.length) existing = data[0];
  }

  if (existing) {
    if (vatCheck.normalized && existing.vat_number && existing.vat_number !== vatCheck.normalized) {
      flags.push(`vat_number_mismatch: invoice shows ${vatCheck.normalized}, vendor record has ${existing.vat_number}`);
    }
    const patch = {};
    if (!existing.vat_number && vatCheck.normalized) {
      patch.vat_number = vatCheck.normalized;
      patch.vat_number_valid = vatCheck.valid;
    }
    if (!existing.company_registration_number && crnCheck.normalized) patch.company_registration_number = crnCheck.normalized;
    if (!existing.sort_code && sortCheck.normalized) patch.sort_code = sortCheck.normalized;
    if (!existing.account_number_last4 && acctCheck.last4) patch.account_number_last4 = acctCheck.last4;
    if (!existing.postcode && addr.postcode) {
      patch.address_line1 = addr.line1 || existing.address_line1 || null;
      patch.address_line2 = addr.line2 || existing.address_line2 || null;
      patch.town = addr.town || existing.town || null;
      patch.county = addr.county || existing.county || null;
      patch.postcode = addr.postcode;
    }
    if (Object.keys(patch).length) {
      await supabase.from('vendors').update(patch).eq('id', existing.id);
    }
    return {
      vendorId: existing.id,
      flags,
      vatNumber: vatCheck.normalized || existing.vat_number || null,
      vatNumberValid: vatCheck.normalized ? vatCheck.valid : existing.vat_number_valid,
    };
  }

  const { data: inserted, error } = await supabase
    .from('vendors')
    .insert({
      vendor_name: name,
      vendor_email: extracted.vendor_email || null,
      vendor_phone: extracted.vendor_phone || null,
      vendor_address: extracted.vendor_address || null,
      vat_number: vatCheck.normalized || null,
      vat_number_valid: vatCheck.normalized ? vatCheck.valid : null,
      company_registration_number: crnCheck.normalized || null,
      sort_code: sortCheck.normalized || null,
      account_number_last4: acctCheck.last4 || null,
      address_line1: addr.line1 || null,
      address_line2: addr.line2 || null,
      town: addr.town || null,
      county: addr.county || null,
      postcode: addr.postcode || null,
    })
    .select('id')
    .single();

  if (error) {
    const { data: retry } = await supabase.from('vendors').select('id').ilike('vendor_name', name).limit(1);
    if (retry?.length) return { vendorId: retry[0].id, flags, vatNumber: vatCheck.normalized || null, vatNumberValid: vatCheck.valid };
    throw new Error('Failed to create vendor: ' + error.message);
  }
  return { vendorId: inserted.id, flags, vatNumber: vatCheck.normalized || null, vatNumberValid: vatCheck.normalized ? vatCheck.valid : null };
}

/** Builds a validated per-rate VAT breakdown: a real `vat_breakdown` if extraction provided one, else a single line synthesized from header subtotal/tax/total. */
function buildVatCheck(extracted, { subtotal, taxAmount, totalAmt, invoiceDate }) {
  let rawLines;
  if (Array.isArray(extracted.vat_breakdown) && extracted.vat_breakdown.length > 0) {
    rawLines = extracted.vat_breakdown.map((v) => {
      const rate_pct = parseAmount(v.rate_pct);
      const rate_type = ['standard', 'reduced', 'zero', 'exempt'].includes(v.rate_type) ? v.rate_type : inferUkVatRateType(rate_pct, invoiceDate);
      return {
        rate_type,
        rate_pct,
        net_amount: parseAmount(v.net_amount),
        vat_amount: parseAmount(v.vat_amount),
      };
    });
  } else {
    const rate_pct = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
    rawLines = [
      {
        rate_type: inferUkVatRateType(rate_pct, invoiceDate),
        rate_pct,
        net_amount: subtotal,
        vat_amount: taxAmount,
      },
    ];
  }
  return verifyVatArithmetic(rawLines, totalAmt);
}

function decideValidationStatus({ vatCheck, vendorFlags, confidence, vatNumberProvided, vatNumberValid }) {
  const flags = [...vendorFlags, ...vatCheck.flags];
  const confidenceOk = confidence == null || confidence >= MIN_CONFIDENCE;
  if (!confidenceOk) flags.push(`low_extraction_confidence: ${confidence}`);
  if (vatNumberProvided && vatNumberValid === false) flags.push('vat_number_invalid_format');

  const ok = vatCheck.allValid && vatCheck.totalMatches && confidenceOk && vendorFlags.length === 0 && !(vatNumberProvided && vatNumberValid === false);
  return { status: ok ? 'validated' : 'pending_review', flags };
}

async function findDuplicateInvoiceId(contentHash) {
  if (!contentHash) return null;
  const { data } = await supabase.from('invoice_header').select('invoice_id').eq('content_hash', contentHash).limit(1);
  return data?.length ? data[0].invoice_id : null;
}

async function saveVatLines(invoiceId, vatCheck) {
  if (!vatCheck.lines.length) return;
  const rows = vatCheck.lines.map((l) => ({
    invoice_id: invoiceId,
    rate_type: l.rate_type,
    rate_pct: l.rate_pct,
    net_amount: l.net_amount,
    vat_amount: l.vat_amount,
    expected_vat_amount: l.expected_vat_amount,
    is_valid: l.is_valid,
    variance: l.variance,
  }));
  const { error } = await supabase.from('invoice_vat_lines').insert(rows);
  if (error) throw new Error('Failed to save VAT breakdown: ' + error.message);
}

async function tryPostToLedger(invoiceId, validationStatus, options) {
  const wantsPosting = options.post_to_ledger !== false;
  const allowed = validationStatus === 'validated' || options.override_validation === true;
  if (!wantsPosting) return {};
  if (!allowed) return { ledger_skipped: validationStatus === 'pending_review' ? 'pending_review' : 'not_validated' };

  try {
    const { data: full, error: fe } = await supabase.from('invoice_header').select('*').eq('invoice_id', invoiceId).single();
    if (!fe && full) {
      const ledger = await postInvoiceToLedger(invoiceId, full, { actor: options.actor || 'invoice_save' });
      return { ledger };
    }
    return {};
  } catch (e) {
    await supabase.from('invoice_header').update({ posting_error: e.message }).eq('invoice_id', invoiceId);
    return { ledger_error: e.message };
  }
}

/**
 * Human review decision on a `pending_review` invoice. Approving moves it to `validated`
 * and attempts the ledger post that was withheld at save time; rejecting just records
 * the decision and leaves it unposted.
 */
export async function reviewInvoice(invoiceId, { decision, actor, notes } = {}) {
  if (!['validated', 'rejected'].includes(decision)) {
    throw new Error('decision must be "validated" or "rejected"');
  }
  const { data: current, error: fe } = await supabase.from('invoice_header').select('*').eq('invoice_id', invoiceId).single();
  if (fe || !current) throw new Error('Invoice not found');

  const existingFlags = Array.isArray(current.validation_flags) ? current.validation_flags : [];
  const note = `reviewed_by:${actor || 'unknown'}:${decision}${notes ? ' - ' + notes : ''}`;
  const validation_flags = [...existingFlags, note];

  const { data: updated, error: ue } = await supabase
    .from('invoice_header')
    .update({ validation_status: decision, validation_flags })
    .eq('invoice_id', invoiceId)
    .select('*')
    .single();
  if (ue) throw new Error(ue.message);

  const result = { success: true, invoice: updated };
  if (decision === 'validated') {
    Object.assign(result, await tryPostToLedger(invoiceId, 'validated', { post_to_ledger: true, override_validation: true, actor }));
  }
  return result;
}

/**
 * Save an invoice from previously extracted JSON (e.g. from extractFromImageUrl).
 * @param {object} extracted - Full extracted invoice object (vendor_name, invoice_number, line_items, vat_breakdown, etc.)
 * @param {{ source?: string, post_to_ledger?: boolean, actor?: string, force?: boolean, override_validation?: boolean }} options
 * @returns Saved invoice summary
 */
export async function saveExtractedInvoice(extracted, options = {}) {
  const source = options.source || 'url_upload';
  const category = normalizeCategory(extracted.category);
  const fileUrl = extracted.file_url || null;

  const totalAmt = parseAmount(extracted.total_amount);
  const taxAmt = parseAmount(extracted.tax_amount);
  const subAmt = parseAmount(extracted.subtotal) || totalAmt - taxAmt;

  const invoiceNumber = extracted.invoice_number || 'INV-' + Date.now();
  const invoiceDate = extracted.invoice_date || new Date().toISOString().split('T')[0];

  const contentHash = computeContentHash({ vendor_name: extracted.vendor_name, invoice_number: invoiceNumber, total_amount: totalAmt, invoice_date: invoiceDate });
  if (!options.force) {
    const dupId = await findDuplicateInvoiceId(contentHash);
    if (dupId) {
      return {
        success: false,
        duplicate: true,
        existing_invoice_id: dupId,
        message: 'An invoice with the same vendor, invoice number, date, and total already exists. Pass force:true to save anyway.',
      };
    }
  }

  const { vendorId, flags: vendorFlags, vatNumber, vatNumberValid } = await resolveVendor(extracted);
  const vatCheck = buildVatCheck(extracted, { subtotal: subAmt, taxAmount: taxAmt, totalAmt, invoiceDate });
  const confidence = extracted.confidence != null ? parseAmount(extracted.confidence) : null;
  const { status: validationStatus, flags: validationFlags } = decideValidationStatus({
    vatCheck,
    vendorFlags,
    confidence,
    vatNumberProvided: !!extracted.vat_registration_number,
    vatNumberValid,
  });

  const { data: header, error: headerError } = await supabase
    .from('invoice_header')
    .insert({
      vendor_id: vendorId,
      vendor_name: extracted.vendor_name || 'Unknown',
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: extracted.due_date || null,
      total_amount: totalAmt,
      currency: extracted.currency || 'GBP',
      tax_amount: taxAmt,
      subtotal: subAmt,
      category,
      notes: extracted.notes || null,
      file_url: fileUrl,
      payment_mode: extracted.payment_mode || null,
      invoice_type: extracted.invoice_type || 'Tax Invoice',
      source,
      expense_category: normalizeExpenseCategory(extracted.expense_category),
      vat_number: vatNumber,
      extraction_confidence: confidence,
      validation_status: validationStatus,
      validation_flags: validationFlags,
      content_hash: contentHash,
    })
    .select('invoice_id')
    .single();

  if (headerError) throw new Error('Failed to save invoice header: ' + headerError.message);
  const invoiceId = header.invoice_id;

  const lines = Array.isArray(extracted.line_items) ? extracted.line_items : [];
  if (lines.length > 0) {
    const lineRows = lines.map((li, i) => ({
      invoice_id: invoiceId,
      line_number: i + 1,
      description: li.description || 'Item ' + (i + 1),
      sub_expenditure: li.sub_expenditure || null,
      quantity: parseAmount(li.quantity) || 1,
      unit_price: parseAmount(li.unit_price),
      line_amount: parseAmount(li.line_amount ?? li.total),
    }));
    const { error: lineError } = await supabase.from('invoice_line_items').insert(lineRows);
    if (lineError) throw new Error('Failed to save line items: ' + lineError.message);
  } else {
    const { error: lineError } = await supabase.from('invoice_line_items').insert({
      invoice_id: invoiceId,
      line_number: 1,
      description: `Invoice from ${extracted.vendor_name || 'Unknown'}`,
      quantity: 1,
      unit_price: subAmt || totalAmt,
      line_amount: subAmt || totalAmt,
    });
    if (lineError) throw new Error('Failed to save line items: ' + lineError.message);
  }

  await saveVatLines(invoiceId, vatCheck);

  const summary = {
    success: true,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    vendor: extracted.vendor_name || 'Unknown',
    total_amount: totalAmt,
    currency: extracted.currency || 'GBP',
    date: invoiceDate,
    category,
    line_items_saved: Math.max(lines.length, 1),
    validation_status: validationStatus,
    validation_flags: validationFlags,
  };

  Object.assign(summary, await tryPostToLedger(invoiceId, validationStatus, options));

  return summary;
}

/**
 * Save an invoice from flat typed fields (no image). No vat_breakdown is available here,
 * so the single-rate arithmetic check (subtotal * rate = tax) still runs against whatever
 * subtotal/tax_amount/total_amount were typed in.
 * @param {object} fields - vendor_name, invoice_number, invoice_date, total_amount, currency, category, tax_amount, subtotal, notes, vendor_email?, vendor_phone?, vendor_address?
 * @returns Saved invoice summary
 */
export async function saveTypedInvoice(fields) {
  const vendor_name = fields.vendor_name || 'Unknown';
  const invoice_number = fields.invoice_number || 'INV-' + Date.now();
  const invoice_date = fields.invoice_date || new Date().toISOString().split('T')[0];
  const total_amount = parseAmount(fields.total_amount);
  const tax_amount = parseAmount(fields.tax_amount);
  const subtotal = parseAmount(fields.subtotal) || total_amount - tax_amount;
  const category = normalizeCategory(fields.category);
  const currency = fields.currency || 'GBP';

  const contentHash = computeContentHash({ vendor_name, invoice_number, total_amount, invoice_date });
  if (!fields.force) {
    const dupId = await findDuplicateInvoiceId(contentHash);
    if (dupId) {
      return {
        success: false,
        duplicate: true,
        existing_invoice_id: dupId,
        message: 'An invoice with the same vendor, invoice number, date, and total already exists. Pass force:true to save anyway.',
      };
    }
  }

  const { vendorId, flags: vendorFlags, vatNumber, vatNumberValid } = await resolveVendor({
    vendor_name,
    vendor_email: fields.vendor_email,
    vendor_phone: fields.vendor_phone,
    vendor_address: fields.vendor_address,
    vat_registration_number: fields.vat_registration_number,
    company_registration_number: fields.company_registration_number,
    sort_code: fields.sort_code,
    account_number: fields.account_number,
  });
  const vatCheck = buildVatCheck(fields, { subtotal, taxAmount: tax_amount, totalAmt: total_amount, invoiceDate: invoice_date });
  const { status: validationStatus, flags: validationFlags } = decideValidationStatus({
    vatCheck,
    vendorFlags,
    confidence: null,
    vatNumberProvided: !!fields.vat_registration_number,
    vatNumberValid,
  });

  const { data: header, error: headerError } = await supabase
    .from('invoice_header')
    .insert({
      vendor_id: vendorId,
      vendor_name,
      invoice_number,
      invoice_date,
      due_date: fields.due_date || null,
      total_amount,
      currency,
      tax_amount,
      subtotal,
      category,
      notes: fields.notes || null,
      file_url: null,
      payment_mode: fields.payment_mode || null,
      invoice_type: 'Tax Invoice',
      source: 'api',
      expense_category: normalizeExpenseCategory(fields.expense_category),
      vat_number: vatNumber,
      validation_status: validationStatus,
      validation_flags: validationFlags,
      content_hash: contentHash,
    })
    .select('invoice_id')
    .single();

  if (headerError) throw new Error('Failed to save invoice: ' + headerError.message);
  const invoiceId = header.invoice_id;

  const desc = fields.notes || `Invoice from ${vendor_name}`;
  const { error: lineError } = await supabase.from('invoice_line_items').insert({
    invoice_id: invoiceId,
    line_number: 1,
    description: desc,
    sub_expenditure: category,
    quantity: 1,
    unit_price: subtotal || total_amount,
    line_amount: subtotal || total_amount,
  });
  if (lineError) throw new Error('Failed to save line items: ' + lineError.message);

  await saveVatLines(invoiceId, vatCheck);

  const summary = {
    success: true,
    invoice_id: invoiceId,
    invoice_number,
    vendor: vendor_name,
    total_amount,
    currency,
    date: invoice_date,
    category,
    validation_status: validationStatus,
    validation_flags: validationFlags,
  };

  Object.assign(summary, await tryPostToLedger(invoiceId, validationStatus, fields));

  return summary;
}
