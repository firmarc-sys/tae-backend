from pathlib import Path

p = Path('server.js')
s = p.read_text()

s = s.replace(
'''function bearerToken(req) {\n''',
'''function generateMemberGid() {\n  return String(crypto.randomInt(100000000000, 1000000000000));\n}\n\nfunction bearerToken(req) {\n''',
1,
)

s = s.replace(
'''function requireProviderAccess(req) {\n  if (authRequired && sessionGid(req) !== OWNER_GID) {\n    throw httpError(401, "Authenticated ARI session required");\n  }\n}\n''',
'''async function requireProviderAccess(req) {\n  if (!authRequired) return { kind: "public" };\n  if (sessionGid(req) === OWNER_GID) return { kind: "owner", gid: OWNER_GID, tier: "owner" };\n  if (bearerToken(req) && supabaseConfigured) return authenticatedPrincipal(req);\n  throw httpError(401, "Authenticated ARI or Supabase session required");\n}\n''',
1,
)

s = s.replace(
'''async function orchestrateWithMercury(req, { capability, intent, requestId, payload = {} }) {\n  const verifiedGid = sessionGid(req);\n''',
'''async function orchestrateWithMercury(req, { capability, intent, requestId, payload = {} }) {\n  let principal = null;\n  if (sessionGid(req) === OWNER_GID) {\n    principal = { kind: "owner", gid: OWNER_GID };\n  } else if (bearerToken(req) && supabaseConfigured) {\n    try { principal = await authenticatedPrincipal(req); } catch { principal = null; }\n  }\n  const verifiedGid = principal?.gid || principal?.id || null;\n''',
1,
)

s = s.replace(
'''        authenticated: verifiedGid === OWNER_GID,\n        mode: verifiedGid === OWNER_GID ? OWNER_MODE : "public",\n''',
'''        authenticated: Boolean(principal),\n        mode: principal?.kind === "owner" ? OWNER_MODE : principal ? "member" : "public",\n''',
1,
)

s = s.replace(
'''        data: displayName ? { display_name: displayName } : {},\n''',
'''        data: { ...(displayName ? { display_name: displayName } : {}), gid: generateMemberGid() },\n''',
1,
)

s = s.replace(
'''    current_period_start: isoFromUnix(subscription.current_period_start),\n    current_period_end: isoFromUnix(subscription.current_period_end),\n''',
'''    current_period_start: isoFromUnix(subscription.current_period_start ?? item?.current_period_start),\n    current_period_end: isoFromUnix(subscription.current_period_end ?? item?.current_period_end),\n''',
1,
)

s = s.replace(
'''      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id || null;\n''',
'''      const invoiceSubscription = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;\n      const subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id || null;\n''',
1,
)

needle = '''    let subscription = await ensureFreeSubscription(principal.id);\n    let customerId = subscription?.stripe_customer_id || null;\n'''
replacement = '''    let subscription = await ensureFreeSubscription(principal.id);\n    if (subscription?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(subscription?.status) && subscription?.tier !== "free") {\n      throw httpError(409, "An active paid subscription already exists; use the billing portal to change plans");\n    }\n    let customerId = subscription?.stripe_customer_id || null;\n'''
s = s.replace(needle, replacement, 1)

s = s.replace('    requireProviderAccess(req);\n', '    await requireProviderAccess(req);\n')
s = s.replace('      requireProviderAccess(req);\n', '      await requireProviderAccess(req);\n')

p.write_text(s)
