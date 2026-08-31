import crypto from 'node:crypto';

export const RETROGRADE_VERSION = '2026-08-31.1';
export const RGC_SYMBOL = 'RGC';
export const USD_TO_RGC = 50;
export const STANDARD_TOKEN_UNITS_PER_RGC = 2;

export const RETROGRADE_ALLOWANCES = Object.freeze({
  free: 250,
  trial: 250,
  personal: 1000,
  beta: 1000,
  pro: 2500,
  alpha: 2500,
  business: 2500,
  enterprise: 2500,
  owner: 'unlimited',
});

export const RETROGRADE_METERED_ROUTES = Object.freeze(new Set([
  '/api/tae',
  '/api/runtime',
  '/api/syncori',
  '/api/voice/token',
]));

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function publicRetrogradeTier(value) {
  const tier = String(value || '').trim().toLowerCase();
  if (tier === 'owner') return 'owner';
  if (tier === 'personal' || tier === 'beta') return 'personal';
  if (tier === 'pro' || tier === 'alpha') return 'pro';
  if (tier === 'business') return 'business';
  if (tier === 'enterprise') return 'enterprise';
  return 'free';
}

export function allowanceForTier(value) {
  const raw = RETROGRADE_ALLOWANCES[String(value || '').trim().toLowerCase()] ?? RETROGRADE_ALLOWANCES[publicRetrogradeTier(value)] ?? 250;
  return raw === 'unlimited' ? 'unlimited' : Math.max(0, Math.floor(finite(raw)));
}

export function retrogradePeriod(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function usdToRgc(usd) {
  return Math.max(0, Math.floor(finite(usd) * USD_TO_RGC));
}

function textFromPayload(payload) {
  const root = asObject(payload);
  const nested = asObject(root.payload);
  return [root.prompt, root.intent, root.instruction, root.goal, nested.goal, nested.intention, nested.instruction, nested.action]
    .filter((value) => typeof value === 'string')
    .join('\n');
}

function navigationOnly(text) {
  const user = text.match(/(?:^|\n)USER:\s*([^\n]+)/i)?.[1]?.trim() || text.trim();
  return /^\s*(open|enter|launch|show)\s+(interweb|augment|code|scribe|optics|novalife|syncori|stare|gid|my gid|elec|eden)\b/i.test(user);
}

function quote(cost, className, capability, operation) {
  const costRgc = Math.max(0, Math.min(750, Math.ceil(finite(cost))));
  return {
    version: RETROGRADE_VERSION,
    symbol: RGC_SYMBOL,
    cost_rgc: costRgc,
    standard_token_units: costRgc * STANDARD_TOKEN_UNITS_PER_RGC,
    class: className,
    capability,
    operation,
  };
}

export function quoteRetrograde(pathname, payload = {}) {
  const root = asObject(payload);
  const nested = asObject(root.payload);
  const text = textFromPayload(root);
  const capability = String(root.capability || root.machine || nested.capability || 'jahorin').toLowerCase();
  const operation = String(root.operation || root.mode || nested.action || 'respond').toLowerCase();

  if (navigationOnly(text)) return quote(0, 'navigation', capability, operation);
  if (pathname === '/api/voice/token') return quote(5, 'low', 'thoth', 'live-voice-session');
  if (pathname === '/api/syncori') return quote(20, 'medium', 'syncori', operation);

  if (pathname === '/api/runtime') {
    if (/deploy|production release|ship/.test(operation) || /\bdeploy\b/i.test(text)) return quote(100, 'high', capability, 'deploy');
    if (capability === 'code' || /\b(code|software|debug|repository|repo)\b/i.test(text)) return quote(operation === 'execute' ? 15 : 25, 'medium', 'code', operation);
    if (capability === 'optics' || /\b(analy[sz]e|vision|camera)\b/i.test(text)) return quote(18, 'medium', 'optics', operation);
    if (capability === 'augment') return quote(/image|visual|generate/.test(operation) ? 30 : 12, 'medium', 'augment', operation);
    if (capability === 'interweb') return quote(/deep/.test(operation) ? 45 : 8, /deep/.test(operation) ? 'medium' : 'low', 'interweb', operation);
    if (capability === 'scribe' || capability === 'thoth') return quote(12, 'medium', 'scribe', operation);
    return quote(10, 'low', capability, operation);
  }

  if (/deep\s*search|deep research|cross[- ]reference|verify sources/i.test(text) || String(root.mode || '').toLowerCase() === 'deepsearch') return quote(45, 'medium', 'interweb', 'deep-research');
  if (/\b(video|veo|film|animate)\b/i.test(text)) return quote(150, 'high', 'augment', 'video');
  if (/\b(image|illustration|render|visualize|photo)\b/i.test(text)) return quote(30, 'medium', 'augment', 'image');
  if (/\b(code|software|debug|website|web app|program)\b/i.test(text)) return quote(25, 'medium', 'code', 'generate');
  if (/\b(document|proposal|report|write|rewrite|summarize)\b/i.test(text)) return quote(12, 'medium', 'scribe', 'write');
  if (/\b(search|research|find|look up|compare sources)\b/i.test(text)) return quote(8, 'low', 'interweb', 'search');
  if (/\b(audio|music|beat|sound|record|transcrib)\b/i.test(text)) return quote(20, 'medium', 'syncori', 'audio');
  if (/\b(automation|automate|workflow)\b/i.test(text)) return quote(30, 'medium', 'tae', 'automation');
  return quote(4, 'low', capability, operation);
}

export async function ensureRetrogradeSchema(pool) {
  await pool.query(`create table if not exists public.retrograde_accounts (
    gid text primary key,
    period text not null,
    balance_rgc bigint not null default 0,
    monthly_allowance_rgc bigint not null default 0,
    purchased_rgc bigint not null default 0,
    granted_rgc bigint not null default 0,
    spent_rgc bigint not null default 0,
    refunded_rgc bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await pool.query(`create table if not exists public.retrograde_ledger (
    entry_id text primary key,
    gid text not null,
    kind text not null,
    amount_rgc bigint not null,
    balance_after_rgc bigint not null,
    period text not null,
    request_id text,
    route text,
    capability text,
    operation text,
    source text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`);
  await pool.query(`create index if not exists retrograde_ledger_gid_created_idx on public.retrograde_ledger(gid,created_at desc)`);
  await pool.query(`create index if not exists retrograde_ledger_request_idx on public.retrograde_ledger(gid,request_id) where request_id is not null`);
}

async function ensureAccount(client, gid, tier, period = retrogradePeriod()) {
  const allowance = allowanceForTier(tier);
  if (allowance === 'unlimited') return { gid, tier: 'owner', period, balance_rgc: 'unlimited', monthly_allowance_rgc: 'unlimited' };

  await client.query(`insert into public.retrograde_accounts(gid,period,balance_rgc,monthly_allowance_rgc,granted_rgc)
    values($1,$2,$3,$3,$3) on conflict(gid) do nothing`, [gid, period, allowance]);
  let account = (await client.query(`select * from public.retrograde_accounts where gid=$1 for update`, [gid])).rows[0];
  if (!account) throw new Error('Retrograde account could not be resolved');

  const currentAllowance = Number(account.monthly_allowance_rgc || 0);
  let grant = 0;
  let source = null;
  if (String(account.period) !== period) {
    grant = allowance;
    source = 'monthly-allowance';
  } else if (allowance > currentAllowance) {
    grant = allowance - currentAllowance;
    source = 'tier-upgrade-allowance';
  }

  if (grant > 0) {
    const nextBalance = Number(account.balance_rgc || 0) + grant;
    await client.query(`update public.retrograde_accounts set period=$2,balance_rgc=$3,monthly_allowance_rgc=$4,granted_rgc=granted_rgc+$5,updated_at=now() where gid=$1`, [gid, period, nextBalance, allowance, grant]);
    const entryId = `rgc:grant:${gid}:${period}:${publicRetrogradeTier(tier)}:${RETROGRADE_VERSION}`;
    await client.query(`insert into public.retrograde_ledger(entry_id,gid,kind,amount_rgc,balance_after_rgc,period,source,metadata)
      values($1,$2,'grant',$3,$4,$5,$6,$7::jsonb) on conflict(entry_id) do nothing`, [entryId, gid, grant, nextBalance, period, source, JSON.stringify({ tier: publicRetrogradeTier(tier), allowance_rgc: allowance })]);
    account = (await client.query(`select * from public.retrograde_accounts where gid=$1`, [gid])).rows[0];
  } else if (String(account.period) !== period || currentAllowance !== allowance) {
    await client.query(`update public.retrograde_accounts set period=$2,monthly_allowance_rgc=$3,updated_at=now() where gid=$1`, [gid, period, allowance]);
    account.period = period;
    account.monthly_allowance_rgc = allowance;
  }

  return account;
}

export async function retrogradeSnapshot(pool, gid, tier) {
  await ensureRetrogradeSchema(pool);
  if (allowanceForTier(tier) === 'unlimited') return { gid, tier: 'owner', period: retrogradePeriod(), balance_rgc: 'unlimited', monthly_allowance_rgc: 'unlimited', purchased_rgc: 0, spent_rgc: 0, refunded_rgc: 0 };
  const client = await pool.connect();
  try {
    await client.query('begin');
    const account = await ensureAccount(client, gid, tier);
    await client.query('commit');
    return account;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveRetrograde(pool, { gid, tier, quote, requestId, route }) {
  await ensureRetrogradeSchema(pool);
  if (allowanceForTier(tier) === 'unlimited' || quote.cost_rgc <= 0) return { allowed: true, unlimited: allowanceForTier(tier) === 'unlimited', duplicate: false, balance_rgc: allowanceForTier(tier) === 'unlimited' ? 'unlimited' : (await retrogradeSnapshot(pool, gid, tier)).balance_rgc };
  const client = await pool.connect();
  const entryId = `rgc:debit:${gid}:${requestId}`;
  try {
    await client.query('begin');
    const existing = (await client.query(`select * from public.retrograde_ledger where entry_id=$1`, [entryId])).rows[0];
    if (existing) {
      await client.query('rollback');
      return { allowed: false, duplicate: true, balance_rgc: Number(existing.balance_after_rgc), entry_id: entryId };
    }
    const account = await ensureAccount(client, gid, tier);
    const balance = Number(account.balance_rgc || 0);
    if (quote.cost_rgc > balance) {
      await client.query('rollback');
      return { allowed: false, duplicate: false, insufficient: true, balance_rgc: balance, required_rgc: quote.cost_rgc };
    }
    const next = balance - quote.cost_rgc;
    await client.query(`update public.retrograde_accounts set balance_rgc=$2,spent_rgc=spent_rgc+$3,updated_at=now() where gid=$1`, [gid, next, quote.cost_rgc]);
    await client.query(`insert into public.retrograde_ledger(entry_id,gid,kind,amount_rgc,balance_after_rgc,period,request_id,route,capability,operation,source,metadata)
      values($1,$2,'debit',$3,$4,$5,$6,$7,$8,$9,'intelligence-execution',$10::jsonb)`, [entryId, gid, -quote.cost_rgc, next, retrogradePeriod(), requestId, route, quote.capability, quote.operation, JSON.stringify({ class: quote.class, standard_token_units: quote.standard_token_units })]);
    await client.query('commit');
    return { allowed: true, duplicate: false, balance_rgc: next, entry_id: entryId };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function refundRetrograde(pool, { gid, tier, debitEntryId, requestId, quote, route, reason }) {
  if (!debitEntryId || allowanceForTier(tier) === 'unlimited' || quote.cost_rgc <= 0) return null;
  await ensureRetrogradeSchema(pool);
  const client = await pool.connect();
  const entryId = `rgc:refund:${debitEntryId}`;
  try {
    await client.query('begin');
    const prior = (await client.query(`select entry_id from public.retrograde_ledger where entry_id=$1`, [entryId])).rows[0];
    if (prior) { await client.query('rollback'); return null; }
    const account = await ensureAccount(client, gid, tier);
    const next = Number(account.balance_rgc || 0) + quote.cost_rgc;
    await client.query(`update public.retrograde_accounts set balance_rgc=$2,refunded_rgc=refunded_rgc+$3,spent_rgc=greatest(0,spent_rgc-$3),updated_at=now() where gid=$1`, [gid, next, quote.cost_rgc]);
    await client.query(`insert into public.retrograde_ledger(entry_id,gid,kind,amount_rgc,balance_after_rgc,period,request_id,route,capability,operation,source,metadata)
      values($1,$2,'refund',$3,$4,$5,$6,$7,$8,$9,'execution-refund',$10::jsonb)`, [entryId, gid, quote.cost_rgc, next, retrogradePeriod(), requestId, route, quote.capability, quote.operation, JSON.stringify({ reason: String(reason || 'execution_failed') })]);
    await client.query('commit');
    return { entry_id: entryId, balance_rgc: next };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function creditRetrogradePurchase(pool, { gid, tier, rgc, sourceId, usdCents = null, metadata = {} }) {
  const amount = Math.max(1, Math.floor(finite(rgc)));
  await ensureRetrogradeSchema(pool);
  const client = await pool.connect();
  const entryId = `rgc:purchase:${String(sourceId || crypto.randomUUID())}`;
  try {
    await client.query('begin');
    const existing = (await client.query(`select * from public.retrograde_ledger where entry_id=$1`, [entryId])).rows[0];
    if (existing) { await client.query('rollback'); return { credited: false, duplicate: true, balance_rgc: Number(existing.balance_after_rgc), entry_id: entryId }; }
    const account = await ensureAccount(client, gid, tier);
    if (account.balance_rgc === 'unlimited') { await client.query('rollback'); return { credited: false, owner: true, balance_rgc: 'unlimited' }; }
    const next = Number(account.balance_rgc || 0) + amount;
    await client.query(`update public.retrograde_accounts set balance_rgc=$2,purchased_rgc=purchased_rgc+$3,updated_at=now() where gid=$1`, [gid, next, amount]);
    await client.query(`insert into public.retrograde_ledger(entry_id,gid,kind,amount_rgc,balance_after_rgc,period,source,metadata)
      values($1,$2,'purchase',$3,$4,$5,'stripe-purchase',$6::jsonb)`, [entryId, gid, amount, next, retrogradePeriod(), JSON.stringify({ usd_cents: usdCents, ...metadata })]);
    await client.query('commit');
    return { credited: true, duplicate: false, balance_rgc: next, entry_id: entryId };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function retrogradeHistory(pool, gid, limit = 50) {
  await ensureRetrogradeSchema(pool);
  const safeLimit = Math.max(1, Math.min(200, Math.floor(finite(limit, 50))));
  const result = await pool.query(`select entry_id,kind,amount_rgc,balance_after_rgc,period,request_id,route,capability,operation,source,metadata,created_at from public.retrograde_ledger where gid=$1 order by created_at desc limit $2`, [gid, safeLimit]);
  return result.rows;
}
