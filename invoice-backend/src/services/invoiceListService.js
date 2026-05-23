import { supabase } from '../db.js';

export async function listInvoices({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { data, error, count } = await supabase
    .from('invoice_header')
    .select('*', { count: 'exact' })
    .order('invoice_date', { ascending: false })
    .range(off, off + lim - 1);
  if (error) throw new Error(error.message);
  return { invoices: data || [], total: count ?? data?.length ?? 0 };
}

export async function getInvoiceById(invoiceId) {
  const id = Number(invoiceId);
  const { data: inv, error: e1 } = await supabase.from('invoice_header').select('*').eq('invoice_id', id).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!inv) return null;
  const { data: lines, error: e2 } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', id)
    .order('line_number');
  if (e2) throw new Error(e2.message);
  return { ...inv, line_items: lines || [] };
}
