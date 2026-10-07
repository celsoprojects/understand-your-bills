import express from 'express';
import cookieParser from 'cookie-parser';
import { initSchema } from './db.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import billRoutes from './routes/bills.js';
import paymentRoutes from './routes/payments.js';
import shareRoutes from './routes/shares.js';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'billshare-api', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', billRoutes);
app.use('/api', paymentRoutes);
app.use('/api', shareRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

const port = Number(process.env.PORT || 8000);

async function start() {
  await initSchema();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[api] BillShare API listening on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
