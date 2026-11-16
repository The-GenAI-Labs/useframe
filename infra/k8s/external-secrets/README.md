# Production secrets: Secret Manager → External Secrets → Kubernetes

Google Secret Manager (project `cs-project-6fmqamtf`) is the source of truth. Each Kubernetes Secret the
Helm chart loads with `envFrom` is a JSON secret `useframe-prod-<name>` (`KEY: value`), synced into
namespace `useframe` by External Secrets Operator every hour.

| Kubernetes Secret              | Secret Manager secret                         |
| ------------------------------ | --------------------------------------------- |
| `server-secrets`               | `useframe-prod-server-secrets`                |
| `orchestrator-service-secrets` | `useframe-prod-orchestrator-service-secrets`  |
| `research-service-secrets`     | `useframe-prod-research-service-secrets`      |
| `deploy-service-secrets`       | `useframe-prod-deploy-service-secrets`        |
| `billing-service-secrets`      | `useframe-prod-billing-service-secrets`       |
| `scoring-service-secrets`      | `useframe-prod-scoring-service-secrets`       |
| `media-service-secrets`        | `useframe-prod-media-service-secrets`         |
| `worker-secrets`               | `useframe-prod-worker-secrets`                |
| `migrate-secrets`              | `useframe-prod-migrate-secrets`               |

`useframe-dev-<app>` secrets are raw backups of the local `.env` files; the cluster never reads them.

## How it is wired

- ESO is installed with Helm: `helm upgrade --install external-secrets external-secrets/external-secrets
  --version 2.14.0 -n external-secrets --create-namespace --set installCRDs=true
  --set-string 'serviceAccount.annotations.iam\.gke\.io/gcp-service-account=useframe-eso@cs-project-6fmqamtf.iam.gserviceaccount.com'`
- The controller's Kubernetes ServiceAccount `external-secrets/external-secrets` impersonates
  `useframe-eso@cs-project-6fmqamtf.iam.gserviceaccount.com` (`roles/iam.workloadIdentityUser`).
- That Google service account has `roles/secretmanager.secretAccessor` on each `useframe-prod-*` secret
  only (per-secret bindings, nothing project-wide, no access to the dev backups).
- `kubectl apply -k infra/k8s/external-secrets` creates the `ClusterSecretStore` (usable only from
  namespace `useframe`) and one `ExternalSecret` per Kubernetes Secret (`creationPolicy: Owner`).

A new `useframe-prod-*` secret needs its own accessor binding:
`gcloud secrets add-iam-policy-binding useframe-prod-<name> --member=serviceAccount:useframe-eso@cs-project-6fmqamtf.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`

## Rotate a value

1. Change it in the local `apps/<service>/.env`, or in `C:\useframe-prod\overrides.env` for values that
   must differ from dev (overrides win over every `.env`).
2. `node scripts/secrets/sync-secret-manager.mjs --project cs-project-6fmqamtf --dry-run --allow-razorpay-test --allow-shared-dev-database --allow-missing SITES_KV_NAMESPACE_ID`,
   then the same without `--dry-run`. It adds a version only to secrets whose content changed and
   refuses dev-looking values (localhost, placeholders, empty required keys, Razorpay test keys unless
   allowed, the dev Neon endpoint outside `DATABASE_URL` unless allowed). It never prints values.
   Drop `--allow-razorpay-test` once live keys are in the overrides file, and `--allow-missing` once
   `SITES_KV_NAMESPACE_ID` exists.
3. Sync now instead of waiting up to an hour:
   `kubectl -n useframe annotate externalsecret <name> force-sync=$(date +%s) --overwrite`
4. Pods do not reload env: `kubectl -n useframe rollout restart deploy/useframe-<service>`.

Check: `kubectl -n useframe get externalsecrets` shows `SecretSynced` / `True` for every row.
