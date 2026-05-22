const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../db');

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || 'sios-admin-key-change-me';

// Plan token limits
const PLAN_TOKENS = {
  demo: 5000,
  starter: 50000,
  pro: 500000,
  enterprise: 10000000,
};

// ─── Admin key middleware ──────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden — invalid admin key' });
  }
  next();
}

// ─── POST /admin/provision ────────────────────────────────
// Provision (whitelist) a single user
router.post('/provision', requireAdmin, async (req, res) => {
  try {
    const { email, display_name, gid, role, plan } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const emailLower = email.toLowerCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) {
      // Update existing user: grant whitelist + plan upgrade
      const updated = await prisma.user.update({
        where: { email: emailLower },
        data: {
          whitelisted: true,
          role: role || existing.role,
          plan: plan || existing.plan,
          tokens_limit: PLAN_TOKENS[plan || existing.plan] || existing.tokens_limit,
          display_name: display_name || existing.display_name,
        },
      });
      return res.json({
        status: 'updated',
        user: {
          email: updated.email,
          display_name: updated.display_name,
          gid: updated.gid,
          role: updated.role,
          plan: updated.plan,
          whitelisted: updated.whitelisted,
        },
      });
    }

    // Generate temporary password (user resets on first login)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const password_hash = await bcrypt.hash(tempPassword, 12);

    // Generate GID if not provided
    const userGid = gid || generateGid();

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        password_hash,
        display_name: display_name || email.split('@')[0],
        gid: userGid,
        role: role || 'user',
        plan: plan || 'enterprise',
        whitelisted: true,
        tokens_limit: PLAN_TOKENS[plan || 'enterprise'] || 10000000,
      },
    });

    res.json({
      status: 'created',
      user: {
        email: user.email,
        display_name: user.display_name,
        gid: user.gid,
        role: user.role,
        plan: user.plan,
        whitelisted: user.whitelisted,
      },
      temp_password: tempPassword,
    });
  } catch (err) {
    console.error('Provision error:', err);
    res.status(500).json({ error: 'Provisioning failed', detail: err.message });
  }
});

// ─── POST /admin/provision/batch ──────────────────────────
// Provision multiple users at once
router.post('/provision/batch', requireAdmin, async (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Users array required' });
    }

    const results = [];

    for (const u of users) {
      const emailLower = u.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: emailLower } });

      if (existing) {
        const updated = await prisma.user.update({
          where: { email: emailLower },
          data: {
            whitelisted: true,
            role: u.role || existing.role,
            plan: u.plan || existing.plan,
            tokens_limit: PLAN_TOKENS[u.plan || existing.plan] || existing.tokens_limit,
            display_name: u.display_name || existing.display_name,
          },
        });
        results.push({
          email: updated.email,
          status: 'updated',
          gid: updated.gid,
          role: updated.role,
          plan: updated.plan,
        });
      } else {
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const password_hash = await bcrypt.hash(tempPassword, 12);
        const userGid = u.gid || generateGid();

        const created = await prisma.user.create({
          data: {
            email: emailLower,
            password_hash,
            display_name: u.display_name || u.email.split('@')[0],
            gid: userGid,
            role: u.role || 'user',
            plan: u.plan || 'enterprise',
            whitelisted: true,
            tokens_limit: PLAN_TOKENS[u.plan || 'enterprise'] || 10000000,
          },
        });
        results.push({
          email: created.email,
          status: 'created',
          gid: created.gid,
          role: created.role,
          plan: created.plan,
          temp_password: tempPassword,
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('Batch provision error:', err);
    res.status(500).json({ error: 'Batch provisioning failed', detail: err.message });
  }
});

// ─── GET /admin/users ─────────────────────────────────────
// List all whitelisted users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { whitelisted: true },
      select: {
        id: true,
        email: true,
        display_name: true,
        gid: true,
        role: true,
        plan: true,
        whitelisted: true,
        tokens_used: true,
        tokens_limit: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ─── Helper: generate 12-digit GID ───────────────────────
function generateGid() {
  const prefix = Math.floor(300000000000 + Math.random() * 200000000000);
  return prefix.toString();
}

module.exports = router;
