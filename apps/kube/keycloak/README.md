# Keycloak — central SSO / OIDC provider

Keycloak is the identity provider for KBVE single sign-on. It is a real
OAuth2 / OIDC **authorization server** — the capability self-hosted Supabase
Auth (GoTrue) does **not** have (GoTrue can only consume external providers,
not act as one for third-party apps like Forgejo).

```
Keycloak (sso.kbve.com, IdP / OAuth provider)
   ├── Forgejo   → OIDC client   (replaces the dead GoTrue oauth-register job)
   └── Supabase  → OIDC client   (GOTRUE_EXTERNAL_KEYCLOAK_*)
```

- **Image**: `quay.io/keycloak/keycloak:26.0`, production `start` mode
- **DB**: `keycloak` schema on the kilobase CNPG cluster (`supabase` database),
  role + password managed by CNPG, schema by a dbmate migration
- **Ingress**: `sso.kbve.com` via `kbve-gateway` (TLS terminates at the gateway;
  Keycloak runs plain HTTP with `KC_PROXY_HEADERS=xforwarded`)

## Deploy runbook

No manual `psql` — the `keycloak` role, schema, and password are all GitOps.

| Concern | Owner |
|---------|-------|
| `keycloak` role + password | CNPG `managed.roles` on `supabase-cluster` (reads `keycloak-db-password`) |
| `keycloak` schema + grants | dbmate migration `20260625120000_keycloak_schema.sql` (runs as `postgres`) |
| pod DB auth + bootstrap admin | `keycloak-credentials` secret (this dir) |

The migration is order-independent: it creates the role `NOLOGIN` with no
password if absent; CNPG then layers `login: true` + the password from the
sealed secret. Either reconcile order converges.

### 1. Seal credentials

```bash
./apps/kube/keycloak/seal-credentials.sh   # generates a random DB password
```
Writes **two** sealed files from one generated password (so they always agree)
and prints the bootstrap admin creds — **save them**, they are not recoverable
from the sealed file:

```
apps/kube/kilobase/manifests/sealed-keycloak-db-password.yaml   # CNPG, ns kilobase
apps/kube/keycloak/manifest/sealed-credentials.yaml             # pod,  ns keycloak
```
```bash
git add apps/kube/kilobase/manifests/sealed-keycloak-db-password.yaml \
        apps/kube/keycloak/manifest/sealed-credentials.yaml
```
The committed `sealed-credentials.yaml` placeholder is **not** valid — Keycloak
will not start until you regenerate it and commit the result.

### 2. Go live

Both `keycloak/application.yaml` and the kilobase CNPG change track `main`, so
land them via the dev→main release. On sync: CNPG creates the role, the
`dbmate-up` CI job applies the schema migration, and Keycloak builds its tables
on first boot (slow — watch the startup probe).

## Phase 2 — wire the clients (after Keycloak is up)

1. Log into `https://sso.kbve.com` with the bootstrap admin, create a realm
   (e.g. `kbve`).
2. **Forgejo client**: OIDC, confidential, redirect
   `https://forgejo.kbve.com/user/oauth2/keycloak/callback`. Configure Forgejo's
   OAuth2 source to point at the Keycloak issuer
   `https://sso.kbve.com/realms/kbve`. This replaces the removed
   `forgejo-oauth-register` GoTrue job.
3. **Supabase client**: OIDC, confidential, redirect
   `https://supabase.kbve.com/auth/v1/callback`. Set
   `GOTRUE_EXTERNAL_KEYCLOAK_ENABLED=true`,
   `GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID`,
   `GOTRUE_EXTERNAL_KEYCLOAK_SECRET`,
   `GOTRUE_EXTERNAL_KEYCLOAK_URL=https://sso.kbve.com/realms/kbve`,
   `GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI` on the supabase-auth deployment
   (`apps/kube/auth/manifests/supabase-gotrue-auth.yaml`).
