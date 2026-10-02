import test from "node:test";
import assert from "node:assert/strict";
import { assertIdempotencyKey, canTransitionTask, transitionTask } from "../packages/workflow/src/task-state.js";

test("task lifecycle allows only declared transitions", () => {
  assert.equal(canTransitionTask("queued", "running"), true);
  assert.equal(canTransitionTask("queued", "succeeded"), false);
  assert.equal(canTransitionTask("succeeded", "running"), false);
});
test("task transition increments optimistic version", () => {
  const task = { id: "task-1", tenantId: "tenant-1", status: "queued", version: 0 };
  const next = transitionTask(task, "running", { expectedVersion: 0, now: "2026-10-02T12:00:00.000Z" });
  assert.equal(next.status, "running");
  assert.equal(next.version, 1);
  assert.equal(task.status, "queued");
});
test("task transition rejects stale versions and invalid transitions", () => {
  const task = { id: "task-1", tenantId: "tenant-1", status: "queued", version: 2 };
  assert.throws(() => transitionTask(task, "running", { expectedVersion: 1 }), { code: "TASK_VERSION_CONFLICT" });
  assert.throws(() => transitionTask(task, "succeeded", { expectedVersion: 2 }), { code: "INVALID_TASK_TRANSITION" });
});
test("idempotency keys require bounded safe values", () => {
  assert.equal(assertIdempotencyKey("request-123456789"), "request-123456789");
  assert.throws(() => assertIdempotencyKey("short"), { code: "INVALID_IDEMPOTENCY_KEY" });
  assert.throws(() => assertIdempotencyKey("contains spaces and secrets"), { code: "INVALID_IDEMPOTENCY_KEY" });
});