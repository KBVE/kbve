# Cube Phase B (ArgoCD k8s service) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deploy Cube as a cluster-native ArgoCD service under `apps/kube/cube/`, using the `gadsme/cube` + `gadsme/cubestore` Helm charts, serving the Phase-A data models over the in-cluster Postgres (kilobase) + ClickHouse, with pre-aggregations in Cube Store.

**Architecture:** One ArgoCD Application, multi-source: the two gadsme Helm charts (values from repo via `$values`), plus a repo path (kustomize) for the schema ConfigMap + external-secrets wiring. Models are delivered as a ConfigMap (kustomize `configMapGenerator` from `apps/kube/cube/model/*.yml`) mounted at `/cube/conf/model`. DB credentials come from existing cluster secrets via external-secrets. In-cluster ClusterIP Service only (no ingress this phase).

**Tech Stack:** ArgoCD, Helm (`gadsme/cube` v3.3.0 / `gadsme/cubestore` v1.2.0, appVersion Cube 1.5.3), external-secrets, kustomize, Longhorn (`longhorn-sdb`).

## Global Constraints

- Cube image pinned via chart appVersion **1.5.3** (chart-default) — do NOT use `latest`. If overriding `image.tag`, pin an exact version.
- Namespace: `cube`. ArgoCD `Application` in `argocd` namespace, matching `apps/kube/cnpg/application.yaml` conventions (`kbve.com/*` annotations, `sources` with `$values` ref, `syncPolicy` automated/selfHeal/prune, `CreateNamespace=true`, `ServerSideApply=true`).
- Postgres (default datasource): host `kilobase-rw.kilobase.svc`, port `5432`, database `supabase`, user `postgres`, password from secret (external-secrets). Pool small: `maxPool: 3`.
- ClickHouse (named datasource `clickhouse`): host `clickhouse-clickhouse-cluster.clickhouse.svc`, port `8123`, user `default`, password from secret. Renders as `CUBEJS_DS_CLICKHOUSE_*` via the chart's `cube.env.decorated`.
- `CUBEJS_DATASOURCES=default,clickhouse`, `CUBEJS_DEV_MODE=false`, `CUBEJS_TESSERACT_SQL_PLANNER=false` (required for cross-source rollup_join — verify still needed on 1.5.3), via `extraEnvVars`.
- Cube Store PVC on storageClass `longhorn-sdb`.
- Secrets never committed. External-secrets pulls PG password from `supabase-postgres` (ns kilobase, key `password`) and ClickHouse password from `clickhouse-admin-credentials` (ns clickhouse, key `password`). `CUBEJS_API_SECRET` from a committed SealedSecret or generated ExternalSecret target — never plaintext.
- ArgoCD Apps track `main`; this lands on `dev` via PR, then dev→main, then ArgoCD reconciles. No `kubectl apply`.
- No "Co-Authored-By"/"Generated with Claude Code" commit trailer.

## File Structure

```
apps/kube/cube/
  application.yaml              # ArgoCD Application (multi-source)
  manifests/
    kustomization.yaml         # configMapGenerator (schema) + resources (externalsecret, service)
    cube-values.yaml           # gadsme/cube helm values
    cubestore-values.yaml      # gadsme/cubestore helm values
    external-secret.yaml       # SA + SecretStores + ExternalSecret -> cube-db-credentials
  model/                       # (already merged in Phase A) 4 .yml cubes
```

`apps/kube/kustomization.yaml` gains the `apps/kube/cube/application.yaml` registration.

---

### Task 1: External-secrets — sync DB credentials into the `cube` namespace

**Files:**
- Create: `apps/kube/cube/manifests/external-secret.yaml`

**Interfaces:**
- Produces: a Kubernetes Secret `cube-db-credentials` (ns `cube`) with keys `pg-password`, `ch-password`, `api-secret`. The chart's `passFromSecret` / `apiSecretFromSecret` reference these.

- [ ] **Step 1: Write the external-secrets manifest**

Model on `apps/kube/discordsh/manifest/discordsh-externalsecret.yaml` (per-namespace `kubernetes`-provider SecretStore + dedicated ServiceAccount). Two SecretStores (kilobase + clickhouse remote namespaces) and one ExternalSecret assembling all three keys. `api-secret` is a fixed value here is NOT allowed (no plaintext) — instead generate it as a SealedSecret in Task 1a OR source from an existing secret. Use this shape:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cube-external-secrets
  namespace: cube
---
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: cube-kilobase-store
  namespace: cube
spec:
  provider:
    kubernetes:
      remoteNamespace: kilobase
      auth:
        serviceAccount:
          name: cube-external-secrets
          namespace: cube
      server:
        url: https://kubernetes.default.svc
        caProvider:
          type: ConfigMap
          name: kube-root-ca.crt
          key: ca.crt
          namespace: kube-system
---
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: cube-clickhouse-store
  namespace: cube
spec:
  provider:
    kubernetes:
      remoteNamespace: clickhouse
      auth:
        serviceAccount:
          name: cube-external-secrets
          namespace: cube
      server:
        url: https://kubernetes.default.svc
        caProvider:
          type: ConfigMap
          name: kube-root-ca.crt
          key: ca.crt
          namespace: kube-system
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cube-pg-credentials
  namespace: cube
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: cube-kilobase-store
    kind: SecretStore
  target:
    name: cube-db-credentials
    creationPolicy: Merge
  data:
    - secretKey: pg-password
      remoteRef:
        key: supabase-postgres
        property: password
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cube-ch-credentials
  namespace: cube
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: cube-clickhouse-store
    kind: SecretStore
  target:
    name: cube-db-credentials
    creationPolicy: Merge
  data:
    - secretKey: ch-password
      remoteRef:
        key: clickhouse-admin-credentials
        property: password
```

Note: both ExternalSecrets target `cube-db-credentials` with `creationPolicy: Merge` so they co-populate one Secret. The `api-secret` key is added in Task 1a.

Also grant the `cube-external-secrets` SA RBAC to read secrets in the remote namespaces — mirror exactly how the discordsh manifest grants it (Role/RoleBinding in kilobase; replicate for clickhouse). Copy that RBAC shape from the discordsh reference file into this manifest.

- [ ] **Step 2: Verify manifest renders**

Run: `kubectl --dry-run=client -o yaml apply -f apps/kube/cube/manifests/external-secret.yaml`
Expected: valid YAML, no schema errors. (Live sync verified post-ArgoCD in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add apps/kube/cube/manifests/external-secret.yaml
git commit -m "feat(cube): external-secrets for db credentials"
```

---

### Task 1a: API secret via SealedSecret

**Files:**
- Create: `apps/kube/cube/manifests/api-secret-sealed.yaml`
- Modify: `apps/kube/cube/manifests/external-secret.yaml` (add `api-secret` merge — OR fold into the SealedSecret's own target)

**Interfaces:**
- Produces: `api-secret` key present in `cube-db-credentials` (or a dedicated `cube-api-secret` Secret the chart references).

- [ ] **Step 1: Generate + seal the API secret**

Use the repo's sealing tooling (mirror `apps/kube/kilobase/seal-*.sh` or the sealed-secrets controller). Generate a random 32-byte hex, create a Secret `cube-api-secret` (ns `cube`, key `api-secret`), seal it with `kubeseal` against the cluster's sealed-secrets controller, write the SealedSecret to `api-secret-sealed.yaml`. Do NOT commit the plaintext.

Run: `openssl rand -hex 32` → feed into `kubectl create secret generic cube-api-secret -n cube --from-literal=api-secret=<hex> --dry-run=client -o yaml | kubeseal ... -o yaml > apps/kube/cube/manifests/api-secret-sealed.yaml`

- [ ] **Step 2: Verify SealedSecret shape**

Run: `grep -q 'kind: SealedSecret' apps/kube/cube/manifests/api-secret-sealed.yaml && echo OK`
Expected: `OK`, and no plaintext `api-secret` value in git.

- [ ] **Step 3: Commit**

```bash
git add apps/kube/cube/manifests/api-secret-sealed.yaml
git commit -m "feat(cube): sealed api secret"
```

---

### Task 2: Schema ConfigMap via kustomize + Service

**Files:**
- Create: `apps/kube/cube/manifests/kustomization.yaml`
- Create: `apps/kube/cube/manifests/service.yaml`

**Interfaces:**
- Consumes: `apps/kube/cube/model/*.yml` (Phase A).
- Produces: ConfigMap `cube-schema` (the 4 model files) + ClusterIP Service `cube-api` (port 4000). The cube-values mounts `cube-schema` at `/cube/conf/model`.

- [ ] **Step 1: Write kustomization with configMapGenerator**

`apps/kube/cube/manifests/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: cube
resources:
  - external-secret.yaml
  - api-secret-sealed.yaml
  - service.yaml
configMapGenerator:
  - name: cube-schema
    files:
      - ../model/ch_logs.yml
      - ../model/ch_mc_snapshots.yml
      - ../model/pg_mc_player.yml
      - ../model/pg_users.yml
generatorOptions:
  disableNameSuffixHash: true
```

`disableNameSuffixHash: true` keeps the ConfigMap name stable (`cube-schema`) so the chart's volume reference is fixed. (Trade-off: pod restart on model change must be triggered by ArgoCD sync / rollout; acceptable — refresh worker reloads.)

- [ ] **Step 2: Write the Service**

`apps/kube/cube/manifests/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: cube-api
  namespace: cube
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: cube
    app.kubernetes.io/component: api
  ports:
    - name: http
      port: 4000
      targetPort: 4000
```

Note: confirm the chart's API pod labels in Task 5's `helm template` render; adjust the selector to match the chart's actual labels if different. (The gadsme chart may already create its own Service — if so, DROP this file and use the chart's Service instead; decide in Task 5.)

- [ ] **Step 3: Verify kustomize builds**

Run: `kubectl kustomize apps/kube/cube/manifests/`
Expected: renders the ConfigMap `cube-schema` with all 4 model files inlined, the Service, external-secret, and sealed secret. No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/manifests/kustomization.yaml apps/kube/cube/manifests/service.yaml
git commit -m "feat(cube): schema configmap generator + api service"
```

---

### Task 3: Cube Store Helm values

**Files:**
- Create: `apps/kube/cube/manifests/cubestore-values.yaml`

**Interfaces:**
- Produces: a Cube Store deployment (router + workers) with a `longhorn-sdb` PVC. Cube API/worker connect to it via its Service DNS (used in Task 4's `CUBEJS_CUBESTORE_HOST`).

- [ ] **Step 1: Fetch the cubestore chart's values reference**

Run: `curl -sf https://raw.githubusercontent.com/gadsme/charts/main/charts/cubestore/values.yaml | sed -n '1,120p'`
Read it to learn the exact keys for: router/worker replicas, persistence (storageClass, size), resources, and the router Service name.

- [ ] **Step 2: Write cubestore-values.yaml**

Set: 1 router, 1–2 workers (sufficient for current rollup volume), persistence enabled on `storageClass: longhorn-sdb` sized ~10Gi (revisit from real rollup volume), modest resources. Use the exact keys discovered in Step 1 — do NOT guess key names.

- [ ] **Step 3: Verify render**

Run: `helm template cubestore gadsme/cubestore -f apps/kube/cube/manifests/cubestore-values.yaml` (after `helm repo add gadsme https://gadsme.github.io/charts && helm repo update`)
Expected: renders a StatefulSet/Deployment with the `longhorn-sdb` PVC and a router Service; note the router Service DNS name for Task 4.

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/manifests/cubestore-values.yaml
git commit -m "feat(cube): cubestore helm values (longhorn-sdb pvc)"
```

---

### Task 4: Cube Helm values (datasources, env, schema mount)

**Files:**
- Create: `apps/kube/cube/manifests/cube-values.yaml`

**Interfaces:**
- Consumes: `cube-db-credentials` secret (Task 1), `cube-api-secret` (Task 1a), `cube-schema` ConfigMap (Task 2), cubestore router Service (Task 3).
- Produces: Cube API + refresh-worker deployments wired to both datasources, Cube Store, and the schema mount.

- [ ] **Step 1: Write cube-values.yaml**

```yaml
image:
  # chart appVersion pins Cube 1.5.3; omit tag to use it, or pin explicitly:
  tag: "v1.5.3"

config:
  devMode: false
  logLevel: "warn"
  telemetry: false
  schemaPath: "model"          # loads from /cube/conf/model
  cacheAndQueueDriver: cubestore
  apiSecretFromSecret:
    name: cube-api-secret
    key: api-secret
  # mount the schema ConfigMap into api + worker
  volumes:
    - name: schema
      configMap:
        name: cube-schema
  volumeMounts:
    - name: schema
      readOnly: true
      mountPath: /cube/conf/model

cubestore:
  # point Cube at the cubestore router Service (name from Task 3 Step 3)
  host: <cubestore-router-service-dns>

extraEnvVars:
  - name: CUBEJS_DATASOURCES
    value: "default,clickhouse"
  - name: CUBEJS_TESSERACT_SQL_PLANNER
    value: "false"

datasources:
  default:
    type: postgres
    host: kilobase-rw.kilobase.svc
    port: 5432
    name: supabase
    user: postgres
    maxPool: 3
    passFromSecret:
      name: cube-db-credentials
      key: pg-password
  clickhouse:
    type: clickhouse
    host: clickhouse-clickhouse-cluster.clickhouse.svc
    port: 8123
    user: default
    passFromSecret:
      name: cube-db-credentials
      key: ch-password

api:
  replicas: 2
worker:
  replicas: 1
```

Adjust `cubestore.host`, the exact `cubestore:` value key, and `api`/`worker`/`schemaPath` key names to the chart's real schema (verified in Task 5). The chart's `cube.env.decorated` renders `datasources.clickhouse` as `CUBEJS_DS_CLICKHOUSE_*`.

- [ ] **Step 2: Render + verify the env is correct (critical)**

Run: `helm template cube gadsme/cube -f apps/kube/cube/manifests/cube-values.yaml | grep -E 'CUBEJS_DB_|CUBEJS_DS_CLICKHOUSE_|CUBEJS_TESSERACT|CUBEJS_DATASOURCES|CUBEJS_CUBESTORE_HOST|secretKeyRef|mountPath'`
Expected: `CUBEJS_DB_HOST=kilobase-rw...`, `CUBEJS_DB_NAME=supabase`, `CUBEJS_DS_CLICKHOUSE_DB_HOST=clickhouse-clickhouse-cluster...`, `CUBEJS_TESSERACT_SQL_PLANNER=false`, `CUBEJS_DATASOURCES=default,clickhouse`, cubestore host set, `secretKeyRef` for both passwords + api secret, and the schema volume mounted at `/cube/conf/model`. Fix values until this render is correct.

- [ ] **Step 3: Commit**

```bash
git add apps/kube/cube/manifests/cube-values.yaml
git commit -m "feat(cube): cube helm values (datasources, tesseract off, schema mount)"
```

---

### Task 5: ArgoCD Application + registration

**Files:**
- Create: `apps/kube/cube/application.yaml`
- Modify: `apps/kube/kustomization.yaml` (register the app)

**Interfaces:**
- Produces: an ArgoCD `Application` that syncs cubestore + cube charts + the manifests kustomize dir into ns `cube`.

- [ ] **Step 1: Write application.yaml (multi-source)**

Mirror `apps/kube/cnpg/application.yaml`. Sources:
1. `repoURL: https://gadsme.github.io/charts`, `chart: cubestore`, `targetRevision: 1.2.0`, helm `releaseName: cubestore`, `valueFiles: [$values/apps/kube/cube/manifests/cubestore-values.yaml]`.
2. `repoURL: https://gadsme.github.io/charts`, `chart: cube`, `targetRevision: 3.3.0`, helm `releaseName: cube`, `valueFiles: [$values/apps/kube/cube/manifests/cube-values.yaml]`.
3. `repoURL: https://github.com/kbve/kbve`, `targetRevision: main`, `path: apps/kube/cube/manifests` (kustomize: configmap + externalsecret + sealed secret + service).
4. `repoURL: https://github.com/kbve/kbve`, `targetRevision: main`, `ref: values`.

`destination.namespace: cube`, `syncPolicy` automated/selfHeal/prune + `CreateNamespace=true`, `ServerSideApply=true`, retry. Add `kbve.com/*` annotations (`category: observability`, `stack: core`).

Note: source 3 (kustomize) must NOT also try to template the helm charts — keep the kustomize `resources` limited to the raw manifests. Confirm ArgoCD renders sources independently.

- [ ] **Step 2: Register in the app-of-apps**

Add `apps/kube/cube/application.yaml` to `apps/kube/kustomization.yaml` resources (match how other apps are listed).

- [ ] **Step 3: Verify YAML + kustomize**

Run: `kubectl --dry-run=client -o yaml apply -f apps/kube/cube/application.yaml >/dev/null && echo APP_OK`
Run: `kubectl kustomize apps/kube/ >/dev/null && echo ROOT_OK`
Expected: both `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/kube/cube/application.yaml apps/kube/kustomization.yaml
git commit -m "feat(cube): argocd application + app-of-apps registration"
```

---

### Task 6: Ship + verify sync

**Files:** none (integration).

- [ ] **Step 1: PR to dev**

Push branch, open PR → `dev`. Include the docs link per repo convention.

- [ ] **Step 2: After dev→main merge, watch ArgoCD reconcile**

The Apps track `main`. Once merged to main, ArgoCD auto-syncs. Verify:
```bash
kubectl get application cube -n argocd -o jsonpath='{.status.sync.status} {.status.health.status}'
kubectl get pods -n cube
kubectl get externalsecret -n cube
kubectl get pvc -n cube
```
Expected: Application `Synced`/`Healthy`; cube-api (2), cube-worker (1), cubestore pods Running; `cube-db-credentials` secret populated (both keys); PVC bound on `longhorn-sdb`.

- [ ] **Step 3: Validate the models in-cluster (incl. re-verify Tesseract/rollup_join on 1.5.3)**

```bash
kubectl port-forward -n cube svc/cube-api 4000:4000 &
curl -sf localhost:4000/cubejs-api/v1/meta | python3 -c 'import sys,json;print(sorted(c["name"] for c in json.load(sys.stdin)["cubes"]))'
# pg + ch + federated queries (same as Phase A)
```
Expected: 4 cubes; `pg_users.count` 42; `ch_logs.count` ~17M served from a pre-agg; federated `rollup_join` executes (uses both rollups). If rollup_join fails on 1.5.3 without the Tesseract flag change, adjust `cube-values.yaml` extraEnvVars and re-sync.

- [ ] **Step 4: Update spec status**

Mark Phase B live in `docs/superpowers/specs/2026-07-18-cube-semantic-layer-design.md`; note the resolved cubestore host + any chart-key corrections. Commit.

---

## Self-Review

- **Coverage:** ArgoCD app ✓ (T5), gadsme cube+cubestore charts ✓ (T3/T4/T5), models via kustomize configMapGenerator ✓ (T2), external-secrets from existing secrets ✓ (T1), API secret sealed ✓ (T1a), in-cluster Service only ✓ (T2, no ingress), Tesseract flag + datasource env verified by `helm template` ✓ (T4 Step 2), PVC on `longhorn-sdb` ✓ (T3), pinned versions ✓ (constraints), sync-not-apply ✓ (T6).
- **Placeholder scan:** `<cubestore-router-service-dns>` and the chart-key adjustments are explicitly resolved by the `helm template` / values-reference steps (T3 Step 1/3, T4 Step 2) before commit — each carries a discovery command, not a lazy TBD.
- **Consistency:** secret `cube-db-credentials` keys `pg-password`/`ch-password` referenced identically in T1 and T4; `cube-api-secret`/`api-secret` in T1a and T4; ConfigMap `cube-schema` + mount `/cube/conf/model` consistent T2↔T4; namespace `cube` throughout.

## Open items to confirm during execution (not blockers)

1. Whether the gadsme `cube` chart ships its own Service (then drop `service.yaml`) — resolved in T5 render.
2. Exact `cubestore` host value key + whether the cube chart auto-wires it when both are in one release namespace — resolved in T3/T4 renders.
3. Whether Cube 1.5.3 still needs `CUBEJS_TESSERACT_SQL_PLANNER=false` for rollup_join — resolved in T6 Step 3 (adjust + re-sync if not).
