import { extractFromImageUrl } from '../services/extractService.js';
import { saveExtractedInvoice, saveTypedInvoice } from '../services/saveService.js';
import { queryInvoicesNL } from '../services/queryService.js';
import { getInvoiceStats } from '../services/statsService.js';
import { getLastExtracted } from './sessionStore.js';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'extract_invoice_info',
      description: 'Extract invoice information from an image or document URL using AI Vision. EXTRACTION ONLY — does NOT save. Use when user provides an image URL (http/https). Returns preview and extracted data; then ask user to confirm and call save_extracted_invoice with the extracted object.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The full image or document URL of the invoice' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_extracted_invoice',
      description: 'Save an invoice to the database. When user confirmed save after UPLOADING AN IMAGE in this chat, call with NO arguments (empty object) — the data is stored for this session. When you have an extracted object from extract_invoice_info (URL flow), pass it as "extracted".',
      parameters: {
        type: 'object',
        properties: { extracted: { type: 'object', description: 'Optional. The extracted invoice object from extract_invoice_info. Omit when saving after user uploaded an image in this session.' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upload_invoice_url',
      description: 'One-step: extract from URL and save to database. Use only when user explicitly wants immediate save without preview (e.g. "upload and save this invoice").',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The full image or document URL of the invoice' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_invoice_data',
      description: 'Save invoice from typed/text details (no image). Use when user types invoice details. Extract: vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount (number), currency, category (fuel/maintenance/repair/parts/other), tax_amount, subtotal, notes.',
      parameters: {
        type: 'object',
        properties: {
          vendor_name: { type: 'string' },
          invoice_number: { type: 'string' },
          invoice_date: { type: 'string' },
          total_amount: { type: 'number' },
          currency: { type: 'string' },
          category: { type: 'string' },
          tax_amount: { type: 'number' },
          subtotal: { type: 'number' },
          notes: { type: 'string' },
          vendor_email: { type: 'string' },
          vendor_phone: { type: 'string' },
          vendor_address: { type: 'string' },
        },
        required: ['vendor_name', 'total_amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_invoices',
      description: 'Answer any question about invoices by running a query. Use for: list, show, find, how many, total, recent, by category, by vendor, etc. Pass the user question as "question".',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string', description: 'The user natural language question about invoices' } },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_stats',
      description: 'Get overall stats: total count, totals by currency, average, highest/lowest, by category, top vendors. Use when user asks for summary, dashboard, stats, breakdown.',
      parameters: {
        type: 'object',
        properties: { period: { type: 'string', description: 'Optional filter e.g. 2025, 2025-07. Empty for all time.' } },
      },
    },
  },
];

export async function runTool(name, args, sessionId = 'default') {
  switch (name) {
    case 'extract_invoice_info': {
      const { url } = args;
      const { preview, extracted } = await extractFromImageUrl(url);
      return JSON.stringify({ preview, extracted });
    }
    case 'save_extracted_invoice': {
      let extracted = args?.extracted;
      if (!extracted || Object.keys(extracted).length === 0) {
        extracted = getLastExtracted(sessionId);
        if (!extracted) return JSON.stringify({ error: 'No invoice to save. Upload an image first and confirm save, or use extract_invoice_info with a URL then pass the extracted object here.' });
      }
      const result = await saveExtractedInvoice(extracted);
      return JSON.stringify(result);
    }
    case 'upload_invoice_url': {
      const { url } = args;
      const { extracted } = await extractFromImageUrl(url);
      const result = await saveExtractedInvoice(extracted);
      return JSON.stringify(result);
    }
    case 'save_invoice_data': {
      const result = await saveTypedInvoice(args);
      return JSON.stringify(result);
    }
    case 'query_invoices': {
      const { question } = args;
      const result = await queryInvoicesNL(question);
      return JSON.stringify(result);
    }
    case 'get_invoice_stats': {
      const { period } = args || {};
      const result = await getInvoiceStats(period);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: 'Unknown tool: ' + name });
  }
}
