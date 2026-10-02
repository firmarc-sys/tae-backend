# Production Architecture Contract

## Purpose
This repository is the canonical production backend for Jahorin. The deployed TAE/ARI runtime is authoritative for authenticated identity, authorization, durable state, task execution, capability policy, audit records, and privileged integrations.

## Request flow
1. Jahorin Frontend GA interprets the user's request and presents the experience.
2. The frontend sends execution requests to the configured TAE/ARI API over HTTPS.
3. TAE authenticates the caller, derives the principal from verified server-side identity, validates the requested capability and payload, and applies policy.
4. TAE executes only authorized operations, persists relevant task/audit state, and returns a structured result.
5. The frontend renders the result and task status.

## Production invariants
- This service is the source of truth for authorization and execution. A frontend-supplied GID, module name, or capability is input, not proof of identity or permission.
- Secrets and provider credentials stay in Secret Manager / server-side environment bindings; never commit secret values or expose them through NEXT_PUBLIC variables.
- Keep authenticated endpoints protected. Health/readiness endpoints may expose only minimal operational metadata.
- Requests should have correlation/request IDs, bounded timeouts, validated schemas, and safe error responses.
- Model selection and tool execution must pass through the backend's policy and approved Vertex AI configuration.
- Do not change live Cloud Run traffic as part of a source-only branch change. Deploy only after CI, secret bindings, and service/revision settings are verified.

## Cloud Run target
The current repository workflow declares service `ari`, region `us-west1`, and project number `689058655022`. Confirm the project ID, workload identity provider, service account permissions, required Secret Manager versions, image, and latest ready revision in Google Cloud before deployment. Repository configuration alone does not prove a successful live deployment.

## Release checklist
- [ ] CI and gateway contract tests pass.
- [ ] Authentication and unauthorized-request tests pass.
- [ ] Vertex AI routing uses the intended Google Cloud project/location and approved model policy.
- [ ] Required Secret Manager bindings exist and are enabled.
- [ ] Cloud Run service and revision are verified in the intended project/region.
- [ ] Smoke tests pass against the candidate revision before traffic is moved.
