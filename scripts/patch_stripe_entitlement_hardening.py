from pathlib import Path

p = Path('server.js')
s = p.read_text()

s = s.replace(
'''function entitlementsFor(tier, status = "active") {\n  const normalized = normalizedTier(tier);\n  if (normalized === "owner") return TIER_CONFIG.owner.entitlements;\n  if (status === "canceled") return TIER_CONFIG.free.entitlements;\n  return TIER_CONFIG[normalized].entitlements;\n}\n''',
'''function entitlementsFor(tier, status = "active") {\n  const normalized = normalizedTier(tier);\n  if (normalized === "owner") return TIER_CONFIG.owner.entitlements;\n  if (!["active", "trialing"].includes(status)) return TIER_CONFIG.free.entitlements;\n  return TIER_CONFIG[normalized].entitlements;\n}\n''',
1,
)

s = s.replace(
'''  const status = subscription.status === "canceled" ? "canceled" : subscription.status === "past_due" ? "past_due" : subscription.status === "trialing" ? "trialing" : "active";\n  const tier = status === "canceled" ? "free" : normalizedTier(eventTier);\n''',
'''  const stripeStatus = String(subscription.status || "").toLowerCase();\n  const status = stripeStatus === "active"\n    ? "active"\n    : stripeStatus === "trialing"\n      ? "trialing"\n      : ["canceled", "incomplete_expired"].includes(stripeStatus)\n        ? "canceled"\n        : "past_due";\n  const tier = ["active", "trialing"].includes(status) ? normalizedTier(eventTier) : "free";\n''',
1,
)

p.write_text(s)
