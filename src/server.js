require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const billingRouter = require('./routes/billing');
const taeRouter = require('./routes/tae');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3100;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sios-runtime.netlify.app';
const GID = '399152573423';

// ─── Middleware ───────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // Allow Netlify and preview origins
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

// ─── Health ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.7.0',
    service: 'TAE Backend',
    frontend: FRONTEND_URL,
    gid: GID,
    mode: 'Prime Orchestrator',
    timestamp: new Date().toISOString(),
  });
});

// ─── Netlify/SIOS Compatibility API Stubs ──────────────────
app.get('/api/gid', (req, res) => {
  const gid = String(req.query.gid || '').trim();
  const owner = gid === GID;
  res.json({
    gid: gid || GID,
    name: owner ? 'Prime Orchestrator' : 'SIOS User',
    role: owner ? 'owner' : 'user',
    mode: owner ? 'Prime Orchestrator' : 'Demo',
    status: 'accepted',
    frontend: FRONTEND_URL,
  });
});

app.post('/api/signup', (req, res) => {
  const name = (req.body && req.body.name) || 'SIOS User';
  const gid = String(Math.floor(100000000000 + Math.random() * 900000000000));
  res.json({
    gid,
    name,
    role: 'user',
    mode: 'Demo',
    status: 'created',
    frontend: FRONTEND_URL,
  });
});

app.get('/api/tae', (req, res) => {
  res.json({
    status: 'online',
    service: 'TAE',
    gid: GID,
    mode: 'Prime Orchestrator',
    phrase: 'This is not an app. This is me.',
  });
});

app.get('/api/render-state', (req, res) => {
  res.json({
    state: 'active',
    runtime: 'liquid-chrome',
    flow: 'idle→active→generate',
    surface: 'mercury-orb',
    frontend: FRONTEND_URL,
  });
});

app.get('/api/iot', (req, res) => {
  res.json({
    status: 'listening',
    mesh: 'simulated',
    devices: [],
  });
});

app.get('/api/syncori', (req, res) => {
  res.json({
    status: 'synchronized',
    mode: 'CRDT-simulated',
    peers: ['self'],
  });
});

app.get('/api/identity', (req, res) => {
  res.json({
    gid: GID,
    role: 'Prime Orchestrator',
    status: 'OPTIMAL',
    scope: 'all surfaces',
  });
});

// ─── Routes ───────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/user', userRouter);
app.use('/billing', billingRouter);
app.use('/api/tae', taeRouter);
app.use('/admin', adminRouter);

// ─── Stripe Webhook (raw body) ────────────────────────────
const stripeWebhook = require('./routes/stripe-webhook');
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TAE Backend v0.7.0 listening on :${PORT}`);
});
