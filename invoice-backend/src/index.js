import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './config.js';
import apiRoutes from './routes/api.js';
import chatRoutes from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/api', apiRoutes);
app.use('/api', chatRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Invoice backend running at http://localhost:${PORT}`);
  console.log(`Chat UI: http://localhost:${PORT}/`);
});
