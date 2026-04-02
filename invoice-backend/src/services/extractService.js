import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const EXTRACT_PROMPT = `Extract all invoice information from this image. Return ONLY valid JSON with these fields: {vendor_name (string), vendor_email (string or null), vendor_phone (string or null), vendor_address (string or null), invoice_number (string), invoice_date (YYYY-MM-DD string), due_date (YYYY-MM-DD or null), total_amount (number, no commas), currency (3-letter ISO code), tax_amount (number), subtotal (number), payment_mode (string or null), invoice_type (string or null), line_items (array of {description, sub_expenditure, quantity, unit_price, line_amount}), category (one of: maintenance/fuel/parts/repair/other), notes (string or null)}. Use null for missing strings, 0 for missing numbers.`;

const SSL_ERROR_MESSAGE = 'The image could not be loaded from this URL. The server may use an invalid or self-signed SSL certificate. Please re-upload the image to a host with valid HTTPS (e.g. imgbb.com or postimages.org) and use that link.';

function parseAmount(v) {
  return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

function parseJsonFromContent(content) {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

/**
 * Extract invoice data from an image URL using OpenAI Vision. Does NOT save to DB.
 * @param {string} url - Image or document URL
 * @returns {{ preview: string, extracted: object }}
 */
export async function extractFromImageUrl(url) {
  if (!url || !url.trim()) {
    throw new Error('No URL provided. Please provide an image or invoice URL.');
  }

  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            { type: 'image_url', image_url: { url } },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });
  } catch (err) {
    const msg = (err.message || String(err)).toLowerCase();
    if (/certificate|ssl|tls|unable to get local issuer|could not fetch|fetch.*fail|url.*empty|invalid url/i.test(msg)) {
      throw new Error(SSL_ERROR_MESSAGE);
    }
    throw new Error('Could not process image from URL: ' + (err.message || err));
  }

  if (response.error) {
    const errMsg = response.error.message || JSON.stringify(response.error);
    if (/fetch|certificate|ssl|url|image/i.test(errMsg.toLowerCase())) {
      throw new Error(SSL_ERROR_MESSAGE);
    }
    throw new Error('OpenAI error: ' + errMsg);
  }

  if (!response.choices || !response.choices[0]) {
    throw new Error('OpenAI Vision failed: ' + JSON.stringify(response).slice(0, 300));
  }

  const content = response.choices[0].message?.content;
  if (!content) throw new Error('Empty response from OpenAI Vision');

  let extracted;
  try {
    extracted = parseJsonFromContent(content);
  } catch (e) {
    throw new Error('Could not parse invoice JSON: ' + e.message);
  }

  extracted.file_url = url;
  const preview = buildFullPreview(extracted);
  return { preview, extracted };
}

/**
 * Build a full human-readable preview of all extracted fields (vendor, dates, line items with prices, totals).
 * So the chat can show every field before the user confirms save.
 */
function buildFullPreview(extracted) {
  const fmt = (v, fallback = '') => (v != null && v !== '' ? String(v) : fallback);
  const num = (v) => parseAmount(v);
  const cur = extracted.currency || 'INR';

  let out = '--- EXTRACTED INVOICE ---\n\n';
  out += `Vendor: ${fmt(extracted.vendor_name, '—')}\n`;
  if (extracted.vendor_email) out += `Vendor email: ${extracted.vendor_email}\n`;
  if (extracted.vendor_phone) out += `Vendor phone: ${extracted.vendor_phone}\n`;
  if (extracted.vendor_address) out += `Vendor address: ${extracted.vendor_address}\n`;
  out += `Invoice number: ${fmt(extracted.invoice_number, '—')}\n`;
  out += `Invoice date: ${fmt(extracted.invoice_date, '—')}\n`;
  if (extracted.due_date) out += `Due date: ${extracted.due_date}\n`;
  out += `Type: ${fmt(extracted.invoice_type, 'Tax Invoice')}\n`;
  out += `Currency: ${cur}\n\n`;

  const lines = Array.isArray(extracted.line_items) ? extracted.line_items : [];
  if (lines.length > 0) {
    out += 'Line items:\n';
    out += '  # | Description                    | Qty  | Unit price | Line total\n';
    out += '----+--------------------------------+------+------------+------------\n';
    lines.forEach((li, i) => {
      const desc = (li.description || '—').slice(0, 30).padEnd(30);
      const qty = fmt(li.quantity, '1');
      const up = num(li.unit_price).toFixed(2);
      const amt = num(li.line_amount ?? li.total).toFixed(2);
      out += `  ${i + 1} | ${desc} | ${qty.padStart(4)} | ${up.padStart(10)} | ${amt.padStart(10)}\n`;
    });
    out += '\n';
  }

  const sub = num(extracted.subtotal);
  const tax = num(extracted.tax_amount);
  const total = num(extracted.total_amount);
  out += `Subtotal: ${cur} ${sub.toFixed(2)}\n`;
  out += `Tax amount: ${cur} ${tax.toFixed(2)}\n`;
  out += `Total amount: ${cur} ${total.toFixed(2)}\n`;

  if (extracted.payment_mode) out += `\nPayment mode: ${extracted.payment_mode}\n`;
  if (extracted.notes) out += `Notes: ${extracted.notes}\n`;
  if (extracted.category) out += `Category: ${extracted.category}\n`;

  return out.trim();
}
