import test from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "../packages/policy/src/authorization.js";
import { assertTenantMatch } from "../packages/policy/src/tenancy.js";
import { redactSecrets } from "../packages/security/src/secret-redaction.js";

test("authorization denies unauthenticated subjects", () => {
  assert.deepEqual(requireRole({ authenticated: false, actorId: "u1", tenantId: "t1", roles: ["admin"] }, ["admin"]), { allowed: false, reason: "unauthenticated" });
});
test("authorization denies missing identity context and missing roles", () => {
  assert.equal(requireRole({ authenticated: true, actorId: "", tenantId: "t1", roles: ["admin"] }, ["admin"]).allowed, false);
  assert.equal(requireRole({ authenticated: true, actorId: "u1", tenantId: "t1", roles: ["member"] }, ["admin"]).allowed, false);
});
test("authorization allows a verified subject with the required role", () => {
  assert.equal(requireRole({ authenticated: true, actorId: "u1", tenantId: "t1", roles: ["admin"] }, ["admin"]).allowed, true);
});
test("tenant guard rejects cross-tenant records and missing tenant", () => {
  assert.throws(() => assertTenantMatch("tenant-a", { tenantId: "tenant-b" }), { code: "TENANT_ISOLATION_VIOLATION" });
  assert.throws(() => assertTenantMatch("", { tenantId: "" }), { code: "TENANT_ISOLATION_VIOLATION" });
});
test("tenant guard returns matching records", () => {
  const record = { tenantId: "tenant-a", id: "record-1" };
  assert.equal(assertTenantMatch("tenant-a", record), record);
});
test("secret redaction removes bearer tokens and common secret assignments", () => {
  const output = redactSecrets("Authorization: Bearer abc.def_123 api_key=supersecret password: hunter2");
  assert.doesNotMatch(output, /abc[.]def_123|supersecret|hunter2/);
  assert.match(output, /\[REDACTED\]/);
});
test("redaction tolerates non-string input", () => {
  assert.equal(redactSecrets(null), "");
});