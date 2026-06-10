# ROWS per-tenant deployments

One ROWS process per tenant (game + environment). The DB is shared (`supabase` db, `ows`
schema) and isolated by `customerguid`; each deployment pins its tenant via `OWS_API_KEY`.
The original single-tenant chuck deployment under `apps/kube/rows/manifest/` is unchanged.

## Tenants

| Tenant slug         | Namespace                | `OWS_ENV` | Agones fleet            | `customer_guid` source     |
| ------------------- | ------------------------ | --------- | ----------------------- | -------------------------- |
| `chuckrpg-dev`      | `rows-chuckrpg-dev`      | `dev`     | `ows-chuckrpg-dev`      | sealed `ows-customer-guid` |
| `chuckrpg-beta`     | `rows-chuckrpg-beta`     | `beta`    | `ows-chuckrpg-beta`     | sealed `ows-customer-guid` |
| `rentearth-release` | `rows-rentearth-release` | `release` | `ows-rentearth-release` | sealed `ows-customer-guid` |

The `customer_guid` is never committed. It is generated once per tenant, stored only in the
tenant's sealed secret (`ows-customer-guid`, key `customer-guid`), and read from there both by
the ROWS pod (`OWS_API_KEY`) and by the seed step below. This mirrors the chuck convention —
`packages/data/sql/schema/ows/seed/*.sql` carry no secrets.

## In this PR (lean core)

Per tenant: `namespace.yaml`, `rows-deployment.yaml` (Deployment + Service + PDB),
`application.yaml` (ArgoCD Application). Pods stay `Pending`/`CreateContainerConfigError`
until the secrets below exist — expected; secrets + edge are the follow-up.

## Deferred to follow-up (edge)

- **Secrets per namespace**: `ows-customer-guid` (sealed), `ows-db-credentials`,
  `ows-rabbitmq-credentials`, `rows-supabase-jwt` (ExternalSecrets, as in `manifest/externalsecret.yaml`).
- **Agones**: per-tenant `Fleet` + `FleetAutoscaler` (`ows-chuckrpg-dev` / `-beta` / `ows-rentearth-release`)
  under `apps/kube/agones/rows/`, plus `ows-instancelauncher` ServiceAccount + cross-ns RBAC.
- **Public routing**: per-tenant `HTTPRoute` + `Certificate` + gateway listener
  (e.g. `api-dev.chuckrpg.com`, `api-beta.chuckrpg.com`, `api.rentearth.com`).

## Provision a tenant (per namespace)

### 1. Generate + seal the customer_guid

The GUID is the source of truth and lives only in the sealed secret. Generate once per tenant:

```sh
TENANT=chuckrpg-dev
NS=rows-chuckrpg-dev
GUID=$(uuidgen | tr 'A-Z' 'a-z')   # generate once; do NOT commit this value

kubectl create secret generic ows-customer-guid \
  --namespace "$NS" \
  --from-literal=customer-guid="$GUID" \
  --dry-run=client -o yaml \
| kubeseal --format yaml \
  --controller-namespace sealed-secrets --controller-name sealed-secrets \
> "$TENANT/manifest/sealed-customer-guid.yaml"
```

Commit the generated `sealed-customer-guid.yaml` into each tenant's `manifest/` dir (SealedSecrets
are scoped to their namespace + name, so chuck's existing blob cannot be reused). The plaintext
GUID never leaves your shell.

### 2. Seed the Customer/Map rows

Pull the GUID back from the applied secret and run the parameterized seed (no GUID in VCS):

```sh
kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
GUID=$(kubectl get secret ows-customer-guid -n "$NS" -o jsonpath='{.data.customer-guid}' | base64 -d)

# Pass raw values (no surrounding single quotes) — the :'var' form quotes them.
PGPASSWORD=<pass> psql -h localhost -p 54322 -U ows -d supabase \
  -v customer_guid="${GUID}" \
  -v customer_name="ChuckRPG Dev" \
  -v customer_email="admin@chuckrpg.com" \
  -v map_name="Lvl_ThirdPerson" \
  -v zone_name="MainWorld" \
  -f packages/data/sql/schema/ows/seed/tenants_init.sql
```

Per-tenant seed parameters:

| Tenant              | `customer_name` | `customer_email`      | `map_name`        | `zone_name` |
| ------------------- | --------------- | --------------------- | ----------------- | ----------- |
| `chuckrpg-dev`      | `ChuckRPG Dev`  | `admin@chuckrpg.com`  | `Lvl_ThirdPerson` | `MainWorld` |
| `chuckrpg-beta`     | `ChuckRPG Beta` | `admin@chuckrpg.com`  | `Lvl_ThirdPerson` | `MainWorld` |
| `rentearth-release` | `RentEarth`     | `admin@rentearth.com` | `Lvl_Entry`       | `Origin`    |

The seed is idempotent (skips an already-seeded customer).

### 3. Register the ArgoCD Application

```sh
kubectl apply -f apps/kube/rows/tenants/chuckrpg-dev/application.yaml
kubectl apply -f apps/kube/rows/tenants/chuckrpg-beta/application.yaml
kubectl apply -f apps/kube/rows/tenants/rentearth-release/application.yaml
```
