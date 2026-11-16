# UseFrame — GKE Production Setup Runbook (you run these)

Region: **asia-southeast1 (Singapore)**. Neon has no India region; Singapore is its closest, so the
cluster, Redis and database all sit together and every DB query stays local. Indian users reach the API
in about one short hop; the frontend stays on Vercel's edge.

Replace `PROJECT_ID` everywhere. Every command is one line, so it works in PowerShell and bash.
Claude may read the local `.env` and production env files to fill in values. Secrets still go into the cluster from those files, never into the repo.

---

## 0. Before anything (15 min)

1. **Make the GitHub repo private.** It is public right now. Do not push `corpus/` while it is public.
   GitHub → repo → Settings → General → Danger Zone → Change visibility.
2. Install on your PC: Google Cloud CLI, then `gcloud components install kubectl gke-gcloud-auth-plugin`,
   and Helm 3.
3. Log in and pick the project:
   - `gcloud auth login`
   - `gcloud config set project PROJECT_ID`
4. Turn on the APIs: `gcloud services enable container.googleapis.com compute.googleapis.com redis.googleapis.com`
5. Billing → Budgets & alerts → create a monthly budget with email alerts (e.g. 50 / 90 / 100 %).

## 1. Code and images

1. Paste `useframe_helm_production_fixes_prompt.md` into Claude Code. Review and merge its branch into
   `develop`, together with the research-library branch.
2. GitHub repo → Settings → Secrets and variables → Actions:
   - Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (Docker Hub access token with Read & Write).
   - Variable: `DOCKERHUB_NAMESPACE` = your Docker Hub user or org.
3. Images are built when `main` is pushed, or manually: Actions → docker-publish → Run workflow →
   service `all`. Merge `develop` into `main` (or run it manually on `main`).
4. Copy the tag from the job summary: `sha-xxxxxxx`.

## 2. Network and cluster (≈15 min)

1. Cloud NAT (private nodes need it to reach Docker Hub, Neon, Cloudflare and the AI APIs):
   - `gcloud compute routers create useframe-router --network=default --region=asia-southeast1`
   - `gcloud compute routers nats create useframe-nat --router=useframe-router --region=asia-southeast1 --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges`
2. Cluster (Standard, zonal, private nodes, Workload Identity, Dataplane V2, auto-repair/upgrade):
   - `gcloud container clusters create useframe-prod --zone=asia-southeast1-a --release-channel=regular --machine-type=e2-standard-4 --num-nodes=2 --enable-autoscaling --min-nodes=2 --max-nodes=4 --disk-type=pd-balanced --disk-size=100 --enable-ip-alias --enable-dataplane-v2 --workload-pool=PROJECT_ID.svc.id.goog --enable-shielded-nodes --shielded-secure-boot --shielded-integrity-monitoring --enable-private-nodes --enable-autorepair --enable-autoupgrade`
   - If gcloud asks for `--master-ipv4-cidr`, add `--master-ipv4-cidr=172.16.0.32/28` and run it again.
3. Connect and check:
   - `gcloud container clusters get-credentials useframe-prod --zone=asia-southeast1-a`
   - `gcloud container clusters describe useframe-prod --zone=asia-southeast1-a --format="value(autopilot.enabled)"` → must print nothing or `False`.
   - `kubectl get nodes` → 2 nodes `Ready`.

## 3. Redis (Memorystore) (≈10 min)

- `gcloud redis instances create useframe-redis --region=asia-southeast1 --zone=asia-southeast1-a --size=1 --tier=basic --redis-version=redis_7_2 --network=default --enable-auth --redis-config=maxmemory-policy=noeviction`
- Host: `gcloud redis instances describe useframe-redis --region=asia-southeast1 --format="value(host)"`
- Password: `gcloud redis instances get-auth-string useframe-redis --region=asia-southeast1`
- Your `REDIS_URL` is `redis://:PASSWORD@HOST:6379`. Put it only in the env files of step 5.
- Basic tier has no failover. Move to `--tier=standard` once you have paying users.

## 4. Database (Neon, production)

1. In Neon, create a **new project** for production in **AWS Asia Pacific (Singapore)**. Never reuse the dev
   database.
2. In its SQL editor run: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy the connection strings the same way your dev `.env` uses them (pooled and/or direct). The migration
   Job runs `prisma migrate deploy` automatically on install.
4. Neon → project settings → enable IP Allow (optional) with your NAT IP:
   `gcloud compute routers get-nat-ip-info useframe-router --region=asia-southeast1`

## 5. Namespace and secrets (≈20 min)

1. Namespace and Pod Security labels:
   - `kubectl create namespace useframe`
   - `kubectl label namespace useframe pod-security.kubernetes.io/enforce=baseline pod-security.kubernetes.io/warn=restricted pod-security.kubernetes.io/audit=restricted`
2. Docker Hub pull secret (a separate **Read-only** token):
   - `kubectl -n useframe create secret docker-registry dockerhub-pull --docker-server=docker.io --docker-username=DOCKERHUB_USER --docker-password=READ_ONLY_TOKEN`
3. Make one production env file per service **outside the repo** (e.g. `C:\useframe-prod\server.env`),
   with `KEY=value` lines from `infra/helm/useframe/ENV.md`. Use production values only: the Neon prod
   URL, the Redis URL above, `https://useframe.in` / `https://api.useframe.in` URLs, live keys after
   Razorpay approval, and the same `INTERNAL_SERVICE_SECRET` in every file. Leave optional keys out
   instead of setting them to empty.
4. Create each secret (names from the README/ENV.md; the fixes prompt adds `worker-secrets`):
   - `kubectl -n useframe create secret generic server-secrets --from-env-file=C:\useframe-prod\server.env`
   - repeat for `orchestrator-service-secrets`, `research-service-secrets`, `deploy-service-secrets`,
     `billing-service-secrets`, `scoring-service-secrets`, `media-service-secrets`, `worker-secrets`,
     `migrate-secrets` (only `DATABASE_URL`).
5. Delete the env files afterwards or keep them encrypted (e.g. in a password manager).

## 6. Public IP and DNS

1. `gcloud compute addresses create useframe-api --global`
2. `gcloud compute addresses describe useframe-api --global --format="value(address)"`
3. Cloudflare DNS: `api` and `orchestrator` → A records to that IP, **DNS only (grey cloud)**.
   Google's certificate only issues when the names point straight at the load balancer.
4. Make sure `api`, `orchestrator`, `www`, `app` and similar names are on the deploy-service reserved list
   so no user project can claim them.

## 7. Install

- `helm upgrade --install useframe infra/helm/useframe -n useframe -f infra/helm/useframe/values-production.yaml --set global.image.namespace=DOCKERHUB_NAMESPACE --set global.image.tag=sha-xxxxxxx --atomic --timeout 15m`
- If it fails: `kubectl -n useframe get pods`, `kubectl -n useframe describe pod <pod>`,
  `kubectl -n useframe logs job/useframe-migrate`. The README's Troubleshooting table covers the usual errors.

## 8. Verify (the certificate can take 15–60 min)

- `kubectl -n useframe get pods` → all `Running` and `Ready`.
- `kubectl -n useframe describe managedcertificate` → `Active`.
- `curl https://api.useframe.in/health` → 200. Same for the orchestrator host.

## 9. Connect the rest

1. **Vercel** (web project → Settings → Environment Variables, Production), then redeploy:
   `NEXT_PUBLIC_API_SERVICE_URL=https://api.useframe.in`, `NEXT_PUBLIC_ORCHESTRATOR_URL=https://orchestrator.useframe.in`,
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<live key>`. Remove the leftover server secrets from the web env.
2. **OAuth:** add `https://api.useframe.in/api/auth/google/callback` (Google Cloud Console → Credentials) and
   `https://api.useframe.in/api/auth/github/callback` (GitHub OAuth app).
3. **Razorpay:** webhook URL → billing route on `https://api.useframe.in/...` (path from the billing code).
4. **Research data:** from your PC with the Neon prod `DATABASE_URL` and the Voyage key:
   `pnpm corpus:ingest corpus/findings` then `pnpm corpus:import-articles`.
5. Turnstile: add `useframe.in` to the site's allowed hostnames.

## 10. Later

- Enable `deploy-service-worker` after the RUNBOOK spikes pass (user site deploys need it).
- Move secrets to Secret Manager with External Secrets when convenient.
- Memorystore Standard tier and a second zone when traffic grows.