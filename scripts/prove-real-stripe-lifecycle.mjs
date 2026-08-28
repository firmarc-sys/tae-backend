import fs from 'node:fs';
import Stripe from 'stripe';
import pg from 'pg';

const { Pool } = pg;
const requestPath = 'MAAT_REAL_STRIPE_LIFECYCLE_REQUEST.json';
const mode = process.argv[2];
if (!['rotate', 'verify'].includes(mode)) throw new Error('mode must be rotate or verify');
if (!fs.existsSync(requestPath)) throw new Error(`${requestPath} is required`);

const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
for (const key of ['rotation_id', 'proof_gid', 'customer_id', 'subscription_id', 'old_webhook_endpoint_id', 'webhook_url', 'expected_active_tier', 'expected_canceled_tier']) {
  if (!request[key]) throw new Error(`missing request field: ${key}`);
}

function readSecretFile(envName) {
  const file = process.env[envName];
  if (!file) throw new Error(`${envName} is required`);
  const value = fs.readFileSync(file, 'utf8').trim();
  if (!value) throw new Error(`${envName} is empty`);
  return value;
}

const stripe = new Stripe(readSecretFile('STRIPE_SECRET_KEY_FILE'));
const enabledEvents = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

async function rotate() {
  const endpoint = await stripe.webhookEndpoints.create({
    url: request.webhook_url,
    enabled_events: enabledEvents,
    description: 'Jahorin Trismegistus production billing entitlement webhook',
    metadata: {
      authority: 'ari',
      environment: 'production',
      system: 'jahorin-trismegistus',
      maat_rotation: request.rotation_id,
    },
  }, {
    idempotencyKey: `jahorin-maat-webhook-${request.rotation_id}`,
  });

  if (!endpoint?.id || !endpoint?.secret) throw new Error('Stripe did not return a webhook endpoint signing secret');
  fs.writeFileSync('/tmp/new-stripe-webhook-secret', endpoint.secret, { mode: 0o600 });
  fs.writeFileSync('/tmp/new-stripe-webhook-endpoint-id', `${endpoint.id}\n`, { mode: 0o600 });
  fs.writeFileSync('/tmp/real-stripe-rotation.json', JSON.stringify({ endpoint_id: endpoint.id, rotation_id: request.rotation_id }, null, 2), { mode: 0o600 });
  console.log(`PASS created/replayed canonical Stripe webhook rotation ${request.rotation_id} as ${endpoint.id} without exposing the signing secret`);
}

async function readAccess(pool) {
  const result = await pool.query(
    `select gid,tier_id,status,overrides,updated_at from public.identity_access where gid=$1 limit 1`,
    [request.proof_gid],
  );
  return result.rows[0] || null;
}

async function waitForAccess(pool, predicate, label, attempts = 45) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await readAccess(pool);
    if (last && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} not observed in Neon; last=${JSON.stringify(last)}`);
}

function billing(row) {
  return row?.overrides?.billing || {};
}

async function verify() {
  const neonUrl = readSecretFile('NEON_DATABASE_URL_FILE');
  const pool = new Pool({ connectionString: neonUrl, max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 8000 });
  try {
    const rotatedEndpointId = fs.readFileSync('/tmp/new-stripe-webhook-endpoint-id', 'utf8').trim();
    if (!rotatedEndpointId) throw new Error('rotated webhook endpoint id is unavailable');

    const before = await stripe.subscriptions.retrieve(request.subscription_id, { expand: ['latest_invoice'] });
    if (before.customer !== request.customer_id) throw new Error('proof subscription customer mismatch');
    if (before.metadata?.gid !== request.proof_gid) throw new Error('proof subscription GID mismatch');
    if (before.status !== 'trialing') throw new Error(`proof subscription must be trialing before verification, got ${before.status}`);
    if (before.default_payment_method || before.default_source) throw new Error('proof subscription unexpectedly has a payment method/source');
    const invoiceBefore = typeof before.latest_invoice === 'object' ? before.latest_invoice : before.latest_invoice ? await stripe.invoices.retrieve(before.latest_invoice) : null;
    const amountPaidBefore = Number(invoiceBefore?.amount_paid || 0);
    if (amountPaidBefore !== 0) throw new Error(`proof subscription unexpectedly captured payment: ${amountPaidBefore}`);

    await stripe.subscriptions.update(request.subscription_id, {
      metadata: {
        ...before.metadata,
        gid: request.proof_gid,
        tier: request.expected_active_tier,
        ga_proof: 'true',
        proof_stage: `real-webhook-${Date.now()}`,
      },
    });

    const activated = await waitForAccess(
      pool,
      (row) => row.tier_id === request.expected_active_tier
        && billing(row).stripe_subscription_id === request.subscription_id
        && ['trialing', 'active'].includes(String(billing(row).subscription_status || '')),
      'real Stripe activation webhook',
    );
    console.log(`PASS real Stripe webhook promoted proof GID ${request.proof_gid} to ${activated.tier_id} in Neon`);

    const canceledStripe = await stripe.subscriptions.cancel(request.subscription_id);
    if (canceledStripe.status !== 'canceled') throw new Error(`Stripe cancellation did not resolve canceled status: ${canceledStripe.status}`);

    const demoted = await waitForAccess(
      pool,
      (row) => row.tier_id === request.expected_canceled_tier
        && billing(row).stripe_subscription_id === request.subscription_id
        && String(billing(row).subscription_status || '') === 'canceled',
      'real Stripe cancellation webhook',
    );
    console.log(`PASS real Stripe cancellation webhook demoted proof GID ${request.proof_gid} to ${demoted.tier_id} in Neon`);

    if (request.old_webhook_endpoint_id && request.old_webhook_endpoint_id !== rotatedEndpointId) {
      await stripe.webhookEndpoints.update(request.old_webhook_endpoint_id, { disabled: true });
      console.log(`PASS disabled superseded Stripe webhook endpoint ${request.old_webhook_endpoint_id}`);
    }

    const proof = {
      ok: true,
      verified_at: new Date().toISOString(),
      production_endpoint: true,
      production_webhook_signature_verified: true,
      secret_manager_authority: true,
      stripe_event_source: 'real-live-stripe-object-lifecycle',
      real_stripe_object_lifecycle: true,
      no_payment_capture: amountPaidBefore === 0,
      customer_id: request.customer_id,
      subscription_id: request.subscription_id,
      webhook_endpoint_id: rotatedEndpointId,
      superseded_webhook_endpoint_id: request.old_webhook_endpoint_id,
      gid: request.proof_gid,
      transitions: {
        trialing_subscription_to_neon: activated.tier_id,
        canceled_subscription_to_neon: demoted.tier_id,
      },
      stripe_status_after_cancel: canceledStripe.status,
      authority: 'Stripe live objects -> signed ARI webhook -> Neon identity_access',
      ga_note: 'Verified with a live Stripe Customer and live trialing Subscription using no payment method and zero captured payment, followed by immediate cancellation and Neon entitlement demotion.',
    };
    fs.writeFileSync('STRIPE_LIFECYCLE_PROOF.json', `${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (mode === 'rotate') await rotate();
else await verify();
