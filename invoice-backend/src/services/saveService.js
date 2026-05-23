import { supabase } from '../db.js';
import { postInvoiceToLedger } from './posting/invoicePostingService.js';

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

function parseAmount(v) {
  return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

function normalizeCategory(category) {
  const key = String(category ?? '').toLowerCase().trim();
  return CATEGORY_MAP[key] || 'other';
}

async function getOrCreateVendor(vendorName, { vendor_email, vendor_phone, vendor_address } = {}) {
  const name = vendorName || 'Unknown';
  const { data: existing } = await supabase
    .from('vendors')
    .select('id')
    .ilike('vendor_name', `%${name}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: inserted, error } = await supabase
    .from('vendors')
    .insert({
      vendor_name: name,
      vendor_email: vendor_email || null,
      vendor_phone: vendor_phone || null,
      vendor_address: vendor_address || null,
    })
    .select('id')
    .single();

  if (error) {
    const { data: retry } = await supabase.from('vendors').select('id').ilike('vendor_name', `%${name}%`).limit(1);
    if (retry?.length) return retry[0].id;
    throw new Error('Failed to create vendor: ' + error.message);
  }
  return inserted.id;
}

/**
 * Save an invoice from previously extracted JSON (e.g. from extractFromImageUrl).
 * @param {object} extracted - Full extracted invoice object (vendor_name, invoice_number, line_items, etc.)
 * @param {{ source?: string }} options - source defaults to 'url_upload'
 * @returns Saved invoice summary
 */
export async function saveExtractedInvoice(extracted, options = {}) {
  const source = options.source || 'url_upload';
  const category = normalizeCategory(extracted.category);
  const fileUrl = extracted.file_url || null;

  const vendorId = await getOrCreateVendor(extracted.vendor_name, {
    vendor_email: extracted.vendor_email,
    vendor_phone: extracted.vendor_phone,
    vendor_address: extracted.vendor_address,
  });

  const totalAmt = parseAmount(extracted.total_amount);
  const taxAmt = parseAmount(extracted.tax_amount);
  const subAmt = parseAmount(extracted.subtotal) || totalAmt - taxAmt;

  const invoiceNumber = extracted.invoice_number || 'INV-' + Date.now();
  const invoiceDate = extracted.invoice_date || new Date().toISOString().split('T')[0];

  const { data: header, error: headerError } = await supabase
    .from('invoice_header')
    .insert({
      vendor_id: vendorId,
      vendor_name: extracted.vendor_name || 'Unknown',
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: extracted.due_date || null,
      total_amount: totalAmt,
      currency: extracted.currency || 'INR',
      tax_amount: taxAmt,
      subtotal: subAmt,
      category,
      notes: extracted.notes || null,
      file_url: fileUrl,
      payment_mode: extracted.payment_mode || null,
      invoice_type: extracted.invoice_type || 'Tax Invoice',
      source,
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

  const summary = {
    success: true,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    vendor: extracted.vendor_name || 'Unknown',
    total_amount: totalAmt,
    currency: extracted.currency || 'INR',
    date: invoiceDate,
    category,
    line_items_saved: Math.max(lines.length, 1),
  };

  if (options.post_to_ledger !== false) {
    try {
      const { data: full, error: fe } = await supabase.from('invoice_header').select('*').eq('invoice_id', invoiceId).single();
      if (!fe && full) {
        const ledger = await postInvoiceToLedger(invoiceId, full, { actor: options.actor || 'invoice_save' });
        summary.ledger = ledger;
      }
    } catch (e) {
      await supabase.from('invoice_header').update({ posting_error: e.message }).eq('invoice_id', invoiceId);
      summary.ledger_error = e.message;
    }
  }

  return summary;
}

/**
 * Save an invoice from flat typed fields (no image extraction).
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
  const currency = fields.currency || 'INR';

  const vendorId = await getOrCreateVendor(vendor_name, {
    vendor_email: fields.vendor_email,
    vendor_phone: fields.vendor_phone,
    vendor_address: fields.vendor_address,
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

  const summary = {
    success: true,
    invoice_id: invoiceId,
    invoice_number,
    vendor: vendor_name,
    total_amount,
    currency,
    date: invoice_date,
    category,
  };

  if (fields.post_to_ledger !== false) {
    try {
      const { data: full, error: fe } = await supabase.from('invoice_header').select('*').eq('invoice_id', invoiceId).single();
      if (!fe && full) {
        const ledger = await postInvoiceToLedger(invoiceId, full, { actor: 'typed_invoice' });
        summary.ledger = ledger;
      }
    } catch (e) {
      await supabase.from('invoice_header').update({ posting_error: e.message }).eq('invoice_id', invoiceId);
      summary.ledger_error = e.message;
    }
  }

  return summary;
}
