# Deploy service runbook — Stage 1 (subdomain hosting on Cloudflare)

Generated sites are served from `https://<label>.useframe.in` by the `useframe-site-edge`
Worker, which looks up `h:<hostname>` in KV and streams files from a private R2 bucket.

```
Deploy click → apps/server (auth, credits) → deploy-service (BullMQ) → build → R2
             → syncSiteToKvs writes h:<host> → Worker serves it → probe sees x-useframe-deployment
```

- Every deploy is immutable: `sites/{projectId}/{deploymentId}/` in R2. Going live = one KV write.
- The database is the source of truth. `syncSiteToKvs(siteId)` (apps/deploy-service/src/site/sync.ts)
  is the only code that writes site KV entries; reconcile repairs drift through the same module.
- KV is eventually consistent: go-live, rollback, suspend and unsuspend take up to ~60 s or more
  to be visible everywhere. Rollback is fast, not instant.

---

## 1. One-time setup (you)

Nothing in this repo applies infrastructure or deploys the Worker. Do these in order.

### 1.1 Cloudflare account and zone

1. **Zone on Cloudflare.** Dashboard → _Add a site_ → `useframe.in` → Free plan is fine → switch the
   registrar's nameservers to the two Cloudflare nameservers shown. Wait for "Active".
   Universal SSL then covers `useframe.in` and `*.useframe.in` (one level) automatically.
2. **Workers Paid.** _Workers & Pages → Plans → Workers Paid_ ($5/month). KV's free tier
   (1,000 writes/day) is too small.
3. **R2.** _R2 Object Storage → Purchase R2 / Add payment method_ and enable R2.

### 1.2 DNS records that must stay explicit and grey-clouded

_DNS → Records_. Confirm each exists, is **DNS only (grey cloud)**, and points at the real target:

| Name                                         | Type             | Target                                     | Proxy    |
| -------------------------------------------- | ---------------- | ------------------------------------------ | -------- |
| `useframe.in` (apex)                         | A/CNAME (Vercel) | Vercel's values for the project            | DNS only |
| `www`                                        | CNAME            | `cname.vercel-dns.com` (or Vercel's value) | DNS only |
| `api`                                        | A                | GKE ingress IP                             | DNS only |
| anything else in use (mail, verification, …) | as is            | as is                                      | as is    |

Explicit records always beat the wildcard. After Terraform creates `*` (AAAA `100::`, proxied),
**anything without an explicit record resolves to the Worker** and shows "Site not found". Before
applying, list every hostname in use (`dig` your known names, check email/MX/TXT verification
records) and make sure each has an explicit record.

### 1.3 Zone settings (zone-wide — they also affect the dashboard and API)

_Speed → Optimization_ / _Scrape Shield_. Recommended **Off** for generated sites, because they
rewrite HTML: **Email Address Obfuscation** (also hides contact emails from crawlers),
**Rocket Loader**, **Automatic HTTPS Rewrites**, **Auto Minify** (if still offered). The spike's
"HTML integrity" check prints a WARN naming these if served HTML is not byte-identical.

### 1.4 Credentials (three, least privilege)

_My Profile → API Tokens → Create Token → Custom token_:

1. **Admin token** (Terraform/Wrangler; keep on your machine / CI secret only):
   Account → Workers Scripts: Edit, Workers KV Storage: Edit, Workers R2 Storage: Edit;
   Zone (useframe.in) → DNS: Edit, Workers Routes: Edit, Zone: Read.
2. **Runtime token** (deploy service → `CLOUDFLARE_API_TOKEN`):
   Account → Workers KV Storage: Edit; Zone → Zone: Read. (Stage 2 adds SSL and Certificates: Edit.)
   _Client IP Address Filtering_: restrict to the cluster's NAT egress IP if it is static.
3. **R2 S3 token** (`SITES_R2_ACCESS_KEY_ID` / `SITES_R2_SECRET_ACCESS_KEY`):
   _R2 → Manage R2 API Tokens → Create API token_ → **Object Read & Write**, **apply to specific
   bucket only: `useframe-sites`**. Copy the access key id and secret once.

### 1.5 Terraform

```bash
cd infra/terraform/envs/production
cp terraform.tfvars.example terraform.tfvars   # account_id, zone_id (not committed)
# choose and uncomment a state backend in main.tf first
export CLOUDFLARE_API_TOKEN=<admin token>
terraform init && terraform plan && terraform apply
terraform output kv_namespace_id
```

Creates: private R2 bucket `useframe-sites` (location hint `apac`), KV namespace `useframe-sites`,
wildcard `*` AAAA `100::` proxied, and script-less Worker routes for `useframe.in/*`,
`www.useframe.in/*`, `api.useframe.in/*`. Checked here with `terraform fmt`, `init -backend=false`
and `validate` against provider 5.26.0 (constraint `~> 5.19`).

### 1.6 Worker

1. Put the KV id into `apps/site-edge/wrangler.jsonc` (`kv_namespaces[0].id`) and commit it (not a
   secret). `pnpm --filter @useframe/site-edge deploy` refuses to run while the placeholder is present.
2. `pnpm --filter @useframe/site-edge deploy:dry` → check bindings.
3. `CLOUDFLARE_API_TOKEN=<admin token> pnpm --filter @useframe/site-edge deploy`.
   Config: `workers_dev: false`, `preview_urls: false`, one route `*/*` on `useframe.in`.

### 1.7 Database

Apply the additive migration `20261004000000_site_hosting` from `packages/db`
(`pnpm --dir packages/db exec prisma migrate deploy`) after inspecting the target environment.

### 1.8 Image and cluster

```bash
docker build -f apps/deploy-service/Dockerfile -t <registry>/useframe/deploy-service:<tag> .
docker push <registry>/useframe/deploy-service:<tag>
kubectl -n useframe create secret generic deploy-service-secrets --from-literal=...   # see secret.example.yaml
kubectl apply -f infra/k8s/deploy-service/configmap.yaml -f infra/k8s/deploy-service/server.yaml -f infra/k8s/deploy-service/worker.yaml
```

Then set `DEPLOY_SERVICE_URL=http://deploy-service.useframe.svc.cluster.local:4005` on apps/server.
Behind a TLS-intercepting proxy, add `--secret id=extra_ca,src=<ca.pem>` to `docker build`; it is
used only by download steps and never stored in a layer.

---

## 2. Spike — prove the design on the real account

Run after 1.5 and 1.6, with the deploy service's env set:

```bash
SPIKE_RESERVED_HOST_URL=https://useframe.in/ pnpm --filter @useframe/deploy-service spike
```

Test data only (`h:spike-<rand>*` keys, `sites/_spike/<rand>-*/` objects), removed afterwards.

| #   | Check                                                                                                 | If it fails                                                                       |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | R2 PUT/GET/multipart/DeleteObjects via S3 client (checksums `WHEN_REQUIRED`)                          | Stop. Report the error; do not change the design.                                 |
| 2   | KV REST put/get/list/delete/bulk with the runtime token                                               | Stop. Usually token scope.                                                        |
| 3   | HTTPS serving (wildcard DNS, Universal SSL, routing, headers, 404.html, SPA fallback, cache miss→hit) | Stop. Check the wildcard record, Worker route, certificate status.                |
| 4   | Pointer-flip propagation: min/median/p95/max                                                          | If p95 > 60% of `DEPLOY_ACTIVATION_PROBE_MS`, raise it.                           |
| 5   | New host after a cached miss                                                                          | Informs how long a first deploy takes to appear.                                  |
| 6   | HTML integrity                                                                                        | WARN → turn off the settings in 1.3.                                              |
| 7   | Reserved host pass-through                                                                            | FAIL means the dashboard is hitting the Worker: check grey cloud + bypass routes. |
| 8   | Cache API effectiveness                                                                               | WARN means repeat requests still read R2 (cost).                                  |

Record the numbers from 4 and 5 here after the first run: _not yet run_.

---

## 3. Operating

| Task                   | Command                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Suspend a site (abuse) | `pnpm --filter @useframe/deploy-service deploy:suspend --project <id> --reason "phishing report #123"`       |
| Unsuspend              | `pnpm --filter @useframe/deploy-service deploy:unsuspend --project <id>`                                     |
| KV drift report        | `pnpm --filter @useframe/deploy-service deploy:kvs:reconcile --dry-run`                                      |
| Repair KV              | `... deploy:kvs:reconcile --apply` (add `--force` past the 5% cap, `--rewrite-values` for disaster recovery) |
| Purge old builds       | `pnpm --filter @useframe/deploy-service deploy:gc --dry-run` then without `--dry-run`                        |

Scheduled in the worker: reaper every 5 min (in-flight > `DEPLOY_REAPER_STUCK_MINUTES` → FAILED,
refunded, project/pipeline restored, lock released, KV re-synced), GC daily 03:00 UTC (keeps live +
`DEPLOY_RETAIN_COUNT` most recent others), reconcile daily 03:30 UTC (`--apply` semantics, plus a
50-key value sample). The scheduled reconcile applies nothing if the diff exceeds 5% of keys (floor
of 5) and logs `ALERT: kv reconcile safety cap tripped` — a human decides.

Credits: a user deploy charges 1 credit after the deploy service accepts it (202) and is refunded on
any failure (build, upload, activation, reaper), via `refundCredits`, idempotent per deployment.
Rollback and `domain_change` redeploys are free. A 409 (deploy in flight) is never charged.

Project deletion hook: `DELETE /internal/projects/:projectId/site` removes KV entries, every
`sites/{projectId}/` object and the site row. **The API has no project-deletion flow yet**, so
nothing calls it; wire it in when deletion is added.

---

## 4. Security model

- **Cookies.** Generated sites are sibling subdomains of the dashboard/API. In production every auth
  cookie (`__Host-refresh_token`, `__Host-oauth_state`, `__Host-oauth_code_verifier`) is `__Host-`
  prefixed: Secure, `Path=/`, no `Domain`, so a site cannot plant or overwrite them. API auth is a
  bearer header; only `/api/auth/*` uses the cookie.
- **Origin check.** State-changing `/api/auth/*` requests must carry an allowed `Origin`/`Referer`
  (SameSite does not stop same-site generated sites). CORS allows exactly `CLIENT_URL`.
- **Build isolation.** Builds run in the worker pod as uid/gid 10002 via
  `setpriv --reuid --regid --clear-groups --no-new-privs`, with an allowlisted env (no Cloudflare,
  R2, DB, Redis or API secrets), install scripts disabled, timeouts, and process-group kill (sent as
  the build uid, since the worker has no `CAP_KILL`). Output is rejected if it contains symlinks,
  hard links or paths escaping the output dir; `.env*`, `*.pem`, `id_rsa*`, `.git/` are never
  uploaded. Verified by `pnpm --filter @useframe/deploy-service test:isolation` (Docker).
- **Worker pod capabilities.** To switch uid the worker must run as root with
  `drop: [ALL]`, `add: [CHOWN, SETUID, SETGID, DAC_OVERRIDE]`, `allowPrivilegeEscalation: false`,
  read-only root filesystem, `RuntimeDefault` seccomp, emptyDir-only writable paths.
  **Cluster policy fallback:** if Pod Security (restricted) or a policy engine forbids this, do not
  weaken it — move builds to a separate builder (below).
- **In-cluster reach.** Builds share the worker pod's network: they can reach Postgres, Redis and
  other services. Confirm each requires authentication (Postgres password, Redis AUTH/TLS,
  `INTERNAL_SERVICE_SECRET` on services). Recommended follow-up: short-lived, non-root builder pods
  with **no secrets** and a NetworkPolicy allowing egress only to the npm registry; the worker then
  only uploads the verified output.
- **Accepted risk.** Phishing or abuse on `*.useframe.in` can hurt the reputation of the whole
  registrable domain, including the dashboard. Mitigations: the suspend switch, per-user deploy rate
  limit (`DEPLOY_USER_RATE_LIMIT_PER_HOUR`, default 10). Structural fix: move generated sites to a
  separate registrable domain — a config change (`SITES_BASE_DOMAIN`, Worker vars, Terraform zone).

---

## 5. Observability

Structured JSON logs carry `deploymentId`, `projectId`, `step`, `durationMs`. Metrics are log lines
with `"msg":"metric"` (the repo has no metrics library): `deploy.started`, `deploy.succeeded`,
`deploy.failed` (with `reason`), `deploy.build_duration_ms`, `deploy.upload_duration_ms`,
`deploy.probe_duration_ms`, `deploy.kv_key_count`, `deploy.reconcile_diff`,
`deploy.reconcile_cap_tripped`, `deploy.reaper_activations`, `deploy.refund`, `deploy.gc_purged`.

Alerts to create: failed-deploy rate, probe-timeout rate (`reason` starting "Activation
verification failed"), any reconcile cap trip, any reaper activation.

---

## 6. Cost notes (prices checked 2026-10-04; re-verify before budgeting)

- Workers Paid: $5/month; 10 M requests included then $0.30/M; 30 M CPU-ms included then $0.02/M.
- KV: 10 M reads/month then $0.50/M; 1 M writes, 1 M deletes, 1 M lists/month then $5.00/M each;
  1 GB storage then $0.50/GB-month. One deploy = 1–2 writes; the Worker reads once per request,
  edge-cached for 30 s.
- R2 Standard: $0.015/GB-month (10 GB free); Class A (PutObject, ListObjects, multipart) $4.50/M
  (1 M free); Class B (GetObject, HeadObject) $0.36/M (10 M free); deletes free; **no egress fees**.
  Each deploy writes up to `DEPLOY_MAX_FILES` objects (Class A) plus a verification list/get. The
  Worker's Cache API read-through keeps repeat page views off R2.

---

## 7. Local development (Windows)

`DEPLOY_BUILD_ISOLATION=none` (refused when `NODE_ENV=production`; logs a loud warning). The env
allowlist, timeouts and tree kill (`taskkill /T /F`) still apply. Work dir defaults to the OS temp
dir. The service still needs real Cloudflare/R2 config to boot; unit tests (`pnpm test`) and the
Worker's Miniflare tests need none.
