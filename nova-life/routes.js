import { clientAccessClaimsIgnored, sessionFromPrincipal } from './access.js';
import { getNovaLife } from './engine.js';

function send(res, responseBase, body, status = 200) {
  return res.status(status).json(responseBase({
    nova_life: true,
    credentials_exposed: false,
    ...body,
  }));
}

export function installNovaLifeRoutes(api, {
  authorize,
  responseBase = (extra) => extra,
  engine = null,
  enabled = () => !/^(0|false|no|off)$/i.test(process.env.NOVA_LIFE_ENABLED ?? 'true'),
} = {}) {
  const runtime = () => engine || getNovaLife();

  api.use('/nova-life', (req, res, next) => {
    if (!enabled()) {
      return res.status(404).json({ ok: false, error: 'Nova Life is disabled', code: 'NOVA_LIFE_DISABLED' });
    }
    return next();
  });

  api.get('/nova-life/health', async (_req, res, next) => {
    try {
      send(res, responseBase, await runtime().health());
    } catch (error) {
      next(error);
    }
  });

  api.get('/nova-life/orbit', (_req, res) => {
    send(res, responseBase, runtime().orbit());
  });

  api.post('/nova-life/experience', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const contract = runtime().identityContract(principal);
      const ignored = clientAccessClaimsIgnored(req.body || {});
      if (!contract.authorized) {
        return send(res, responseBase, { ...contract, client_claims: ignored, session_gid: sessionFromPrincipal(principal).gid }, contract.reason === 'UNAUTHENTICATED' ? 401 : 403);
      }
      send(res, responseBase, { ...contract, client_claims: ignored, session_gid: sessionFromPrincipal(principal).gid });
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/enter', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().enter(principal, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.get('/nova-life/world', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().observe(principal, req.query || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/intent', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const text = req.body?.intent || req.body?.utterance || '';
      send(res, responseBase, await runtime().intent(principal, text, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/forge', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const text = req.body?.intent || req.body?.utterance || '';
      send(res, responseBase, await runtime().intent(principal, text, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/forge/:id/modify', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().modify(principal, req.params.id, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/forge/:id/test', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().test(principal, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/forge/:id/accept', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().accept(principal, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/rollback', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().rollback(principal, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/ai/:capability', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const contract = runtime().identityContract(principal);
      if (!contract.authorized) {
        return send(res, responseBase, contract, contract.reason === 'UNAUTHENTICATED' ? 401 : 403);
      }
      send(res, responseBase, await runtime().ai(req.params.capability, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/n8n/tasks', async (req, res, next) => {
    try {
      const principal = await authorize(req);
      send(res, responseBase, await runtime().n8n(principal, req.body?.workflow_id || req.body?.workflowId, req.body?.payload || {}));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/thoth/verify', async (req, res, next) => {
    try {
      await authorize(req);
      send(res, responseBase, runtime().verify(req.body?.build));
    } catch (error) {
      next(error);
    }
  });

  api.post('/nova-life/maat/evaluate', async (req, res, next) => {
    try {
      await authorize(req);
      const decision = runtime().maat({
        action: req.body?.action,
        confirmed: req.body?.confirmed === true,
        approvalId: req.body?.approval_id || null,
      });
      send(res, responseBase, decision, decision.allowed ? 200 : 403);
    } catch (error) {
      next(error);
    }
  });
}
