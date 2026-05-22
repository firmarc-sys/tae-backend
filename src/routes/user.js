const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Plan token limits
const PLAN_TOKENS = {
  demo: 5000,
  starter: 50000,
  pro: 500000,
  enterprise: 10000000,
};

// ─── GET /user/balance ────────────────────────────────────
router.get('/balance', requireAuth, async (req, res) => {
  try {
    // Handle demo users
    if (req.userId.startsWith('demo-')) {
      return res.json({
        remaining_tokens: 4500,
        total_tokens: 5000,
        usage_percent: 10,
        remaining_cost_usd: 0,
        plan: 'demo',
        renewal_date: null,
        status: 'active',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const total = user.tokens_limit || PLAN_TOKENS[user.plan] || 5000;
    const remaining = Math.max(0, total - user.tokens_used);
    const pct = total > 0 ? Math.round((user.tokens_used / total) * 100) : 0;
    const status = remaining === 0 ? 'exhausted' : pct > 80 ? 'warning' : 'active';

    res.json({
      remaining_tokens: remaining,
      total_tokens: total,
      usage_percent: pct,
      remaining_cost_usd: 0,
      plan: user.plan,
      renewal_date: user.renewal_date,
      status,
    });
  } catch (err) {
    console.error('Balance error:', err);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// ─── GET /user/alerts ──────────────────────────────────────
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    if (req.userId.startsWith('demo-')) {
      return res.json({ alerts: [] });
    }

    const status = req.query.status || 'active';
    const limit = parseInt(req.query.limit) || 10;

    const alerts = await prisma.alert.findMany({
      where: { user_id: req.userId, status },
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    res.json({ alerts });
  } catch (err) {
    console.error('Alerts error:', err);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// ─── POST /user/alerts/:id/dismiss ─────────────────────────
router.post('/alerts/:id/dismiss', requireAuth, async (req, res) => {
  try {
    if (req.userId.startsWith('demo-')) {
      return res.json({ ok: true });
    }

    await prisma.alert.update({
      where: { id: req.params.id },
      data: { status: 'dismissed' },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Dismiss alert error:', err);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

module.exports = router;
