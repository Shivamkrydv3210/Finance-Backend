import { Router } from 'express';
import {
  ensureMonthEndTasks,
  listMonthEndTasks,
  setMonthEndTaskDone,
  addAttachment,
  listAttachments,
} from '../services/close/closeService.js';

const router = Router();

router.post('/close/periods/:periodId/tasks/ensure', async (req, res) => {
  try {
    res.json(await ensureMonthEndTasks(Number(req.params.periodId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/close/periods/:periodId/tasks', async (req, res) => {
  try {
    res.json({ tasks: await listMonthEndTasks(Number(req.params.periodId)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/close/tasks/:taskId', async (req, res) => {
  try {
    const { is_done, actor, notes } = req.body || {};
    res.json(await setMonthEndTaskDone(Number(req.params.taskId), { is_done, actor, notes }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/close/attachments', async (req, res) => {
  try {
    res.json(await addAttachment(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/close/attachments', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || entity_id == null) {
      return res.status(400).json({ error: 'entity_type and entity_id required' });
    }
    res.json({ attachments: await listAttachments(entity_type, entity_id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
