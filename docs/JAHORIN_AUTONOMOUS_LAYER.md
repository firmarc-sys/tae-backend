# Jahorin Autonomous Layer

## Authority chain

Frontend/voice surface → TAE/ARI → Ma'at governance → registered `automation.n8n` workflow → external/registered capability → Thoth verification → durable completion.

The frontend never calls n8n directly. n8n never becomes the identity, memory, policy, or truth authority.

## Free-tier behavior

The free tier is autonomous only for bounded low/moderate-risk work:

- `jahorin-realtime-v1`
- `jahorin-research-v1`
- `jahorin-scribe-v1`
- `jahorin-code-private-v1` (private artifacts only; no deploy/publish)
- `jahorin-memory-v1`

These workflows run without a confirmation dialog. High-risk workflows (`email`, `deployment`, `money`) always require explicit human confirmation upstream and an action-bound approval record before dispatch.

The interface should stream real task phases from TAE (`understanding → planning → acting → observing → verifying → completed`). Do not fabricate progress. n8n is execution machinery; Jahorin remains the conversational presence.

## Completion law

HTTP 2xx from n8n is not completion. `thoth-verifier.js` independently verifies:

1. terminal successful workflow status,
2. a concrete result,
3. execution evidence,
4. action-specific evidence,
5. approval receipt for high-risk actions.

Only a Thoth `verified` attestation may produce a completed task.

## Persistence

`0002_jahorin_autonomous_layer.sql` adds:

- `autonomy_tasks`
- `autonomy_task_events`
- `memory_items`
- `autonomy_approvals`
- `automation_invocations`
- `thoth_verifications`

The schema is standard PostgreSQL and is suitable for Neon. On Supabase, RLS is enabled and client exposure is explicit; anonymous access is revoked.

## n8n setup

Import every JSON file in `n8n/workflows/`.

Create a Header Auth credential named **Jahorin TAE Webhook**:
- Header: `Authorization`
- Value: `Bearer <same value as TAE N8N_API_KEY>`

The production webhook path for workflow `X` is:

`/webhook/jahorin/X`

Never wire TAE to `/webhook-test/`.

For `jahorin-email-v1`, connect the **Jahorin Gmail** OAuth credential before activation.

For deployment/money workflows, set n8n variable `JAHORIN_RUNTIME_URL` to the governed TAE/ARI origin and configure **Jahorin Backend Service**. The backend service credential must be limited to server-to-server execution and must never be exposed to the frontend.

## Request contract

```json
{
  "capability": "automation.n8n",
  "operation": "execute",
  "workflow_id": "jahorin-research-v1",
  "task_id": "uuid-or-task-id",
  "session_id": "session-id",
  "idempotency_key": "stable-per-user-intent",
  "payload": {
    "query": "user intent"
  }
}
```

For high-risk workflows include `human_confirmation: true` in the governed request and in the workflow input/payload used to create the action-bound approval record.

## Jarvis-like behavioral target

Jahorin should feel continuous, anticipatory, and conversational while remaining user-governed:

- keep one persistent conversational presence;
- remember explicit preferences and task summaries;
- continue multi-step work without repeatedly asking for low-risk permissions;
- surface what is happening through real task events;
- propose the next useful step without silently taking consequential action;
- preserve idempotency so retries do not duplicate actions;
- let Ma'at gate authority and Thoth close the loop.

This is behavioral emulation, not proprietary-source reproduction.
