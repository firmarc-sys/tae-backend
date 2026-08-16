from pathlib import Path

p = Path('server.js')
s = p.read_text()
s = s.replace(
    'const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";',
    'const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";',
    1,
)
s = s.replace(
    'const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);',
    'const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServerKey);',
    1,
)
old = '''  const apiKey = service ? supabaseServiceRoleKey : supabaseAnonKey;\n  const authorization = userToken || (service ? supabaseServiceRoleKey : supabaseAnonKey);\n  const headers = {\n    apikey: apiKey,\n    Authorization: `Bearer ${authorization}`,\n    Accept: "application/json",\n  };\n'''
new = '''  const apiKey = service ? supabaseServerKey : supabaseAnonKey;\n  const headers = {\n    apikey: apiKey,\n    Accept: "application/json",\n  };\n  // Modern sb_secret_* server keys authenticate through the apikey header and are not JWTs.\n  // User sessions and legacy anon/service_role keys still use Authorization: Bearer JWT.\n  if (userToken) headers.Authorization = `Bearer ${userToken}`;\n  else if (!service || !apiKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${apiKey}`;\n'''
if old not in s:
    raise SystemExit('supabaseRequest source contract not found')
s = s.replace(old, new, 1)
p.write_text(s)

env = Path('.env.example')
e = env.read_text()
e = e.replace(
    'SUPABASE_SERVICE_ROLE_KEY=replace_with_secret_manager_reference_at_deploy_time',
    'SUPABASE_SECRET_KEY=replace_with_secret_manager_reference_at_deploy_time\n# Legacy fallback only; prefer SUPABASE_SECRET_KEY for new deployments.\nSUPABASE_SERVICE_ROLE_KEY=',
    1,
)
env.write_text(e)
