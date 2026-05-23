import { supabase } from '../../db.js';

/**
 * @param {string} isoDate - YYYY-MM-DD
 */
export async function getPeriodForDate(isoDate) {
  const d = isoDate?.slice(0, 10);
  if (!d) throw new Error('Invalid date');
  const [y, m] = d.split('-').map(Number);

  const { data: byYm, error: ymErr } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('period_year', y)
    .eq('period_month', m)
    .maybeSingle();
  if (ymErr) throw new Error(ymErr.message);
  if (byYm) return byYm;

  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .lte('start_date', d)
    .gte('end_date', d)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data: inserted, error: insErr } = await supabase
    .from('fiscal_periods')
    .insert({
      period_year: y,
      period_month: m,
      start_date: startStr,
      end_date: endStr,
      status: 'open',
    })
    .select()
    .single();
  if (insErr) {
    if (insErr.code === '23505') {
      const { data: row, error: again } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('period_year', y)
        .eq('period_month', m)
        .single();
      if (again) throw new Error(again.message);
      return row;
    }
    throw new Error(insErr.message);
  }
  return inserted;
}

export async function getPeriodById(periodId) {
  const { data, error } = await supabase.from('fiscal_periods').select('*').eq('period_id', periodId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPeriods(limit = 24) {
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updatePeriodStatus(periodId, status) {
  if (!['open', 'soft_closed', 'locked'].includes(status)) throw new Error('Invalid status');
  const { data, error } = await supabase
    .from('fiscal_periods')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('period_id', periodId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
