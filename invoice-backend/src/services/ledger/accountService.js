import { supabase } from '../../db.js';

export async function listAccounts(activeOnly = true) {
  let q = supabase.from('accounts').select('*').order('code');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAccountByCode(code) {
  const { data, error } = await supabase.from('accounts').select('*').eq('code', code).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const CATEGORY_EXPENSE_CODE = {
  fuel: '5100',
  maintenance: '5200',
  repair: '5300',
  parts: '5400',
  other: '5900',
};

export function expenseAccountCodeForCategory(category) {
  const k = String(category || 'other').toLowerCase();
  return CATEGORY_EXPENSE_CODE[k] || CATEGORY_EXPENSE_CODE.other;
}
