from pathlib import Path

p = Path('server.js')
s = p.read_text()
replacements = {
    'const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\\\/$/, "");': 'const supabaseUrl = (process.env.SUPABASE_URL || "https://zrkkilsynurpgwrijicq.supabase.co").replace(/\\\/$/, "");',
    'const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";': 'const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_s4e9QrRI3JtedJlIbuWCgw_BuLR5Iov";',
    'const stripePriceBeta = process.env.STRIPE_PRICE_BETA || "";': 'const stripePriceBeta = process.env.STRIPE_PRICE_BETA || "price_1U54rcPJM0SZC6VXiBCv8uG8";',
    'const stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "";': 'const stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "price_1U54rmPJM0SZC6VXTZYX5PXz";',
}
for old, new in replacements.items():
    if old not in s:
        raise SystemExit(f'missing source contract: {old}')
    s = s.replace(old, new, 1)
p.write_text(s)
