const TRANSITIONS = Object.freeze({
  queued: new Set(["running", "cancelled"]),
  running: new Set(["waiting_approval", "succeeded", "failed", "cancel_requested"]),
  waiting_approval: new Set(["queued", "cancelled"]),
  cancel_requested: new Set(["cancelled", "failed"]),
  succeeded: new Set(),
  failed: new Set(["queued"]),
  cancelled: new Set(),
});

export function canTransitionTask(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function transitionTask(task, nextStatus, { expectedVersion, now = new Date().toISOString() } = {}) {
  if (!task || typeof task.id !== "string" || !task.id || typeof task.tenantId !== "string" || !task.tenantId) {
    throw Object.assign(new Error("INVALID_TASK_CONTEXT"), { code: "INVALID_TASK_CONTEXT" });
  }
  if (!Number.isSafeInteger(task.version) || task.version < 0 || expectedVersion !== task.version) {
    throw Object.assign(new Error("TASK_VERSION_CONFLICT"), { code: "TASK_VERSION_CONFLICT" });
  }
  if (!canTransitionTask(task.status, nextStatus)) {
    throw Object.assign(new Error("INVALID_TASK_TRANSITION"), { code: "INVALID_TASK_TRANSITION" });
  }
  return { ...task, status: nextStatus, version: task.version + 1, updatedAt: now };
}

export function assertIdempotencyKey(key) {
  if (typeof key !== "string" || key.length < 16 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw Object.assign(new Error("INVALID_IDEMPOTENCY_KEY"), { code: "INVALID_IDEMPOTENCY_KEY" });
  }
  return key;
}