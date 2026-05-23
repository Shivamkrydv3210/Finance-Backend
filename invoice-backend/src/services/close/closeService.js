import { supabase } from '../../db.js';

const DEFAULT_TASKS = [
  { task_key: 'bank_reconciled', title: 'Bank accounts reconciled', sort_order: 10 },
  { task_key: 'review_accruals', title: 'Review accruals and prepayments', sort_order: 20 },
  { task_key: 'review_ap_aging', title: 'Review AP aging', sort_order: 30 },
  { task_key: 'tax_summary', title: 'Prepare tax summary / advisor pack', sort_order: 40 },
  { task_key: 'lock_period', title: 'Soft-close or lock period after sign-off', sort_order: 50 },
];

export async function ensureMonthEndTasks(periodId) {
  const { data: existing } = await supabase.from('month_end_tasks').select('task_id').eq('period_id', periodId).limit(1);
  if (existing?.length) return { created: false, message: 'Tasks already exist' };

  const rows = DEFAULT_TASKS.map((t) => ({
    period_id: periodId,
    task_key: t.task_key,
    title: t.title,
    sort_order: t.sort_order,
  }));
  const { error } = await supabase.from('month_end_tasks').insert(rows);
  if (error) throw new Error(error.message);
  return { created: true, count: rows.length };
}

export async function listMonthEndTasks(periodId) {
  const { data, error } = await supabase
    .from('month_end_tasks')
    .select('*')
    .eq('period_id', periodId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function setMonthEndTaskDone(taskId, { is_done, actor, notes }) {
  const patch = {
    is_done: !!is_done,
    done_at: is_done ? new Date().toISOString() : null,
    done_by: is_done ? actor || 'system' : null,
  };
  if (notes !== undefined) patch.notes = notes;
  const { data, error } = await supabase.from('month_end_tasks').update(patch).eq('task_id', taskId).select().single();
  if (error) throw new Error(error.message);
  await supabase.from('audit_events').insert({
    entity_type: 'month_end_task',
    entity_id: String(taskId),
    action: is_done ? 'completed' : 'reopened',
    payload: {},
    actor: actor || 'system',
  });
  return data;
}

export async function addAttachment({ entity_type, entity_id, storage_path, public_url, file_name, mime_type, uploaded_by }) {
  const { data, error } = await supabase
    .from('document_attachments')
    .insert({
      entity_type,
      entity_id: String(entity_id),
      storage_path: storage_path || null,
      public_url: public_url || null,
      file_name: file_name || null,
      mime_type: mime_type || null,
      uploaded_by: uploaded_by || 'system',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listAttachments(entity_type, entity_id) {
  const { data, error } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('entity_type', entity_type)
    .eq('entity_id', String(entity_id))
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
