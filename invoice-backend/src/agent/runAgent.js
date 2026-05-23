import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_CHAT_MODEL } from '../config.js';
import { formatOpenAIRequestError } from '../openaiErrorMessage.js';
import { TOOL_DEFINITIONS, runTool } from './tools.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_MESSAGE = `You are an Invoice AI Assistant with DIRECT DATABASE ACCESS via tools. You MUST use your tools — never say you don't have database access.

CRITICAL RULE: For ANY question about invoices, lists, data, or numbers → ALWAYS call query_invoices or get_invoice_stats. NEVER answer from memory or say you cannot access the database.

IMAGE / URL EXTRACTION (separate step):
① extract_invoice_info — Use when user provides an image URL (http/https). Call with url. Returns preview and extracted object. Show preview and ask "Save this invoice? Reply yes to save." When user confirms, call save_extracted_invoice with the extracted object.
② save_extracted_invoice — When user confirms save: If they UPLOADED an image in this chat, call with NO arguments (empty object). If you have an extracted object from extract_invoice_info (URL), pass it as "extracted".
③ upload_invoice_url — One-step extract and save. Use only when user explicitly wants immediate save without preview.

TEXT / TYPED INVOICES:
④ save_invoice_data — When user types invoice details. Pass vendor_name, invoice_number, invoice_date, total_amount, currency, category (fuel/maintenance/repair/parts/other), tax_amount, subtotal, notes.

DATA QUESTIONS:
⑤ query_invoices — For list, show, find, how many, total, recent, by category, by vendor. Pass the user question.
⑥ get_invoice_stats — For summary, dashboard, stats, spending overview, breakdown.

RULES: For uploaded image (message says "User uploaded an invoice image"), you will receive a full "Extracted preview" with vendor, dates, line items (description, qty, unit price, line total), subtotal, tax, total. Show this ENTIRE preview to the user — do not summarize. Include every field and the line items table so the user can verify before saving. Then ask "Would you like to save this invoice? Reply yes to save." When user says yes, call save_extracted_invoice with NO arguments. For image URL use extract_invoice_info first, then save_extracted_invoice(extracted) on confirm. Never say you don't have database access. Format query results as a clean list or table.`;

const MAX_TURNS = 10;

/**
 * Run the agent: process user message with conversation history, execute tools, return final reply.
 * @param {Array<{role: string, content: string}>} messages - Conversation history (including new user message)
 * @param {string} [sessionId] - Session ID (for save_extracted_invoice when saving uploaded image)
 * @returns {Promise<string>} Final assistant reply text
 */
export async function runAgent(messages, sessionId = 'default') {
  const fullMessages = [{ role: 'system', content: SYSTEM_MESSAGE }, ...messages];
  let turn = 0;

  while (turn++ < MAX_TURNS) {
    let response;
    try {
      response = await openai.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        messages: fullMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2000,
      });
    } catch (err) {
      throw new Error(formatOpenAIRequestError(err, 'Chat assistant'));
    }

    const choice = response.choices?.[0];
    if (!choice) throw new Error('No response from OpenAI');

    const msg = choice.message;
    fullMessages.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.tool_calls,
    });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content || '').trim() || 'Done.';
    }

    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch (_) {}
      let result;
      try {
        result = await runTool(name, args, sessionId);
      } catch (err) {
        result = JSON.stringify({ error: err.message });
      }
      fullMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  const lastAssistant = [...fullMessages].reverse().find((m) => m.role === 'assistant');
  return (lastAssistant?.content || 'Maximum turns reached.').trim();
}
