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

// ─── Middleware ───────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // Allow all origins for now
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
    timestamp: new Date().toISOString(),
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
