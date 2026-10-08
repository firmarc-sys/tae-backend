import crypto from 'node:crypto';

function configured(value) {
  return Boolean(String(value || '').trim());
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeout = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { text }; }
    if (!response.ok) {
      const error = new Error(data?.error || data?.message || `Integration HTTP ${response.status}`);
      error.status = response.status;
      error.code = 'INTEGRATION_HTTP_ERROR';
      throw error;
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

export function integrationReadiness() {
  return {
    n8n: configured(process.env.N8N_BASE_URL) && configured(process.env.N8N_API_KEY),
    mcp: configured(process.env.MCP_GATEWAY_URL) && configured(process.env.MCP_GATEWAY_TOKEN),
    browser: configured(process.env.BROWSER_RUNTIME_URL) && configured(process.env.BROWSER_RUNTIME_TOKEN),
    computer_use: configured(process.env.COMPUTER_USE_RUNTIME_URL) && configured(process.env.COMPUTER_USE_RUNTIME_TOKEN),
    nova: configured(process.env.NOVA_RUNTIME_URL) && configured(process.env.NOVA_RUNTIME_TOKEN),
  };
}

export async function executeN8n({ workflowId, payload = {}, tenantId, gid, taskId, idempotencyKey }) {
  const base = String(process.env.N8N_BASE_URL || '').replace(/\/$/, '');
  const token = process.env.N8N_API_KEY || '';
  if (!base || !token) throw Object.assign(new Error('n8n production binding is unavailable'), { status: 503, code: 'INTEGRATION_UNAVAILABLE' });
  const invocationId = crypto.randomUUID();
  const { data } = await requestJson(`${base}/webhook/jahorin/${encodeURIComponent(workflowId)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-jahorin-invocation-id': invocationId,
      'x-jahorin-tenant-id': String(tenantId || ''),
      'x-jahorin-gid': String(gid || ''),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      authorization: `Bearer ${token}`,
    },
    body: { invocation_id: invocationId, task_id: taskId || null, payload },
  });
  return { invocation_id: invocationId, provider: 'n8n', result: data };
}

export async function executeMcp({ tool, arguments: args = {}, tenantId, gid, taskId }) {
  const base = String(process.env.MCP_GATEWAY_URL || '').replace(/\/$/, '');
  const token = process.env.MCP_GATEWAY_TOKEN || '';
  if (!base || !token) throw Object.assign(new Error('MCP gateway is unavailable'), { status: 503, code: 'INTEGRATION_UNAVAILABLE' });
  const { data } = await requestJson(`${base}/tools/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: { tool, arguments: args, context: { tenant_id: tenantId, gid, task_id: taskId || null } },
  });
  return { provider: 'mcp', tool, result: data };
}

export async function executeRemoteRuntime(kind, path, body, headers = {}) {
  const config = {
    browser: [process.env.BROWSER_RUNTIME_URL, process.env.BROWSER_RUNTIME_TOKEN],
    'computer-use': [process.env.COMPUTER_USE_RUNTIME_URL, process.env.COMPUTER_USE_RUNTIME_TOKEN],
    nova: [process.env.NOVA_RUNTIME_URL, process.env.NOVA_RUNTIME_TOKEN],
  }[kind];
  if (!config) throw Object.assign(new Error(`Unsupported runtime ${kind}`), { status: 422, code: 'INTEGRATION_UNAVAILABLE' });
  const [originRaw, token] = config;
  const origin = String(originRaw || '').replace(/\/$/, '');
  if (!origin || !token) throw Object.assign(new Error(`${kind} production binding is unavailable`), { status: 503, code: 'INTEGRATION_UNAVAILABLE' });
  const { data } = await requestJson(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body,
  });
  return { provider: kind, result: data };
}
