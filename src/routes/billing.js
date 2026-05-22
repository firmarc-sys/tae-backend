const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Initialize Stripe only if key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Plan definitions
const PLANS = [
  {
    id: 'demo',
    name: 'Demo',
    price: 0,
    tokens: 5000,
    price_id: null,
    features: ['5,000 tokens', 'Basic TAE access', 'Community support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 9.99,
    tokens: 50000,
    price_id: process.env.STRIPE_PRICE_STARTER || null,
    features: ['50,000 tokens/mo', 'Full TAE access', 'Email support', 'API access'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    tokens: 500000,
    price_id: process.env.STRIPE_PRICE_PRO || null,
    features: ['500,000 tokens/mo', 'Priority TAE', 'Dedicated support', 'Advanced API', 'Custom integrations'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    tokens: null,
    price_id: null,
    features: ['Unlimited tokens', 'SLA guarantee', 'Dedicated instance', 'Custom training', '24/7 support'],
  },
];

// ─── GET /billing/plans ───────────────────────────────────
router.get('/plans', (req, res) => {
  res.json({
    plans: PLANS.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      tokens: p.tokens,
      price_id: p.price_id,
      features: p.features,
    })),
  });
});

// ─── POST /billing/checkout ───────────────────────────────
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const { price_id } = req.body;
    if (!price_id) {
      return res.status(400).json({ error: 'price_id required' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { sios_user_id: user.id, gid: user.gid },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripe_customer_id: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: (process.env.FRONTEND_URL || 'https://sios-runtime.netlify.app') + '?checkout=success',
      cancel_url: (process.env.FRONTEND_URL || 'https://sios-runtime.netlify.app') + '?checkout=cancel',
      metadata: { sios_user_id: user.id },
    });

    res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ─── POST /billing/portal ─────────────────────────────────
router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: process.env.FRONTEND_URL || 'https://sios-runtime.netlify.app',
    });

    res.json({ portal_url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Billing portal failed' });
  }
});

module.exports = router;
