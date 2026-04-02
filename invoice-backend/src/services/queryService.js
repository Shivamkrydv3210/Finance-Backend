import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config.js';
import { supabase } from '../db.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SCHEMA = `PostgreSQL tables:

invoice_header columns:
  invoice_id (bigint PK), vendor_id (bigint FK), vendor_name (text),
  invoice_number (text), invoice_date (date), due_date (date),
  category (text: fuel | maintenance | repair | parts | other),
  currency (text: INR | USD), subtotal (numeric), tax_amount (numeric),
  total_amount (numeric), payment_mode (text), invoice_type (text),
  notes (text), file_url (text), source (text), created_at (timestamptz)

invoice_line_items columns:
  line_item_id (bigint PK), invoice_id (bigint FK → invoice_header.invoice_id),
  line_number (int), description (text), sub_expenditure (text),
  quantity (numeric), unit_price (numeric), line_amount (numeric), created_at (timestamptz)

vendors columns:
  id (bigint PK), vendor_name (text), vendor_email (text),
  vendor_phone (text), vendor_address (text)`;

const SQL_SYSTEM_PROMPT = `You are a PostgreSQL expert. Convert the user's question into a valid PostgreSQL SELECT query.

Schema:
${SCHEMA}

Rules:
- Output ONLY the raw SQL query — no markdown, no explanation, no semicolon at end
- Default ORDER BY invoice_date DESC unless user specifies different sort
- Default LIMIT 50 unless user asks for specific count or all
- For aggregation questions (totals, sums, counts, averages, group by): use SUM(), COUNT(), AVG(), GROUP BY accordingly
- For date filters: use invoice_date >= '2025-01-01' format
- For line item questions: JOIN invoice_line_items ON invoice_line_items.invoice_id = invoice_header.invoice_id
- Always use invoice_header as the primary table
- For vendor filters: use vendor_name ILIKE '%name%'
- For amount filters: use total_amount > value or total_amount BETWEEN x AND y`;

/**
 * Answer a natural language question about invoices by generating SQL and executing via run_invoice_query.
 * @param {string} question - User's question (e.g. "list all fuel invoices")
 * @returns {{ count: number, data: array, sql_used: string }}
 */
export async function queryInvoicesNL(question) {
  const q = (question || '').trim();
  if (!q) throw new Error('Please provide a question about your invoices.');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SQL_SYSTEM_PROMPT },
      { role: 'user', content: q },
    ],
    max_tokens: 600,
    temperature: 0,
  });

  if (!response.choices || !response.choices[0]) {
    throw new Error('OpenAI SQL generation failed: ' + JSON.stringify(response).slice(0, 200));
  }

  let sql = response.choices[0].message.content.trim();
  sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/gi, '').replace(/;$/, '').trim();

  const { data: rows, error } = await supabase.rpc('run_invoice_query', { sql_query: sql });

  if (error) {
    throw new Error(`SQL execution failed.\nError: ${error.message}\nGenerated SQL:\n${sql}`);
  }

  const data = Array.isArray(rows) ? rows : [];
  return { count: data.length, data, sql_used: sql };
}
