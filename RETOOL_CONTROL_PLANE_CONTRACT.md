# JAHORIN RETOOL CONTROL PLANE CONTRACT

Retool is the internal operational control plane for JAHORIN TRISMEGISTUS. It is not the Mercury consumer frontend and must not reproduce Mercury visuals.

## Runtime authority

Production ARI: `https://ari-689058655022.us-west1.run.app`

Retool must authenticate as an authorized internal operator. Owner-only control endpoints require the signed Prime Orchestrator ARI session. Do not send role, tier, or entitlements from the browser as authority.

## Canonical control resources

### CONTROL HEALTH
`GET /api/control/health`

Use for the Retool Overview status strip. It reports the active runtime provider, canonical billing configuration state, enabled provider routes, published scenes, persistent TAE command count, and canonical external-tier count.

### PROVIDERS
`GET /api/control/providers`

`POST /api/control/providers`

Fields managed by Retool:
- capability_id
- operation
- provider
- model_alias
- fallback_alias
- priority
- enabled
- config

Provider routing is registry-controlled. A provider route that is not enabled in Neon must not be silently invoked by ARI.

### SCENES
`GET /api/control/scenes`

`POST /api/control/scenes`

The production registry contains the canonical 43-scene manifest. Retool edits semantic scene manifests only. Mercury owns chrome, liquid material, WebGL, ripple, motion and physical manifestation.

### TAE
`GET /api/control/tae`

Every production `POST /api/tae` execution is persisted to Neon with command text, route, source surface, execution state, response payload and timestamp. Retool uses this endpoint for TAE operations/history.

### TIERS & ENTITLEMENTS
`GET /api/control/tiers`

Canonical external tiers:
1. trial
2. personal
3. pro
4. business
5. enterprise

Internal access tiers remain separate from customer subscription tiers.

### IDENTITY TIER ADMINISTRATION
`POST /api/control/identity-tier`

Body:
```json
{
  "gid": "<GID>",
  "tier": "personal|pro|business|enterprise|trial",
  "subscription_status": "active|trialing|past_due|canceled"
}
```

This is an owner/admin correction surface, not a substitute for Stripe webhook synchronization.

## Canonical billing

### BILLING CATALOG
`GET /api/billing/catalog`

Returns the five canonical customer tiers and whether each paid tier has a deployment price configured.

### CHECKOUT
`POST /api/billing/checkout`

Requires authenticated member identity. Accepted paid tiers are only:
- personal
- pro
- business
- enterprise

Checkout and subscription metadata carry `user_id`, `gid`, and canonical `tier` so Stripe lifecycle events can update the authoritative Neon `identity_access` record.

### BILLING STATUS
`GET /api/billing/status`

Returns live Stripe-derived subscription status when Stripe is configured. Inactive or canceled paid subscriptions resolve to the `trial` authorization tier rather than preserving paid execution rights.

### STRIPE WEBHOOK
`POST /api/stripe/webhook`

The control-plane gateway validates the Stripe signature and synchronizes successful/trialing subscriptions into Neon `identity_access`. Canceled, expired, or non-active subscriptions fall back to `trial` access. ARI authorization then resolves the resulting tier from Neon before provider execution.

## Retool pages

Build these internal pages against the resources above and the existing Neon business-operations schema:

- OVERVIEW
- IDENTITIES
- INTERNAL USERS
- EXTERNAL USERS
- ROLES
- TIERS
- ENTITLEMENTS
- CAPABILITIES
- SCENES
- TAE
- PROVIDERS
- RUNTIME
- USAGE
- LOGS
- HEALTH
- BUSINESS OVERVIEW
- PEOPLE
- ORG
- HIRING
- CANDIDATES
- COMPENSATION
- LABOR LOGS
- FTE / CAPACITY
- PROJECTS
- PROJECT ECONOMICS
- PRODUCT INVESTMENT
- WORKFORCE MODEL
- PAYROLL PLANNING
- CONTRACTORS
- OPERATIONS
- REPORTS

## MA'AT law

`WIRED` means code connects the resource.

`LIVE` means deployed code successfully reaches the production dependency.

`VERIFIED` means a production test produced evidence.

`PRODUCTION` means the verified implementation is actually serving traffic.

Retool must never display a success state from mock data when the production dependency failed.
