import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './config.js';
import apiRoutes from './routes/api.js';
import chatRoutes from './routes/chat.js';
import financeRoutes from './routes/finance.js';
import bankRoutes from './routes/bank.js';
import closeRoutes from './routes/close.js';
import aiRoutes from './routes/ai.js';
import traceRoutes from './routes/trace.js';
import knowledgeRoutes from './routes/knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/api', apiRoutes);
app.use('/api', chatRoutes);
app.use('/api', financeRoutes);
app.use('/api', bankRoutes);
app.use('/api', closeRoutes);
app.use('/api', aiRoutes);
app.use('/api', traceRoutes);
app.use('/api', knowledgeRoutes);

// no-cache (not no-store): browser still keeps a local copy but must revalidate via
// ETag/Last-Modified on every load instead of trusting a stale cached copy — otherwise
// dashboard.js/css edits don't show up until a hard refresh.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Invoice backend running at http://localhost:${PORT}`);
  console.log(`Finance Console UI: http://localhost:${PORT}/`);
});
