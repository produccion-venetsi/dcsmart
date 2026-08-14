#!/usr/bin/env bash
# 02 — Cloud Run Job de fudo-sync + Cloud Scheduler (7am diario, hora AR)
set -euo pipefail
PROJECT=${PROJECT:-dc-smart-mvp}
REGION=${REGION:-us-central1}
INSTANCE=${INSTANCE:-dc-smart-mvp:us-central1:dcsmart-mvp-insta}

gcloud iam service-accounts create fudo-sync --project=$PROJECT \
  --display-name="Fudo Sync Job" || true

# IAM tarda unos segundos en propagar la cuenta recien creada: sin esta espera,
# los add-iam-policy-binding de abajo fallan con "Service account does not exist"
# y, con set -e, cortan el deploy a la mitad. Pasó la primera vez que se corrió.
sleep 15
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:fudo-sync@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/cloudsql.client --condition=None -q
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:fudo-sync@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/run.invoker --condition=None -q
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:fudo-sync@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor --condition=None -q

# Credenciales: un secreto por local. Crear antes de correr esto:
#   printf '%s' "$KEY"    | gcloud secrets create fudo-api-key-grisgris    --data-file=- --project=$PROJECT
#   printf '%s' "$SECRET" | gcloud secrets create fudo-api-secret-grisgris --data-file=- --project=$PROJECT

# La config del build va a un archivo de verdad y no a un <(...): en Windows,
# gcloud no puede leer el /proc/PID/fd/N que genera la process substitution y
# falla con "Unable to read file". Pasó al correr esto desde Git Bash.
CONFIG_BUILD=$(mktemp)
trap 'rm -f "$CONFIG_BUILD"' EXIT
cat > "$CONFIG_BUILD" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.fudo-sync', '-t', '$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/fudo-sync:latest', '.']
images: ['$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/fudo-sync:latest']
EOF

gcloud builds submit ../backend --project=$PROJECT --config "$CONFIG_BUILD"

gcloud run jobs deploy fudo-sync --project=$PROJECT --region=$REGION \
  --image $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/fudo-sync:latest \
  --service-account fudo-sync@$PROJECT.iam.gserviceaccount.com \
  --set-cloudsql-instances $INSTANCE \
  --set-env-vars "^|^DATABASE_URL=${DATABASE_URL:?Exportá DATABASE_URL con la cadena de Cloud SQL antes de correr esto. Se puede copiar del job que ya existe: gcloud run jobs describe taptap-sync --project=$PROJECT --region=$REGION --format=\'value(spec.template.spec.template.spec.containers[0].env[0].value)\'}" \
  --set-secrets "FUDO_API_KEY_GRISGRIS=fudo-api-key-grisgris:latest,FUDO_API_SECRET_GRISGRIS=fudo-api-secret-grisgris:latest,FUDO_API_KEY_CONDARCO=fudo-api-key-condarco:latest,FUDO_API_SECRET_CONDARCO=fudo-api-secret-condarco:latest" \
  --max-retries 1 --task-timeout 900

# 7am hora Argentina: una hora despues del corte de las 06:00, para que el dia
# comercial este cerrado cuando el job lo pide.
gcloud scheduler jobs create http fudo-sync-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 7 * * *" --time-zone="America/Argentina/Buenos_Aires" \
  --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/fudo-sync:run" \
  --http-method=POST \
  --oauth-service-account-email=fudo-sync@$PROJECT.iam.gserviceaccount.com || \
gcloud scheduler jobs update http fudo-sync-trigger --project=$PROJECT --location=$REGION \
  --schedule="0 7 * * *" --time-zone="America/Argentina/Buenos_Aires"

echo "✓ fudo-sync job + scheduler (07:00 AR)"
