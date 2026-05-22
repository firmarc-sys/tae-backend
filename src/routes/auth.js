const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const prisma = require('../db');
const { generateTokens, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── POST /auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const emailLower = email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });

    // If user exists and is whitelisted but hasn't set a real password yet,
    // allow them to "register" (activate their account)
    if (existing && existing.whitelisted) {
      const password_hash = await bcrypt.hash(password, 12);
      const updated = await prisma.user.update({
        where: { email: emailLower },
        data: {
          password_hash,
          display_name: display_name || existing.display_name,
        },
      });

      const tokens = generateTokens(updated.id);
      await prisma.refreshToken.create({
        data: {
          user_id: updated.id,
          token: tokens.refresh_token,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return res.json({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: {
          id: updated.id,
          email: updated.email,
          display_name: updated.display_name,
          gid: updated.gid,
          role: updated.role,
          plan: updated.plan,
        },
      });
    }

    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const gid = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        password_hash,
        display_name: display_name || email.split('@')[0],
        gid,
        plan: 'demo',
        tokens_limit: 5000,
      },
    });

    const tokens = generateTokens(user.id);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token: tokens.refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        gid: user.gid,
        role: user.role || 'user',
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = generateTokens(user.id);

    await prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token: tokens.refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        gid: user.gid,
        role: user.role || 'user',
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: { user: true },
    });

    if (!stored || stored.expires_at < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Rotate tokens
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = generateTokens(stored.user.id);

    await prisma.refreshToken.create({
      data: {
        user_id: stored.user.id,
        token: tokens.refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── GET /auth/me ──────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      gid: user.gid,
      role: user.role || 'user',
      plan: user.plan,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ─── POST /auth/demo ──────────────────────────────────────
router.post('/demo', async (req, res) => {
  try {
    const demoGid = 'DEMO-' + Math.floor(100000 + Math.random() * 900000);
    const tokens = generateTokens('demo-' + demoGid);

    res.json({
      access_token: tokens.access_token,
      user: {
        display_name: 'Demo User',
        gid: demoGid,
        plan: 'demo',
      },
    });
  } catch (err) {
    console.error('Demo error:', err);
    res.status(500).json({ error: 'Demo creation failed' });
  }
});

module.exports = router;
