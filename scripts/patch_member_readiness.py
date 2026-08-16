from pathlib import Path

server = Path('server.js')
s = server.read_text()

s = s.replace(
'''const publicDomain = (process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://siaas.space").replace(/\\\/$/, "");\nconst supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\\\/$/, "");\nconst supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";\nconst supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";\nconst stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";\nconst stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";\nconst stripePriceBeta = process.env.STRIPE_PRICE_BETA || "";\nconst stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "";\n''',
'''const publicDomain = (process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://siaas.space").replace(/\\\/$/, "");\n// Project URL, publishable key, and Stripe Price IDs are public identifiers, not secrets.\n// Environment variables may override them without requiring a source-code change.\nconst supabaseUrl = (process.env.SUPABASE_URL || "https://zrkkilsynurpgwrijicq.supabase.co").replace(/\\\/$/, "");\nconst supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_s4e9QrRI3JtedJlIbuWCgw_BuLR5Iov";\nconst supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";\nconst stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";\nconst stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";\nconst stripePriceBeta = process.env.STRIPE_PRICE_BETA || "price_1U54rcPJM0SZC6VXiBCv8uG8";\nconst stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "price_1U54rmPJM0SZC6VXTZYX5PXz";\n''',
1,
)

old = '''  const providerConfigured = Boolean(ai);\n  const ownerAuthConfigured = Boolean(sessionSecret && ownerAccessCode);\n  const runtimeReady = await mercuryReady();\n  const ready = providerConfigured && authRequired && ownerAuthConfigured && runtimeReady;\n'''
new = '''  const providerConfigured = Boolean(ai);\n  const ownerAuthConfigured = Boolean(sessionSecret && ownerAccessCode);\n  const memberAuthConfigured = supabaseConfigured;\n  const authenticationConfigured = !authRequired || memberAuthConfigured || ownerAuthConfigured;\n  const runtimeReady = await mercuryReady();\n  const ready = providerConfigured && authenticationConfigured && runtimeReady;\n'''
if old not in s:
    raise SystemExit('ready source contract not found')
s = s.replace(old, new, 1)
s = s.replace(
'''      auth_required: authRequired,\n      auth_configured: ownerAuthConfigured,\n      supabase_configured: supabaseConfigured,\n''',
'''      auth_required: authRequired,\n      auth_configured: authenticationConfigured,\n      member_auth_configured: memberAuthConfigured,\n      owner_auth_configured: ownerAuthConfigured,\n      supabase_configured: supabaseConfigured,\n''',
1,
)
server.write_text(s)

watch = Path('.github/workflows/ari-live-deploy-watch.yml')
w = watch.read_text()
w = w.replace(
'''          ok=body.get('ok') is True and body.get('service')=='ARI' and body.get('runtime')=='Mercury'\n''',
'''          ok=(\n              body.get('ok') is True\n              and body.get('service')=='ARI'\n              and body.get('runtime')=='Mercury'\n              and 'supabase_configured' in body\n              and 'stripe_configured' in body\n              and 'billing_configured' in body\n          )\n''',
1,
)
w = w.replace(
'''          assert ready.get('provider_configured') is True\n          assert ready.get('provider') in ('google-vertex-ai','google-gemini-api')\n          print('PASS ARI readiness + unauthenticated GID state')\n''',
'''          assert ready.get('provider_configured') is True\n          assert ready.get('provider') in ('google-vertex-ai','google-gemini-api')\n          assert ready.get('member_auth_configured') is True\n          assert ready.get('billing_configured') is True\n          print('PASS ARI readiness + member auth + billing configuration')\n''',
1,
)
old_provider = '''      - name: Verify real Jahorin provider generation\n        shell: bash\n        run: |\n          set -euo pipefail\n          code="$(curl -sS --connect-timeout 5 --max-time 45 \\\n            -o /tmp/runtime.json -w '%{http_code}' \\\n            -H 'content-type: application/json' \\\n            -H 'x-request-id: live-jahorin-provider-smoke' \\\n            -d '{"capability":"text","intent":"Reply with exactly: JAHORIN ONLINE","request_id":"live-jahorin-provider-smoke"}' \\\n            "$ARI/api/runtime")"\n          if [ "$code" != "200" ]; then\n            echo "/api/runtime provider generation returned HTTP $code" >&2\n            cat /tmp/runtime.json >&2 || true\n            exit 1\n          fi\n          python3 - <<'PY'\n          import json\n          body=json.load(open('/tmp/runtime.json'))\n          result=body.get('result') or {}\n          text=str(result.get('text') or '').strip()\n          provider=str(result.get('provider') or body.get('provider',{}).get('name') or '')\n          assert text, body\n          assert provider in ('google-vertex-ai','google-gemini-api'), body\n          print('PASS real Jahorin generation:', provider, text[:160])\n          PY\n'''
new_provider = '''      - name: Verify provider routes reject unauthenticated generation\n        shell: bash\n        run: |\n          set -euo pipefail\n          code="$(curl -sS --connect-timeout 5 --max-time 45 \\\n            -o /tmp/runtime.json -w '%{http_code}' \\\n            -H 'content-type: application/json' \\\n            -H 'x-request-id: live-jahorin-auth-smoke' \\\n            -d '{"capability":"text","intent":"Reply with exactly: JAHORIN ONLINE","request_id":"live-jahorin-auth-smoke"}' \\\n            "$ARI/api/runtime")"\n          if [ "$code" != "401" ]; then\n            echo "Expected unauthenticated provider generation to return 401, got $code" >&2\n            cat /tmp/runtime.json >&2 || true\n            exit 1\n          fi\n          echo 'PASS unauthenticated provider generation rejected with 401'\n'''
if old_provider not in w:
    raise SystemExit('provider watch source contract not found')
w = w.replace(old_provider, new_provider, 1)

old_owner = '''          curl -fsS "$ARI/api/ready" -o /tmp/ready-auth.json\n          python3 - <<'PY'\n          import json\n          ready=json.load(open('/tmp/ready-auth.json'))\n          if ready.get('auth_configured') is not True:\n              raise SystemExit('ARI GID session security is not fully configured: auth_configured=false')\n          print('PASS ARI GID session security configured')\n          PY\n\n          code="$(curl -sS --connect-timeout 5 --max-time 15 \\\n            -o /tmp/bad-session.json -w '%{http_code}' \\\n            -H 'content-type: application/json' \\\n            -d '{"access_code":"__invalid_live_smoke_code__"}' \\\n            "$ARI/api/identity/session")"\n          if [ "$code" != "401" ]; then\n            echo "Expected invalid GID access code to return 401, got $code" >&2\n            cat /tmp/bad-session.json >&2 || true\n            exit 1\n          fi\n          echo 'PASS invalid GID access rejected with 401'\n'''
new_owner = '''          curl -fsS "$ARI/api/ready" -o /tmp/ready-auth.json\n          owner_configured="$(python3 - <<'PY'\n          import json\n          ready=json.load(open('/tmp/ready-auth.json'))\n          assert ready.get('member_auth_configured') is True\n          print('true' if ready.get('owner_auth_configured') is True else 'false')\n          PY\n          )"\n          echo 'PASS member authentication configured'\n\n          if [ "$owner_configured" = "true" ]; then\n            code="$(curl -sS --connect-timeout 5 --max-time 15 \\\n              -o /tmp/bad-session.json -w '%{http_code}' \\\n              -H 'content-type: application/json' \\\n              -d '{"access_code":"__invalid_live_smoke_code__"}' \\\n              "$ARI/api/identity/session")"\n            if [ "$code" != "401" ]; then\n              echo "Expected invalid owner access code to return 401, got $code" >&2\n              cat /tmp/bad-session.json >&2 || true\n              exit 1\n            fi\n            echo 'PASS invalid Prime Orchestrator access rejected with 401'\n          else\n            echo 'INFO Prime Orchestrator access-code path is not configured; member auth remains production authority'\n          fi\n'''
if old_owner not in w:
    raise SystemExit('owner watch source contract not found')
w = w.replace(old_owner, new_owner, 1)
watch.write_text(w)
