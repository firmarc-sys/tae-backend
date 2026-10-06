# n8n production integration

n8n is an external execution capability behind TAE/ARI. The frontend never calls n8n directly.

## Runtime boundary

Frontend → TAE/ARI → capability registry → Ma'at governance → n8n adapter → n8n Cloud Run → external services.

Required Cloud Run secrets/configuration:

- N8N_BASE_URL: private or production n8n base URL.
- N8N_API_KEY: Secret Manager-backed credential; never commit it.
- N8N_REQUEST_TIMEOUT_MS: bounded request timeout.

Each invocation carries tenant/session/task/request identity plus an idempotency key.

## Workflow contract

Only workflow IDs registered in the TAE capability layer may be exposed. The adapter intentionally accepts a workflow ID, not an arbitrary URL.

Each n8n workflow receiving Jahorin automation should begin with a webhook at:

/webhook/jahorin/{workflow_id}

The workflow should return JSON and preserve the incoming:

- tenant_id
- agent_id
- session_id
- task_id
- workflow_id
- invocation_id
- idempotency_key
- schema_version

## Governance

Consequential n8n operations must be evaluated by UAE/Ma'at before dispatch. Email sends, publishing, deletion, payments, deployment, credential changes, device control, and other irreversible operations must not bypass human confirmation.

## Deployment sequence

1. Deploy durable n8n on Cloud Run with Cloud SQL PostgreSQL and Secret Manager.
2. Configure N8N_BASE_URL and N8N_API_KEY in the TAE Cloud Run service.
3. Register automation.n8n and each approved workflow capability.
4. Add the adapter dispatch route to the universal capability gateway.
5. Add invocation/evidence persistence and idempotency tests.
6. Run end-to-end tenant isolation and failure/recovery tests.
7. Only then expose n8n-powered skills to Jahorin.
