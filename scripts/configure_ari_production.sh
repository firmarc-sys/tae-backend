#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-689058655022}"
REGION="${REGION:-us-west1}"
SERVICE="${SERVICE:-ari}"
SITE="${SITE:-https://jahorin-mercury.netlify.app}"
OWNER_GID="${OWNER_GID:-399152573423}"
SESSION_SECRET_NAME="${SESSION_SECRET_NAME:-ari-session-secret}"
ACCESS_CODE_SECRET_NAME="${ACCESS_CODE_SECRET_NAME:-ari-owner-access-code}"
MODEL="${MODEL:-gemini-2.5-flash}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"

command -v gcloud >/dev/null || { echo 'gcloud is required. Run this from Google Cloud Shell.' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'openssl is required.' >&2; exit 1; }

printf 'Configuring Agentic Mercury Time Runner ARI\n'
printf 'Project: %s\nRegion: %s\nService: %s\n' "$PROJECT_ID" "$REGION" "$SERVICE"

gcloud config set project "$PROJECT_ID" >/dev/null

gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID" >/dev/null

SERVICE_ACCOUNT="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"

if [ -z "$SERVICE_ACCOUNT" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

printf 'Cloud Run service identity: %s\n' "$SERVICE_ACCOUNT"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/aiplatform.user" \
  --quiet >/dev/null

ensure_secret() {
  local name="$1"
  if ! gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" \
      --project "$PROJECT_ID" \
      --replication-policy=automatic >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
}

ensure_secret "$SESSION_SECRET_NAME"
ensure_secret "$ACCESS_CODE_SECRET_NAME"

printf 'Enter the production GID owner access code. Input is hidden: '
IFS= read -r -s OWNER_ACCESS_CODE
printf '\n'
if [ -z "$OWNER_ACCESS_CODE" ]; then
  echo 'Owner access code cannot be empty.' >&2
  exit 1
fi
export OWNER_ACCESS_CODE

SESSION_SECRET="$(openssl rand -hex 48)"
printf '%s' "$SESSION_SECRET" | gcloud secrets versions add "$SESSION_SECRET_NAME" \
  --project "$PROJECT_ID" \
  --data-file=- >/dev/null
printf '%s' "$OWNER_ACCESS_CODE" | gcloud secrets versions add "$ACCESS_CODE_SECRET_NAME" \
  --project "$PROJECT_ID" \
  --data-file=- >/dev/null
unset SESSION_SECRET

gcloud run services update "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars="ARI_REQUIRE_AUTH=true,JAHORIN_FREE_ACCESS=false,SIOS_OWNER_GID=${OWNER_GID},VERTEX_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION},GEMINI_MODEL=${MODEL}" \
  --update-secrets="ARI_SESSION_SECRET=${SESSION_SECRET_NAME}:latest,OWNER_ACCESS_CODE=${ACCESS_CODE_SECRET_NAME}:latest" \
  --quiet >/dev/null

ARI_URL="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)')"

printf 'ARI URL: %s\n' "$ARI_URL"

wait_ready() {
  local base="$1"
  local label="$2"
  local ready=0
  for attempt in $(seq 1 36); do
    code="$(curl -sS --connect-timeout 5 --max-time 15 -o /tmp/ari-ready.json -w '%{http_code}' "${base}/api/ready?configure=${attempt}" || true)"
    if [ "$code" = '200' ] && python3 - <<'PY'
import json
body=json.load(open('/tmp/ari-ready.json'))
ok=(
    body.get('ok') is True
    and body.get('service') == 'ARI'
    and body.get('runtime') == 'Mercury'
    and body.get('provider_configured') is True
    and body.get('auth_configured') is True
    and body.get('auth_required') is True
)
raise SystemExit(0 if ok else 1)
PY
    then
      ready=1
      break
    fi
    sleep 5
  done
  if [ "$ready" -ne 1 ]; then
    echo "$label did not become production-ready." >&2
    cat /tmp/ari-ready.json >&2 || true
    exit 1
  fi
  printf 'PASS %s readiness\n' "$label"
}

wait_ready "$ARI_URL" 'direct ARI'
wait_ready "$SITE" 'Netlify ARI proxy'

bad_code="$(curl -sS --connect-timeout 5 --max-time 15 \
  -o /tmp/ari-bad-auth.json -w '%{http_code}' \
  -H 'content-type: application/json' \
  -d '{"access_code":"__invalid_production_probe__"}' \
  "${SITE}/api/identity/session")"
if [ "$bad_code" != '401' ]; then
  echo "Expected invalid GID code to return 401 through Netlify; got ${bad_code}." >&2
  cat /tmp/ari-bad-auth.json >&2 || true
  exit 1
fi
printf 'PASS invalid GID credentials rejected\n'

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

AUTH_BODY="$(python3 -c 'import json,os; print(json.dumps({"access_code":os.environ["OWNER_ACCESS_CODE"]}))')"
curl -fsS -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -d "$AUTH_BODY" \
  "${SITE}/api/identity/session" -o /tmp/ari-session.json

curl -fsS -b "$COOKIE_JAR" "${SITE}/api/identity" -o /tmp/ari-identity.json
python3 - <<'PY'
import json
body=json.load(open('/tmp/ari-identity.json'))
assert body.get('authenticated') is True, body
assert str(body.get('gid')) == '399152573423', body
print('PASS authenticated GID session through Netlify')
PY

curl -fsS -b "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -H 'x-request-id: production-jahorin-provider-probe' \
  -d '{"capability":"text","intent":"Reply with exactly: JAHORIN ONLINE","request_id":"production-jahorin-provider-probe"}' \
  "${SITE}/api/runtime" -o /tmp/ari-runtime.json

python3 - <<'PY'
import json
body=json.load(open('/tmp/ari-runtime.json'))
result=body.get('result') or {}
text=str(result.get('text') or '').strip()
provider=str(result.get('provider') or body.get('provider',{}).get('name') or '')
assert text, body
assert provider in ('google-vertex-ai','google-gemini-api'), body
print('PASS Jahorin provider generation through Netlify:', provider, text[:160])
PY

curl -fsS -b "$COOKIE_JAR" -X DELETE "${SITE}/api/identity/session" -o /tmp/ari-logout.json
curl -fsS -b "$COOKIE_JAR" "${SITE}/api/identity" -o /tmp/ari-post-logout.json
python3 - <<'PY'
import json
body=json.load(open('/tmp/ari-post-logout.json'))
assert body.get('authenticated') is False, body
print('PASS GID logout lifecycle')
PY

unset OWNER_ACCESS_CODE

echo 'AGENTIC MERCURY TIME RUNNER — ARI PRODUCTION CONFIGURATION PASS'
