import { Router } from 'express';
import { runAgent } from '../agent/runAgent.js';
import { getMessages, appendExchange, setLastExtracted } from '../agent/sessionStore.js';
import { extractFromImageUrl } from '../services/extractService.js';

const router = Router();

// POST /api/chat - body: { message, session_id?, image_data_url? }
// If image_data_url is provided, we extract first and store extracted in session; only preview is sent to the agent to avoid token blow-up.
router.post('/chat', async (req, res) => {
  try {
    const { message, session_id, image_data_url } = req.body || {};
    let text = (message || '').trim();
    const sessionId = session_id || 'default';

    if (image_data_url) {
      const { preview, extracted } = await extractFromImageUrl(image_data_url);
      setLastExtracted(sessionId, extracted);
      text = text || 'Extract this invoice';
      text = `User uploaded an invoice image.\n\nExtracted preview: ${preview}\n\nWhen the user confirms they want to save, call save_extracted_invoice with no arguments (empty object) — the data is stored for this session.`;
    }

    if (!text) {
      return res.status(400).json({ error: 'message is required (or attach an image)' });
    }

    const history = getMessages(sessionId);
    const reply = await runAgent([...history, { role: 'user', content: text }], sessionId);
    appendExchange(sessionId, text, reply);

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
