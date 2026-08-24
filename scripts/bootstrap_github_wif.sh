#!/usr/bin/env bash
set -euo pipefail

# Repairs the exact GitHub Actions -> Google Cloud identity used by
# .github/workflows/deploy-ari-cloud-run.yml. Run from Google Cloud Shell as
# an account allowed to administer IAM, service accounts, Cloud Run, and
# Artifact Registry for this project.

PROJECT_ID="${PROJECT_ID:-project-7e6f2720-0291-4c91-8c3}"
REGION="${REGION:-us-west1}"
SERVICE="${SERVICE:-ari}"
POOL_ID="${POOL_ID:-github}"
PROVIDER_ID="${PROVIDER_ID:-github}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-github-actions}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-firmarc-sys/tae-backend}"
GITHUB_REPOSITORY_ID="${GITHUB_REPOSITORY_ID:-1225940030}"
GITHUB_OWNER_ID="${GITHUB_OWNER_ID:-280797641}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-cloud-run-source-deploy}"

command -v gcloud >/dev/null || { echo 'gcloud is required. Use Google Cloud Shell.' >&2; exit 1; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"
echo "Repository: $GITHUB_REPOSITORY (repository_id=$GITHUB_REPOSITORY_ID)"
echo "Federation: $POOL_ID/$PROVIDER_ID"
echo "Deploy service account: $DEPLOY_SA"

gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID" >/dev/null

if ! gcloud iam service-accounts describe "$DEPLOY_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name='GitHub Actions ARI deployer' >/dev/null
fi

# Restore a soft-deleted pool if possible; otherwise create it. Existing pools
# are explicitly re-enabled so a disabled resource cannot keep producing
# google-github-actions/auth invalid_target failures.
if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  if ! gcloud iam workload-identity-pools undelete "$POOL_ID" \
    --project="$PROJECT_ID" --location=global --quiet >/dev/null 2>&1; then
    gcloud iam workload-identity-pools create "$POOL_ID" \
      --project="$PROJECT_ID" \
      --location=global \
      --display-name='GitHub Actions' \
      --description='Repository-scoped GitHub Actions federation for ARI production deployment' >/dev/null
  fi
fi

gcloud iam workload-identity-pools update "$POOL_ID" \
  --project="$PROJECT_ID" --location=global --no-disabled >/dev/null

MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id"
CONDITION="assertion.repository_id=='${GITHUB_REPOSITORY_ID}' && assertion.repository_owner_id=='${GITHUB_OWNER_ID}'"

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  if gcloud iam workload-identity-pools providers undelete "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --quiet >/dev/null 2>&1; then
    :
  else
    gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
      --project="$PROJECT_ID" \
      --location=global \
      --workload-identity-pool="$POOL_ID" \
      --display-name='GitHub firmarc-sys tae-backend' \
      --issuer-uri='https://token.actions.githubusercontent.com/' \
      --attribute-mapping="$MAPPING" \
      --attribute-condition="$CONDITION" >/dev/null
  fi
fi

# Reassert the exact provider contract even if the provider already existed.
gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --issuer-uri='https://token.actions.githubusercontent.com/' \
  --attribute-mapping="$MAPPING" \
  --attribute-condition="$CONDITION" \
  --no-disabled >/dev/null

PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository_id/${GITHUB_REPOSITORY_ID}"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --project="$PROJECT_ID" \
  --role='roles/iam.workloadIdentityUser' \
  --member="$PRINCIPAL_SET" \
  --quiet >/dev/null

# Create the target Artifact Registry repository while this human/admin session
# has authority, so the federated deployer only needs writer access afterward.
if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description='Cloud Run production images' >/dev/null
fi

for role in roles/run.admin roles/artifactregistry.writer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

RUNTIME_SA="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [[ -z "$RUNTIME_SA" ]]; then
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role='roles/iam.serviceAccountUser' \
  --quiet >/dev/null

PROVIDER_RESOURCE="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"
POOL_STATE="$(gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global --format='value(state)')"
PROVIDER_STATE="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --format='value(state)')"

echo
echo 'GITHUB -> GCP FEDERATION BOOTSTRAP PASS'
echo "pool_state=$POOL_STATE"
echo "provider_state=$PROVIDER_STATE"
echo "workload_identity_provider=$PROVIDER_RESOURCE"
echo "service_account=$DEPLOY_SA"
echo "runtime_service_account=$RUNTIME_SA"
echo
echo 'The repository workflow already targets this provider. Re-run the failed Deploy ARI to Cloud Run job after this command completes.'
