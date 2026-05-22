/**
 * Seed / Whitelist Provisioning Script
 * 
 * Provisions the initial whitelisted users with email authentication
 * and full user tier access (enterprise plan).
 * 
 * Owner: jorge.delgado@firmcollectiveos.tech (GID: 399152572523)
 * 
 * Run: node src/seed.js
 * Requires: DATABASE_URL env var pointing to PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ─── Whitelist Data ───────────────────────────────────────
const OWNER = {
  email: 'jorge.delgado@firmcollectiveos.tech',
  display_name: 'Jorge Delgado',
  gid: '399152572523',
  role: 'owner',
  plan: 'enterprise',
};

const WHITELIST = [
  {
    email: 'jburden0303@gmail.com',
    display_name: 'JBURD-ADMIN',
    gid: '401938271654',
    role: 'admin',
    plan: 'enterprise',
  },
  {
    email: 'alexandermnk@icloud.com',
    display_name: 'AMNK-ADMIN',
    gid: '402715839201',
    role: 'admin',
    plan: 'enterprise',
  },
  {
    email: 'jalil2cold@icloud.com',
    display_name: 'HSRNJ-ADMIN',
    gid: '403482916738',
    role: 'admin',
    plan: 'enterprise',
  },
  {
    email: 'halil.srnja@firmcollectiveos.tech',
    display_name: 'Halil Srnja',
    gid: '400232152323',
    role: 'admin',
    plan: 'enterprise',
  },
  {
    email: 'orlandomontaque@gmail.com',
    display_name: 'Orlando Montaque',
    gid: '3891821532',
    role: 'user',
    plan: 'enterprise',
  },
  {
    email: 'rdknockz@gmail.com',
    display_name: 'rdknockz',
    gid: '7891727347',
    role: 'user',
    plan: 'enterprise',
  },
  {
    email: 'isaac.sanders@gmail.com',
    display_name: 'Isaac Sanders',
    gid: '0002147514',
    role: 'user',
    plan: 'enterprise',
  },
];

const PLAN_TOKENS = {
  demo: 5000,
  starter: 50000,
  pro: 500000,
  enterprise: 10000000,
};

async function seed() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   SIOS / TAE — Whitelist Provisioning Seed  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Provision owner first
  const allUsers = [OWNER, ...WHITELIST];

  for (const u of allUsers) {
    const emailLower = u.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });

    if (existing) {
      // Update: grant whitelist + upgrade plan
      const updated = await prisma.user.update({
        where: { email: emailLower },
        data: {
          whitelisted: true,
          role: u.role,
          plan: u.plan,
          tokens_limit: PLAN_TOKENS[u.plan] || 10000000,
          display_name: u.display_name || existing.display_name,
        },
      });
      console.log(`  ✓ UPDATED  ${updated.email}`);
      console.log(`             GID: ${updated.gid} | Role: ${updated.role} | Plan: ${updated.plan}`);
      console.log();
    } else {
      // Create new whitelisted user
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const password_hash = await bcrypt.hash(tempPassword, 12);

      const created = await prisma.user.create({
        data: {
          email: emailLower,
          password_hash,
          display_name: u.display_name,
          gid: u.gid,
          role: u.role,
          plan: u.plan,
          whitelisted: true,
          tokens_limit: PLAN_TOKENS[u.plan] || 10000000,
        },
      });
      console.log(`  ✓ CREATED  ${created.email}`);
      console.log(`             GID: ${created.gid} | Role: ${created.role} | Plan: ${created.plan}`);
      console.log(`             Temp password: ${tempPassword}`);
      console.log();
    }
  }

  console.log('───────────────────────────────────────────────');
  console.log(`  Total provisioned: ${allUsers.length} users`);
  console.log('  All accounts: whitelisted = true, plan = enterprise');
  console.log('  Users must reset password on first login.');
  console.log('───────────────────────────────────────────────\n');
}

seed()
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
