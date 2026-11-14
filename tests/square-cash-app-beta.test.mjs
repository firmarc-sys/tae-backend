import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { squareConfig, assertSquareBetaConfigured, verifySquareWebhook, squareBetaPaymentRequest, createSquareBetaPayment } from "../square-cash-app-beta.js";

const config = { ...squareConfig({ SQUARE_ENVIRONMENT: "sandbox", SQUARE_ACCESS_TOKEN: "test", SQUARE_APPLICATION_ID: "sandbox-app", SQUARE_LOCATION_ID: "loc", JAHORIN_BETA_PRICE_CENTS: "5150" }) };
test("requires explicit server-side beta price and Square configuration", () => {
  assert.throws(() => assertSquareBetaConfigured(squareConfig({})), /not configured/);
  assertSquareBetaConfigured(config);
  assert.equal(config.baseUrl, "https://connect.squareupsandbox.com");
});
test("creates fixed-price request bound to server-issued purchase ID", () => {
  const args = { sourceId: "cash_token", gid: "gid123", purchaseId: "purchase_123", config };
  const req = squareBetaPaymentRequest(args);
  assert.equal(req.amount_money.amount, 5150);
  assert.equal(req.reference_id, "purchase_123");
  assert.equal(req.idempotency_key, squareBetaPaymentRequest(args).idempotency_key);
  assert.throws(() => squareBetaPaymentRequest({ ...args, purchaseId: "bad" }));
});
test("validates Square webhook over exact notification URL and raw body", () => {
  const rawBody = Buffer.from('{"type":"payment.updated"}');
  const notificationUrl = "https://example.com/webhooks/square";
  const signatureKey = "key";
  const signature = crypto.createHmac("sha256", signatureKey).update(notificationUrl + rawBody.toString()).digest("base64");
  assert.equal(verifySquareWebhook({ rawBody, notificationUrl, signatureKey, signature }), true);
  assert.equal(verifySquareWebhook({ rawBody, notificationUrl: notificationUrl + "/", signatureKey, signature }), false);
  assert.equal(verifySquareWebhook({ rawBody, notificationUrl, signatureKey, signature: "bad" }), false);
});
test("does not mark pending payment reconciliable", async () => {
  const fetchImpl = async (_, options) => {
    const request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ payment: { id: "p1", status: "PENDING", location_id: config.locationId, reference_id: request.reference_id, amount_money: request.amount_money } }) };
  };
  const result = await createSquareBetaPayment({ sourceId: "token", gid: "gid123", purchaseId: "purchase_123", config, fetchImpl });
  assert.equal(result.eligibleForReconciliation, false);
});
test("rejects a payment with mismatched amount", async () => {
  const fetchImpl = async (_, options) => {
    const request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ payment: { id: "p1", status: "COMPLETED", location_id: config.locationId, reference_id: request.reference_id, amount_money: { amount: 1, currency: "USD" } } }) };
  };
  await assert.rejects(createSquareBetaPayment({ sourceId: "token", gid: "gid123", purchaseId: "purchase_123", config, fetchImpl }), /mismatch/);
});
