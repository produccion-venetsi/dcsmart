#!/usr/bin/env bash
# 01 — Cloud Run Job de taptap-sync + Cloud Scheduler (5am diario, hora AR)
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
INSTANCE=${INSTANCE:-dc-smart-mvp:us-central1:dcsmart-mvp-insta}

# Service account propia (mismo patrón que dcsmart-etl@ en dcsmart-analisis)
gcloud iam service-accounts create taptap-sync --project=$PROJECT \
  --display-name="TapTap Sync Job" || true
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:taptap-sync@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/cloudsql.client --condition=None -q

# Build de la imagen (contexto = backend/, usa Dockerfile.taptap-sync)
gcloud builds submit ../backend --project=$PROJECT \
  --config <(cat <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.taptap-sync', '-t', '$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/taptap-sync:latest', '.']
images: ['$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/taptap-sync:latest']
EOF
)

# Job — reusa el mismo DATABASE_URL (mismo Cloud SQL/base) que dcsmart-backend
# No existe un secreto de Secret Manager para este password al momento del deploy
# (gcloud secrets list --project=dc-smart-mvp solo muestra analytics-* e internal-shared-secret),
# por eso se usa --set-env-vars con el mismo valor que ya usa el servicio dcsmart-backend.
gcloud run jobs deploy taptap-sync --project=$PROJECT --region=$REGION \
  --image $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/taptap-sync:latest \
  --service-account taptap-sync@$PROJECT.iam.gserviceaccount.com \
  --set-cloudsql-instances $INSTANCE \
  --set-env-vars "DATABASE_URL=postgresql://postgres:~P%29uxFx%5E9oIkt%28xr@localhost/postgres?host=/cloudsql/$INSTANCE&schema=public" \
  --max-retries 1 --task-timeout 900

# Scheduler: 5am hora Argentina, todos los días
gcloud scheduler jobs create http taptap-sync-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 5 * * *" --time-zone="America/Argentina/Buenos_Aires" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/taptap-sync:run" \
  --http-method=POST \
  --oauth-service-account-email=taptap-sync@$PROJECT.iam.gserviceaccount.com || \
gcloud scheduler jobs update http taptap-sync-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 5 * * *" --time-zone="America/Argentina/Buenos_Aires"

echo "✓ taptap-sync job + scheduler (05:00 AR)"
