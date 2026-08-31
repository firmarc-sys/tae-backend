import 'dotenv/config';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import {
  RETROGRADE_METERED_ROUTES,
  RETROGRADE_VERSION,
  RGC_SYMBOL,
  STANDARD_TOKEN_UNITS_PER_RGC,
  USD_TO_RGC,
  allowanceForTier,
  publicRetrogradeTier,
  quoteRetrograde,
  refundRetrograde,
  reserveRetrograde,
  retrogradeHistory,
  retrogradeSnapshot,
} from './retrograde.js';

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.RETROGRADE_GATEWAY_INNER_PORT || 8086);
const OWNER_GID = String(process.env.SIOS_OWNER_GID || '399152573423');
const SESSION_COOKIE = 'ari_session';
const legacyJwtSecret = process.env.JWT_SECRET || '';
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== 'CHANGE-ME-IN-PROD' ? legacyJwtSecret : '');
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const pool = connectionString ? new Pool({ connectionString, max: Math.max(3, Number(process.env.NEON_POOL_MAX || 6)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 }) : null;
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

const child = spawn(process.execPath, ['universal-capability-gateway.js'], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  console.error(`ARI universal capability gateway exited code=${code} signal=${signal || ''}`);
  process.exit(code || 1);
});

function db() {
  if (!pool) throw Object.assign(new Error('Neon Retrograde authority is not configured'), { status: 503, code: 'RGC_AUTHORITY_UNAVAILABLE' });
  return pool;
}

function requestId(req) {
  return String(req.headers['x-request-id'] || crypto.randomUUID());
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [decodeURIComponent(part), ''] : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionGid(req) {
  if (!sessionSecret) return null;
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = token.split('.', 3);
  const expires = Number(expiresRaw);
  if (!gid || !signature || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(`${gid}.${expires}`).digest('hex');
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
}

async function bearerGid(req) {
  const token = bearerToken(req);
  if (!token) return null;
  if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error('Member authentication is not configured'), { status: 503 });
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw Object.assign(new Error('Invalid member authentication'), { status: 401 });
  if (user.user_metadata?.gid) return String(user.user_metadata.gid);
  const result = await db().query(`select gid from public.jahorin_identities where auth_user_id=$1 order by updated_at desc limit 1`, [String(user.id)]);
  return result.rows[0]?.gid ? String(result.rows[0].gid) : null;
}

async function principalGid(req) {
  return sessionGid(req) || await bearerGid(req);
}

async function tierForGid(gid) {
  if (String(gid) === OWNER_GID) return 'owner';
  const result = await db().query(`select tier_id,status from public.identity_access where gid=$1 limit 1`, [gid]);
  const row = result.rows[0];
  if (!row || row.status !== 'active') return 'free';
  return publicRetrogradeTier(row.tier_id);
}

function json(req, res, status, body, extra = {}) {
  const id = body?.request_id || requestId(req);
  const data = Buffer.from(JSON.stringify({ ...body, request_id: id }));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(data.length),
    'cache-control': 'no-store',
    'x-runtime': 'ARI',
    'x-retrograde-authority': 'neon-atomic-v1',
    'x-request-id': id,
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(data);
}

function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('request body too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyHeaders(req, raw = null) {
  const headers = { ...req.headers, host: `127.0.0.1:${innerPort}` };
  if (raw) headers['content-length'] = String(raw.length);
  return headers;
}

function proxyStream(req, res) {
  const upstream = http.request({ hostname: '127.0.0.1', port: innerPort, path: req.url, method: req.method, headers: proxyHeaders(req) }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, 'x-retrograde-authority': 'neon-atomic-v1' });
    upstreamRes.pipe(res);
  });
  upstream.on('error', (error) => json(req, res, 503, { ok: false, code: 'RUNTIME_UNAVAILABLE', error: error.message }));
  req.pipe(upstream);
}

async function proxyMetered(req, res, raw, { gid, tier, quote, reservation, id, pathname }) {
  return new Promise((resolve) => {
    const upstream = http.request({ hostname: '127.0.0.1', port: innerPort, path: req.url, method: req.method, headers: proxyHeaders(req, raw) }, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', async () => {
        let balance = reservation.balance_rgc;
        if ((upstreamRes.statusCode || 500) >= 400 && reservation.entry_id) {
          try {
            const refund = await refundRetrograde(db(), { gid, tier, debitEntryId: reservation.entry_id, requestId: id, quote, route: pathname, reason: `upstream_${upstreamRes.statusCode || 500}` });
            if (refund) balance = refund.balance_rgc;
          } catch (error) {
            console.error('[ARI][RGC] refund failed after upstream rejection', error);
          }
        }
        const responseBody = Buffer.concat(chunks);
        const headers = { ...upstreamRes.headers };
        delete headers['content-length'];
        headers['content-length'] = String(responseBody.length);
        headers['x-retrograde-authority'] = 'neon-atomic-v1';
        headers['x-rgc-cost'] = String(quote.cost_rgc);
        headers['x-rgc-balance'] = String(balance);
        headers['x-rgc-symbol'] = RGC_SYMBOL;
        res.writeHead(upstreamRes.statusCode || 502, headers);
        res.end(responseBody);
        resolve();
      });
    });
    upstream.on('error', async (error) => {
      let balance = reservation.balance_rgc;
      if (reservation.entry_id) {
        try {
          const refund = await refundRetrograde(db(), { gid, tier, debitEntryId: reservation.entry_id, requestId: id, quote, route: pathname, reason: 'network_failure' });
          if (refund) balance = refund.balance_rgc;
        } catch (refundError) {
          console.error('[ARI][RGC] refund failed after network failure', refundError);
        }
      }
      json(req, res, 503, { ok: false, code: 'RUNTIME_UNAVAILABLE', error: error.message, retrograde: { symbol: RGC_SYMBOL, balance_rgc: balance } }, { 'x-rgc-balance': String(balance) });
      resolve();
    });
    upstream.end(raw);
  });
}

async function handleMetered(req, res, pathname) {
  const raw = await readBody(req);
  let payload = {};
  if (raw.length && String(req.headers['content-type'] || '').includes('json')) {
    try { payload = JSON.parse(raw.toString('utf8')); }
    catch { return json(req, res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body' }); }
  }
  const gid = await principalGid(req);
  if (!gid) return json(req, res, 401, { ok: false, code: 'AUTH_REQUIRED', error: 'Authenticated GID required' });
  const tier = await tierForGid(gid);
  const id = String(payload?.request_id || requestId(req));
  const quote = quoteRetrograde(pathname, payload);
  const reservation = await reserveRetrograde(db(), { gid, tier, quote, requestId: id, route: pathname });

  if (reservation.duplicate) {
    return json(req, res, 409, {
      ok: false,
      code: 'RGC_REQUEST_REPLAY',
      error: 'This intelligence request ID has already been consumed.',
      retrograde: { symbol: RGC_SYMBOL, balance_rgc: reservation.balance_rgc },
    }, { 'x-rgc-balance': String(reservation.balance_rgc) });
  }
  if (!reservation.allowed) {
    return json(req, res, 402, {
      ok: false,
      code: 'RGC_INSUFFICIENT',
      error: `Retrograde balance exhausted. ${reservation.required_rgc} ${RGC_SYMBOL} required; ${reservation.balance_rgc} remaining.`,
      required_rgc: reservation.required_rgc,
      remaining_rgc: reservation.balance_rgc,
      quote,
    }, { 'x-rgc-cost': String(quote.cost_rgc), 'x-rgc-balance': String(reservation.balance_rgc), 'x-rgc-symbol': RGC_SYMBOL });
  }
  return proxyMetered(req, res, raw, { gid, tier, quote, reservation, id, pathname });
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  try {
    if (req.method === 'GET' && pathname === '/api/retrograde/balance') {
      const gid = await principalGid(req);
      if (!gid) return json(req, res, 401, { ok: false, code: 'AUTH_REQUIRED', error: 'Authenticated GID required' });
      const tier = await tierForGid(gid);
      const state = await retrogradeSnapshot(db(), gid, tier);
      return json(req, res, 200, {
        ok: true,
        version: RETROGRADE_VERSION,
        name: 'Retrograde Coin',
        symbol: RGC_SYMBOL,
        gid,
        tier,
        period: state.period,
        balance_rgc: state.balance_rgc,
        monthly_allowance_rgc: allowanceForTier(tier),
        purchased_rgc: Number(state.purchased_rgc || 0),
        spent_rgc: Number(state.spent_rgc || 0),
        refunded_rgc: Number(state.refunded_rgc || 0),
        standard_token_units_per_rgc: STANDARD_TOKEN_UNITS_PER_RGC,
        usd_to_rgc: USD_TO_RGC,
        ledger: 'neon.atomic.append_only',
      });
    }

    if (req.method === 'GET' && pathname === '/api/retrograde/history') {
      const gid = await principalGid(req);
      if (!gid) return json(req, res, 401, { ok: false, code: 'AUTH_REQUIRED', error: 'Authenticated GID required' });
      const entries = await retrogradeHistory(db(), gid, url.searchParams.get('limit') || 50);
      return json(req, res, 200, { ok: true, version: RETROGRADE_VERSION, symbol: RGC_SYMBOL, gid, entries });
    }

    if (req.method === 'POST' && pathname === '/api/retrograde/quote') {
      const raw = await readBody(req, 512 * 1024);
      let body = {};
      try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; }
      catch { return json(req, res, 400, { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body' }); }
      const route = RETROGRADE_METERED_ROUTES.has(String(body.route || '')) ? String(body.route) : '/api/tae';
      return json(req, res, 200, { ok: true, version: RETROGRADE_VERSION, quote: quoteRetrograde(route, body.payload || {}) });
    }

    if (req.method === 'POST' && RETROGRADE_METERED_ROUTES.has(pathname)) return await handleMetered(req, res, pathname);
    return proxyStream(req, res);
  } catch (error) {
    console.error('[ARI][RGC] gateway failure', error);
    return json(req, res, Number(error?.status || 503), { ok: false, code: error?.code || 'RGC_AUTHORITY_FAILURE', error: error?.message || 'Retrograde authority failure' });
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, { timeout = 30000, interval = 120 } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', (error) => { socket.destroy(); if (Date.now() >= deadline) reject(error); else setTimeout(attempt, interval); });
    };
    attempt();
  });
}

waitForPort(innerPort)
  .then(() => gateway.listen(outerPort, '0.0.0.0', () => console.log(`ARI Retrograde authority ${outerPort}; universal inner ${innerPort}; version=${RETROGRADE_VERSION}`)))
  .catch((error) => {
    console.error(`ARI universal capability child failed readiness: ${error.message}`);
    if (!child.killed) child.kill('SIGTERM');
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`Retrograde gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill('SIGTERM');
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
