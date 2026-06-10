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

| Tenant slug         | Namespace                | `OWS_ENV` | Agones fleet            |
| ------------------- | ------------------------ | --------- | ----------------------- |
| `chuckrpg-dev`      | `rows-chuckrpg-dev`      | `dev`     | `ows-chuckrpg-dev`      |
| `chuckrpg-beta`     | `rows-chuckrpg-beta`     | `beta`    | `ows-chuckrpg-beta`     |
| `rentearth-release` | `rows-rentearth-release` | `release` | `ows-rentearth-release` |

`customer_guid` is never committed — generated once per tenant, stored only in that
namespace's sealed `ows-customer-guid` secret, and read from there by both the ROWS pod
(`OWS_API_KEY`) and the seed Job.

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
kubectl create secret generic ows-customer-guid \
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

## Deferred to follow-up (edge)

- **Secrets per namespace**: `ows-customer-guid` (sealed), `ows-db-credentials`,
  `ows-rabbitmq-credentials`, `rows-supabase-jwt` (ExternalSecrets, as in `manifest/externalsecret.yaml`).
  Pods + seed Job stay pending until these exist.
- **Agones**: per-tenant `Fleet` + `FleetAutoscaler` under `apps/kube/agones/rows/`, plus
  `ows-instancelauncher` ServiceAccount + cross-ns RBAC.
- **Public routing**: per-tenant `HTTPRoute` + `Certificate` + gateway listener.

## Register the ArgoCD Applications

```sh
kubectl apply -f apps/kube/rows/tenants/overlays/chuckrpg-dev/application.yaml
kubectl apply -f apps/kube/rows/tenants/overlays/chuckrpg-beta/application.yaml
kubectl apply -f apps/kube/rows/tenants/overlays/rentearth-release/application.yaml
```
