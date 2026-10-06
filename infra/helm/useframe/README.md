# UseFrame Helm chart (GKE)

One chart for UseFrame's backend workloads on GKE, using the images Part 1 publishes to Docker Hub
(`docker/README.md`). Every workload is rendered from the `services:` map in `values.yaml` by one
shared template, so adding a service is a values block. The chart deploys **application workloads
only**: Postgres and Redis are external and reach the pods through Secrets that you create.

```
git push → CI → docker.io/<ns>/useframe-<service>:sha-<7>          (Part 1)
helm upgrade --install useframe infra/helm/useframe --set global.image.tag=sha-<7>   (this chart)
```

| Workload (`services.<key>`)  | Image                           | Default  | Exposed                         | Health                                       |
| ---------------------------- | ------------------------------- | -------- | ------------------------------- | -------------------------------------------- |
| `server`                     | `useframe-server`               | on       | Ingress `api.useframe.in`       | `GET /health` :4000                          |
| `orchestrator-service`       | `useframe-orchestrator-service` | on       | ClusterIP (see "Ingress" below) | `GET /health` :4001                          |
| `research-service`           | `useframe-research-service`     | on       | ClusterIP                       | `GET /health` :4004                          |
| `deploy-service-server`      | `useframe-deploy-service`       | on       | ClusterIP                       | `GET /healthz` :4005                         |
| `deploy-service-worker`      | `useframe-deploy-service`       | **off**  | none (no Service)               | `GET /healthz` :8080 (`HEALTH_PORT`)         |
| `billing-service`            | `useframe-billing-service`      | off      | ClusterIP                       | `GET /health` :4002                          |
| `scoring-service`            | `useframe-scoring-service`      | off      | ClusterIP                       | `GET /health` :4003                          |
| migration hook (`migration`) | `useframe-migrate`              | prod: on | —                               | `prisma migrate deploy`, pre-install/upgrade |

Not in this chart: `apps/web` (Vercel), `apps/site-edge` (Cloudflare Worker), `apps/worker` (needs a
health endpoint, `/dev/shm`, and the `useframe-worker` ServiceAccount/RBAC from
`packages/validation/gke-preview.yaml` before it can be added), Postgres, Redis.

Files: `values.yaml` (documented defaults), `values-production.yaml` (sizes, hosts, replicas),
`values-single-repo.yaml` (Part 1's single-repo naming), `values.schema.json`, `ENV.md` (every env
var per service), `secrets.example.yaml` (placeholders only), `tests/` (helm-unittest).

Commands below use `useframe` as both the release and the namespace. Where PowerShell and bash
differ, both are shown.

---

## 1. One-time cluster prep (you do this)

**Cluster type.** Check whether the cluster is Autopilot. The build worker cannot run on Autopilot
(§10):

```bash
gcloud container clusters describe <cluster> --location <region-or-zone> --format="value(autopilot.enabled)"
```

`True` means Autopilot. Empty or `False` means Standard.

**Namespace and Pod Security labels.** The whole chart is `restricted`-compatible except
`deploy-service-worker`, which needs `baseline` (root plus four capabilities):

```bash
kubectl create namespace useframe
kubectl label namespace useframe \
  pod-security.kubernetes.io/enforce=baseline \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted
```

PowerShell: same commands, with the line continuations (`\`) removed or replaced by a backtick.

`warn=restricted` makes the API server print a warning for the build worker on every apply. That is
expected. Any other workload that warns is a bug.

**Workload Identity** (only for workloads that call Google APIs; today only the orchestrator, when
`GCS_BUCKET` is set). No service reads a JSON key file. The cluster needs Workload Identity enabled
(`--workload-pool=<project>.svc.id.goog`), then:

```bash
gcloud iam service-accounts create useframe-orchestrator --project <project>
gcloud storage buckets add-iam-policy-binding gs://<bucket> \
  --member "serviceAccount:useframe-orchestrator@<project>.iam.gserviceaccount.com" --role roles/storage.objectAdmin
gcloud iam service-accounts add-iam-policy-binding useframe-orchestrator@<project>.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:<project>.svc.id.goog[useframe/useframe-orchestrator-service]"
```

Then add the annotation in your values:

```yaml
services:
  orchestrator-service:
    serviceAccount:
      annotations:
        iam.gke.io/gcp-service-account: useframe-orchestrator@<project>.iam.gserviceaccount.com
```

Each KSA is named `<release>-<service key>`. Workload Identity works without mounting the
ServiceAccount token: the GKE metadata server handles it, so `automountServiceAccountToken: false`
stays.

**Static IP for the ingress** (global, named; `values-production.yaml` expects `useframe-api`):

```bash
gcloud compute addresses create useframe-api --global --project <project>
gcloud compute addresses describe useframe-api --global --format="value(address)"
```

**DNS.** In Cloudflare, `api.useframe.in` is an **A record to that IP, DNS only (grey cloud)**. The
Google-managed certificate only provisions when the hostname resolves directly to the load
balancer. A proxied (orange) record never validates. This matches
`apps/deploy-service/RUNBOOK.md` §1.2.

**Private cluster egress.** A private cluster needs Cloud NAT for Docker Hub, Cloudflare, the
databases and the LLM providers. All nodes then share the NAT IP for Docker Hub pulls, which is
another reason pulls must be authenticated (§2).

## 2. Pull secret (Docker Hub, Read-only)

Create a **separate Read-only** access token in Docker Hub (not CI's Read & Write token):

```bash
kubectl -n useframe create secret docker-registry dockerhub-pull \
  --docker-server=docker.io --docker-username=<dockerhub-user> --docker-password=<READ-ONLY token>
```

PowerShell (keeps the token out of shell history):

```powershell
$token = Read-Host "Docker Hub read-only token" -AsSecureString
kubectl -n useframe create secret docker-registry dockerhub-pull `
  --docker-server=docker.io --docker-username=<dockerhub-user> `
  "--docker-password=$([System.Net.NetworkCredential]::new('', $token).Password)"
```

Every pod references it through `global.imagePullSecrets`.

## 3. Application Secrets

The chart **never creates Secrets**. It references them by name (`envFromSecrets`). Create one per
service from a git-ignored env file. `ENV.md` lists every key, and `secrets.example.yaml` shows the
shape with placeholders.

| Secret                         | Used by                                         |
| ------------------------------ | ----------------------------------------------- |
| `server-secrets`               | server                                          |
| `orchestrator-service-secrets` | orchestrator-service                            |
| `research-service-secrets`     | research-service                                |
| `deploy-service-secrets`       | deploy-service-server and deploy-service-worker |
| `migrate-secrets`              | migration hook Job (`DATABASE_URL` only)        |
| `billing-service-secrets`      | billing-service (when enabled)                  |
| `scoring-service-secrets`      | scoring-service (when enabled)                  |

```bash
# server.env holds KEY=value lines; keep it outside the repo or git-ignored, and delete it afterwards.
kubectl -n useframe create secret generic server-secrets --from-env-file=server.env
# update in place later:
kubectl -n useframe create secret generic server-secrets --from-env-file=server.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

The same command works in PowerShell. For a value with special characters, use
`--from-literal=KEY='value'` in bash, or `--from-literal="KEY=value"` in PowerShell.

Leave optional keys out rather than setting them to an empty string. `GCS_BUCKET` and the research
service's `REDIS_URL` reject `""` (see `ENV.md`).

## 4. Deploy

Find the tag in Part 1's CI job summary ("Deploy tag (Helm `global.image.tag`)"), or locally with
`pnpm docker:list` on the published commit. It is always `sha-<first 7 of the commit>`. The chart
refuses `latest` and `main`.

```bash
helm upgrade --install useframe infra/helm/useframe -n useframe --create-namespace \
  -f infra/helm/useframe/values-production.yaml \
  --set global.image.namespace=<dockerhub-ns> \
  --set global.image.tag=sha-<gitsha> \
  --atomic --timeout 10m
```

```powershell
helm upgrade --install useframe infra/helm/useframe -n useframe --create-namespace `
  -f infra/helm/useframe/values-production.yaml `
  --set global.image.namespace=<dockerhub-ns> `
  --set global.image.tag=sha-<gitsha> `
  --atomic --timeout 10m
```

If Part 1 publishes with `DOCKER_IMAGE_NAMING=single-repo`, add `-f infra/helm/useframe/values-single-repo.yaml`.

Preview what would change first: `helm template ... | kubectl diff -n useframe -f -` (read-only
against the cluster), or install the `helm-diff` plugin.

**First install ordering.** The migration Job is a `pre-install,pre-upgrade` hook. It runs **before**
any regular resource, so `dockerhub-pull` and `migrate-secrets` must already exist. If the Job fails,
`--atomic` rolls the release back and no workload changes. Read its logs with
`kubectl -n useframe logs job/useframe-migrate` (a failed hook Job is kept until the next attempt).

**Migrations must be backward-compatible with the previous release.** Old pods keep serving during
the rolling update, so use expand/contract: add columns and tables first, and drop them in a later
release.

## 5. Verify

```bash
kubectl -n useframe get pods -l app.kubernetes.io/instance=useframe
kubectl -n useframe rollout status deploy/useframe-server
kubectl -n useframe get ingress useframe-ingress          # ADDRESS = the static IP
kubectl -n useframe describe managedcertificate useframe-ingress
curl -fsS https://api.useframe.in/health
```

PowerShell: use `curl.exe -fsS https://api.useframe.in/health` (plain `curl` is an alias there).

On first issue the managed certificate stays `Provisioning` for **15–60 minutes**, and only
progresses once DNS points straight at the static IP. HTTPS fails until it is `Active`.

## 6. Roll back

```bash
helm -n useframe history useframe
helm -n useframe rollback useframe <revision> --wait
```

`helm rollback` restores the Kubernetes objects only. **It never undoes database migrations.** The
pre-upgrade hook does not run on rollback, so the previous app version must work against the newer
schema (see §4).

## 7. Roll one service only

CI builds every service on every publish, so normally everything shares one tag. To move one
workload:

```bash
helm upgrade useframe infra/helm/useframe -n useframe --reuse-values \
  --set services.server.image.tag=sha-<other> --atomic --timeout 10m
```

`--reuse-values` keeps the previous release's values. To be explicit instead, pass the same `-f` and
`--set` flags as the last deploy plus the override. `services.<key>.image.digest=sha256:...` pins a
digest instead of a tag.

## 8. Day-2 operations

- **Secret changed:** pods do not restart on their own, because only the plain-env ConfigMap carries
  a `checksum/config` annotation. Run
  `kubectl -n useframe rollout restart deploy/useframe-<key>`, or have CI set
  `services.<key>.podAnnotations.secrets-rev=<n>`.
- **Plain config changed** (values `env`): `helm upgrade` rolls the pods automatically.
- **Scaling:** set `services.<key>.replicas`, or `autoscaling.{enabled,minReplicas,maxReplicas}`
  (the HPA then owns the replica count). In production, `server` autoscales from 2 to 6 at 70% CPU.
- **Draining a node:** every workload running more than one replica has a PDB with `minAvailable: 1`,
  so `kubectl drain` evicts pods one at a time and waits for the replacements to become Ready.
  Single-replica workloads have no PDB and are briefly unavailable during a drain. The build worker
  has none on purpose: an eviction sends SIGTERM, and it finishes in-flight builds within its 900 s
  grace period.
- **Logs:**
  `kubectl -n useframe logs deploy/useframe-server -f`, or `--previous` after a crash.
- **Shutdown timing:** every HTTP pod gets a `preStop` sleep (5–15 s) so the load balancer and
  endpoints stop routing before SIGTERM. The chart refuses a `terminationGracePeriodSeconds` that
  doesn't exceed the preStop sleep. Defaults: server 60 s (its SSE streams end themselves after
  15 min; anything still open reconnects), orchestrator 300 s (generation streams), others 30 s.

## 9. Troubleshooting

| Symptom                                                                                                         | Likely cause and fix                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ImagePullBackOff` / `ErrImagePull`                                                                             | `kubectl describe pod`. "unauthorized": wrong/expired token or `dockerhub-pull` missing in this namespace. "not found": wrong `global.image.namespace`, the tag isn't published yet (PR builds never push), or naming mode mismatch (`values-single-repo.yaml`). "toomanyrequests": the pull secret isn't used (anonymous pulls share the NAT IP). |
| `CreateContainerConfigError`                                                                                    | A Secret or ConfigMap named in `envFrom` doesn't exist in the namespace (`kubectl describe pod` names it).                                                                                                                                                                                                                                         |
| `CrashLoopBackOff` with `Invalid environment variables:`                                                        | The service's zod validation lists the failing keys. Compare with `ENV.md`. Typical cases: a required key missing from the Secret, an optional URL set to `""`, or no LLM key at all.                                                                                                                                                              |
| `EROFS: read-only file system`                                                                                  | The root filesystem is read-only by design. Add the path as `services.<key>.emptyDirs: [{name, mountPath, sizeLimit}]` (copy the default `/tmp` entry too, because lists replace).                                                                                                                                                                 |
| Load balancer 502 right after the first deploy                                                                  | Backends are still becoming healthy (a few minutes), or the health check path is wrong. The BackendConfig checks `healthPath` on the container port. Check `kubectl describe ingress useframe-ingress` events.                                                                                                                                     |
| SSE stream cut at 30 s                                                                                          | The BackendConfig isn't attached. Check the Service annotation `cloud.google.com/backend-config` and `ingress.gke.backendConfig.timeoutSec` (default 3600).                                                                                                                                                                                        |
| ManagedCertificate stuck `Provisioning` / `FailedNotVisible`                                                    | DNS isn't a grey-cloud A record to the static IP yet, or the static IP name in values doesn't exist.                                                                                                                                                                                                                                               |
| Build worker rejected at admission (`violates PodSecurity "baseline"`, or Autopilot "capabilities not allowed") | The namespace enforces `restricted`, or the cluster is Autopilot. Use `enforce=baseline` on Standard. On Autopilot, keep the worker disabled and follow the RUNBOOK's separate-builder fallback. **Don't weaken its securityContext.**                                                                                                             |
| `helm upgrade` fails with `values don't meet the specifications of the schema`                                  | `values.schema.json` caught a typo or a missing `resources` block. The message names the path.                                                                                                                                                                                                                                                     |

## 10. What each workload needs, and why the build worker is special

- **server**: the public API. It is the only workload behind the ingress. It streams SSE to the
  browser, so the load balancer timeout is 3600 s instead of GKE's 30 s default.
- **orchestrator-service**: AI planning and generation. It calls research-service in-cluster. The
  browser also calls it **directly** today (`NEXT_PUBLIC_ORCHESTRATOR_URL` in `apps/web`: generation,
  chat, clarify, extract, replicate), so it must get a public host before the hosted frontend can
  generate sites. That decision isn't made in this chart. When you make it:

  ```yaml
  services:
    orchestrator-service:
      ingress: { enabled: true, host: orchestrator.useframe.in }
  ```

  The same Ingress, ManagedCertificate (one cert, both domains), BackendConfig (3600 s) and NEG then
  apply. Add the DNS-only A record and set the frontend's `NEXT_PUBLIC_ORCHESTRATOR_URL`.

- **research-service**: retrieval over the research corpus. Internal only. `RESEARCH_MOCK` defaults
  to `"true"` (mock research, labelled as mock). Switch it to `"false"` only once the corpus and the
  `VOYAGE_API_KEY`/`COHERE_API_KEY` are in place: with mock off it checks embedding dimensions at
  startup and fails fast.
- **deploy-service-server**: internal HTTP API that the public API calls to start deployments and
  manage sites. It runs as non-root like everything else.
- **deploy-service-worker**: runs the actual builds of **untrusted, AI-generated user sites**
  (`npm install`/`vite build`). Each build runs as a separate unprivileged user (uid/gid 10002) via
  `setpriv`, with an allowlisted environment, so the build never sees the Cloudflare, R2, database
  or Redis secrets the worker holds. Switching to another uid requires the `SETUID`/`SETGID`
  capabilities, which a non-root process cannot hold. So this pod alone runs as **root with exactly
  `CHOWN, SETUID, SETGID, DAC_OVERRIDE`**, with everything else dropped. It also has no privilege
  escalation, a read-only root filesystem, RuntimeDefault seccomp, no ServiceAccount token, no
  Service, no Ingress, and writable storage only in three size-limited `emptyDir`s (`/work`,
  `/work/.npm-cache`, `/tmp`). That is Pod Security **baseline**, which GKE **Autopilot rejects**,
  so the worker ships `enabled: false` until you confirm a Standard cluster (§1). Then enable it with
  `--set services.deploy-service-worker.enabled=true` or in `values-production.yaml`. Its 900 s grace
  period covers install (5 min) + build (8 min) + upload. On SIGTERM it stops taking jobs and finishes
  in-flight builds, and its health endpoint (`HEALTH_PORT`) stays green while it drains so liveness
  doesn't cut builds short. Builds share the pod network: see the RUNBOOK's "In-cluster reach" note
  and consider `networkPolicy.enabled` on clusters that enforce it.
- **migration hook**: `prisma migrate deploy` with `useframe-migrate`, before every install/upgrade.

## Ingress modes

- **`ingress.className: gce`** (default): GKE-native external Application Load Balancer. GKE selects
  it **only** through the `kubernetes.io/ingress.class: gce` annotation and ignores
  `spec.ingressClassName`, so the chart renders the annotation, the static-IP and
  managed-certificate annotations, a `FrontendConfig` (HTTP→HTTPS redirect, optional SSL policy),
  one `BackendConfig` per exposed Service (health check + `timeoutSec`) and the NEG annotation.
- **Any other class** (e.g. `nginx`): a plain `networking.k8s.io/v1` Ingress with
  `spec.ingressClassName`, your `ingress.annotations` and `ingress.tls`. No GKE resources are
  rendered. Set the controller's own timeout annotation for SSE.

## NetworkPolicy (optional)

`networkPolicy.enabled: true` renders a default-deny-ingress policy per workload. It allows
in-namespace traffic to each Service port, plus Google's load-balancer and health-check ranges
(`130.211.0.0/22`, `35.191.0.0/16`) to exposed workloads. The build worker gets no ingress at all.
Egress stays open. It only has an effect on clusters that enforce NetworkPolicy (Dataplane V2 or the
network-policy add-on).

## Relationship to `infra/k8s/deploy-service/`

The raw manifests there predate this chart. The chart ports their settings: the same securityContext,
`args` (not `command`, so tini stays PID 1), sizes, volumes, grace period and Secret keys. The raw
manifests are **superseded** and kept only for reference. Don't apply both: the Deployment names
differ (`deploy-service-*` vs `useframe-deploy-service-*`), so you would get two workers consuming
the same queue.

## Development (offline checks only)

```bash
helm lint --strict infra/helm/useframe --set global.image.namespace=x --set global.image.tag=sha-0000000
helm template useframe infra/helm/useframe -n useframe -f infra/helm/useframe/values-production.yaml \
  --set global.image.namespace=x --set global.image.tag=sha-0000000 | kubeconform -strict -summary \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
helm unittest infra/helm/useframe
```

CI (`.github/workflows/helm-ci.yml`) runs these on pull requests touching `infra/helm/**`, with
pinned, checksum-verified tool versions. There is no deploy job.
