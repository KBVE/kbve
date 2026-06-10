# ROWS per-tenant deployments

One ROWS process per tenant (game + environment). The DB is shared (`supabase` db, `ows`
schema) and isolated by `customerguid`; each deployment pins its tenant via `OWS_API_KEY`.
The original single-tenant chuck deployment under `apps/kube/rows/manifest/` is unchanged.

## Layout (kustomize base + overlays)

```
tenants/
  base/                     # single source of truth for the per-tenant stack
    deployment.yaml         #   Deployment + Service + PDB (common env)
    seed-job.yaml           #   one-shot Job that runs tenants_init.sql
    tenants_init.sql        #   copy of schema/ows/seed/tenants_init.sql (see drift note)
    kustomization.yaml      #   resources + configMapGenerator(ows-seed)
  overlays/<slug>/          # per-tenant diff only
    namespace.yaml
    kustomization.yaml      #   namespace + ../../base + env patches
    application.yaml        #   ArgoCD Application → this overlay
    sealed-customer-guid.yaml   # (added when sealing — see below)
```

## Tenants

| Tenant slug         | Namespace                | `OWS_ENV` | Agones fleet             | Hostname                |
| ------------------- | ------------------------ | --------- | ------------------------ | ----------------------- |
| `chuckrpg-dev`      | `rows-chuckrpg-dev`      | `dev`     | `rows-chuckrpg-dev`      | `api-dev.chuckrpg.com`  |
| `chuckrpg-beta`     | `rows-chuckrpg-beta`     | `beta`    | `rows-chuckrpg-beta`     | `api-beta.chuckrpg.com` |
| `rentearth-release` | `rows-rentearth-release` | `release` | `rows-rentearth-release` | `api.rentearth.com`     |

`customer_guid` is never committed — generated once per tenant, stored only in that
namespace's sealed `rrows-customer-guid` secret, and read from there by both the ROWS pod
(`OWS_API_KEY`) and the seed Job. New tenant resources use the `rows-*` prefix; chuck's
`ows-*` single-tenant manifests under `apps/kube/rows/manifest/` are untouched.

## Adding a new tenant (e.g. `chuckrpg-release`, `rentearth-dev`)

1. Create `overlays/<slug>/namespace.yaml` (Namespace `rows-<slug>`).
2. Create `overlays/<slug>/kustomization.yaml` — copy an existing overlay and change the
   `namespace`, instance label, and the patch values: `OWS_TENANT_SLUG`, `OWS_ENV`,
   `AGONES_FLEET`, and the seed-job `CUSTOMER_NAME` / `CUSTOMER_EMAIL` / `MAP_NAME` / `ZONE_NAME`.
3. Create `overlays/<slug>/application.yaml` (ArgoCD App → `overlays/<slug>`).
4. Seal the guid (below) and add `sealed-customer-guid.yaml` to the overlay's `resources`.

No `base/` edits, no SQL copy — `base/` is shared. (If the repo later adopts ArgoCD
`ApplicationSet`, these overlays collapse to one list entry per tenant; not used in-repo today.)

## Seal the customer_guid (per tenant)

```sh
SLUG=chuckrpg-dev; NS=rows-chuckrpg-dev
GUID=$(uuidgen | tr 'A-Z' 'a-z')   # generate once; do NOT commit this value
kubectl create secret generic rows-customer-guid \
  --namespace "$NS" --from-literal=customer-guid="$GUID" --dry-run=client -o yaml \
| kubeseal --format yaml --controller-namespace sealed-secrets --controller-name sealed-secrets \
> "overlays/$SLUG/sealed-customer-guid.yaml"
```

Then add `- sealed-customer-guid.yaml` to that overlay's `kustomization.yaml` `resources`.
SealedSecrets are scoped to namespace + name, so each tenant needs its own.

## Seed Job

`base/seed-job.yaml` runs `tenants_init.sql` against the shared DB, pulling `customer_guid`
from the sealed secret and `CUSTOMER_*` / `MAP_NAME` / `ZONE_NAME` from the overlay. Idempotent
(`WHERE NOT EXISTS`), so it re-runs harmlessly on every sync. This replaces the manual
gameops `psql` step.

### Seed SQL drift guard

`base/tenants_init.sql` is a copy of `packages/data/sql/schema/ows/seed/tenants_init.sql`
(kustomize cannot read files outside its root). `nx run data-sql:verify-seed-sync` diffs the
two and fails if they diverge — run it in CI / before merge. Update both together.

## Wired in `base/` + overlays

- **Secrets**: ServiceAccounts `rows-external-secrets` / `rows-instancelauncher`; SecretStores
  (kilobase, rabbitmq) + ExternalSecrets → `rows-db-credentials`, `rows-rabbitmq-credentials`,
  `rows-supabase-jwt`. Cross-ns read RBAC for these SAs is appended in
  `apps/kube/kilobase/manifests/cross-namespace-rbac.yaml` + `apps/kube/rabbitmq/manifests/cross-namespace-rbac.yaml`.
- **Sealed**: `rows-customer-guid` + `rows-encryption-key` are committed as STUBS per overlay —
  replace via kubeseal before deploy (below).
- **Routing**: per-tenant `Certificate` + `HTTPRoute` (overlay patches the hostname), `ReferenceGrant`,
  and a gateway listener in `apps/kube/kbve/manifest/kbve-gateway.yaml`.

## Steps you must do per tenant (cannot be committed)

1. **Seal** `rows-customer-guid` (+ `rows-encryption-key`) — replace the stub (below).
2. **DNS** — add an A/CNAME for the tenant hostname (e.g. `api-dev.chuckrpg.com`) to the gateway VIP,
   or the Certificate stays `Pending` (ACME HTTP-01) and the listener won't serve.

## Deferred to a later PR

- **Agones**: per-tenant `Fleet` + `FleetAutoscaler` + gameserver/service-key ExternalSecrets in
  `arc-runners`. **Blocked**: a fleet needs a per-tenant UE5 `LinuxServer` build on a
  `rows-<slug>-server-build` PVC — that build pipeline does not exist yet for dev/beta/rentearth.
  Until then the ROWS API runs but no game servers allocate.

## Register the ArgoCD Applications

```sh
kubectl apply -f apps/kube/rows/tenants/overlays/chuckrpg-dev/application.yaml
kubectl apply -f apps/kube/rows/tenants/overlays/chuckrpg-beta/application.yaml
kubectl apply -f apps/kube/rows/tenants/overlays/rentearth-release/application.yaml
```
