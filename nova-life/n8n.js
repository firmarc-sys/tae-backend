import crypto from 'node:crypto';
import { fail } from './access.js';

const ALLOWED = new Set(['world.maintain', 'beta.automation', 'forge.background']);
const FORBIDDEN = /gid|identity|permission|policy|auth/i;

export function n8nConfigured(env = process.env) {
  return Boolean(String(env.N8N_BASE_URL || '').trim() && String(env.N8N_API_KEY || '').trim());
}

export async function enqueueNovaTask({
  store,
  workflowId,
  gid,
  payload = {},
  execute,
  env = process.env,
}) {
  const workflow = String(workflowId || '').trim();
  if (!ALLOWED.has(workflow) || FORBIDDEN.test(workflow)) {
    throw fail(403, 'n8n cannot author GID, policy, or permissions', 'N8N_NOT_AUTHORITATIVE');
  }
  const task = {
    id: crypto.randomUUID(),
    kind: 'n8n-task',
    namespace: 'nova-life',
    workflow_id: workflow,
    gid,
    payload,
    authoritative: false,
    authority: 'uae',
    status: 'queued',
    created_at: new Date().toISOString(),
  };
  if (!n8nConfigured(env) || typeof execute !== 'function') {
    task.status = 'blocked';
    task.code = 'INTEGRATION_UNAVAILABLE';
    await store.putDocument({ ...task, id: `task:${task.id}` });
    return task;
  }
  const result = await execute({
    workflowId: workflow,
    payload,
    gid,
    tenantId: 'nova-life',
    taskId: task.id,
    idempotencyKey: task.id,
  });
  task.status = 'dispatched';
  task.invocation_id = result?.invocation_id || null;
  task.result = result?.result || null;
  await store.putDocument({ ...task, id: `task:${task.id}` });
  return task;
}
