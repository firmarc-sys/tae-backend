import crypto from "node:crypto";

// Square Cash App Pay adapter. Does not grant entitlements or create GIDs.
// The caller must persist and reconcile the verified transaction through UAE.
export function squareConfig(env = process.env) {
  const sandbox = env.SQUARE_ENVIRONMENT === "sandbox";
  return {
    environment: sandbox ? "sandbox" : "production",
    baseUrl: sandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com",
    accessToken: env.SQUARE_ACCESS_TOKEN || "",
    applicationId: env.SQUARE_APPLICATION_ID || "",
    locationId: env.SQUARE_LOCATION_ID || "",
    webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY || "",
    webhookNotificationUrl: env.SQUARE_WEBHOOK_NOTIFICATION_URL || "",
    betaPriceCents: Number(env.JAHORIN_BETA_PRICE_CENTS || 0),
  };
}

export function assertSquareBetaConfigured(config) {
  if (!config.accessToken || !config.applicationId || !config.locationId ||
      !Number.isSafeInteger(config.betaPriceCents) || config.betaPriceCents < 1) {
    throw Object.assign(new Error("Square beta checkout is not configured"), { code: "SQUARE_BETA_NOT_CONFIGURED", status: 503 });
  }
}

export function verifySquareWebhook({ rawBody, signature, notificationUrl, signatureKey }) {
  if (!signature || !notificationUrl || !signatureKey || !rawBody) return false;
  const expected = crypto.createHmac("sha256", signatureKey)
    .update(notificationUrl + (Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody)))
    .digest();
  let received;
  try { received = Buffer.from(signature, "base64"); } catch { return false; }
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function squareBetaPaymentRequest({ sourceId, gid, purchaseId, config }) {
  assertSquareBetaConfigured(config);
  if (typeof sourceId !== "string" || !sourceId.trim() || sourceId.length > 4096) throw new TypeError("Valid Cash App payment token required");
  if (typeof gid !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(gid)) throw new TypeError("Authenticated GID required");
  if (typeof purchaseId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(purchaseId)) throw new TypeError("Server-issued purchase ID required");
  // Stable idempotency key is bound to the server-issued purchase, not the buyer's token.
  const idempotencyKey = crypto.createHash("sha256").update("jahorin-beta-square-v1:" + purchaseId).digest("hex").slice(0, 45);
  return {
    idempotency_key: idempotencyKey,
    source_id: sourceId,
    location_id: config.locationId,
    amount_money: { amount: config.betaPriceCents, currency: "USD" },
    reference_id: purchaseId,
    note: "Jahorin one-time beta access",
    autocomplete: true,
  };
}

export async function createSquareBetaPayment({ sourceId, gid, purchaseId, config = squareConfig(), fetchImpl = fetch }) {
  const body = squareBetaPaymentRequest({ sourceId, gid, purchaseId, config });
  const response = await fetchImpl(config.baseUrl + "/v2/payments", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + config.accessToken,
      "Square-Version": "2026-09-16",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.payment) {
    const err = new Error("Square payment processing failed");
    err.status = 502;
    err.code = "SQUARE_PAYMENT_FAILED";
    throw err;
  }
  const payment = result.payment;
  if (payment.amount_money?.amount !== config.betaPriceCents ||
      payment.amount_money?.currency !== "USD" ||
      payment.location_id !== config.locationId ||
      payment.reference_id !== purchaseId) {
    throw Object.assign(new Error("Square payment response mismatch"), { code: "SQUARE_PAYMENT_MISMATCH", status: 502 });
  }
  return {
    provider: "square",
    paymentId: payment.id,
    status: payment.status,
    purchaseId,
    gid,
    amountCents: payment.amount_money.amount,
    currency: "USD",
    // Only completed payments may be reconciled to a beta entitlement.
    eligibleForReconciliation: payment.status === "COMPLETED",
  };
}
