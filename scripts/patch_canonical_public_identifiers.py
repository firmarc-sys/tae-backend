from pathlib import Path

p = Path('server.js')
lines = p.read_text().splitlines()
replaced = set()
for i, line in enumerate(lines):
    if line.startswith('const supabaseUrl = '):
        lines[i] = 'const supabaseUrl = (process.env.SUPABASE_URL || "https://zrkkilsynurpgwrijicq.supabase.co").replace(/\\/$/, "");'
        replaced.add('supabaseUrl')
    elif line.startswith('const supabaseAnonKey = '):
        lines[i] = 'const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_s4e9QrRI3JtedJlIbuWCgw_BuLR5Iov";'
        replaced.add('supabaseAnonKey')
    elif line.startswith('const stripePriceBeta = '):
        lines[i] = 'const stripePriceBeta = process.env.STRIPE_PRICE_BETA || "price_1U54rcPJM0SZC6VXiBCv8uG8";'
        replaced.add('stripePriceBeta')
    elif line.startswith('const stripePriceAlpha = '):
        lines[i] = 'const stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "price_1U54rmPJM0SZC6VXTZYX5PXz";'
        replaced.add('stripePriceAlpha')
required = {'supabaseUrl', 'supabaseAnonKey', 'stripePriceBeta', 'stripePriceAlpha'}
if replaced != required:
    raise SystemExit(f'missing source contracts: {sorted(required - replaced)}')
p.write_text('\n'.join(lines) + '\n')
