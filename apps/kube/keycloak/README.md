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
- **DB**: `keycloak` role + schema on the kilobase CNPG cluster (`supabase`
  database), provisioned by an idempotent ArgoCD Sync-hook Job
- **Ingress**: `sso.kbve.com` via `kbve-gateway` (TLS terminates at the gateway;
  Keycloak runs plain HTTP with `KC_PROXY_HEADERS=xforwarded`)

## Deploy runbook

No manual `psql` — the `keycloak` role, password, and schema are all GitOps,
owned by a single idempotent Job.

| Concern | Owner |
|---------|-------|
| `keycloak` role + password + schema + grants | `keycloak-db-provision` Job (ArgoCD Sync hook, ns kilobase) |
| pod DB auth + bootstrap admin | `keycloak-credentials` secret (this dir) |

`apps/kube/kilobase/manifests/keycloak-db-provision-job.yaml` runs on every
kilobase sync (`hook: Sync`, `hook-delete-policy: BeforeHookCreation`). It
connects as the superuser (`supabase-postgres`) and runs idempotent SQL:
`CREATE ROLE keycloak LOGIN` if absent, `ALTER ROLE ... PASSWORD` from the
sealed `keycloak-db-password` secret (so it always matches the pod's
`keycloak-credentials`), then `CREATE SCHEMA ... AUTHORIZATION keycloak` +
grants. Re-running after a credential reseal re-syncs the password. Keycloak
then builds its own tables on first boot.

This replaces the earlier CNPG `managed.roles` + dbmate-migration split, which
left the role passwordless in practice (CNPG did not enforce the password and
the dbmate-up Job never fired).

### 1. Seal credentials

```bash
./apps/kube/keycloak/seal-credentials.sh   # generates a random DB password
```
Writes **two** sealed files from one generated password (so they always agree)
and prints the bootstrap admin creds — **save them**, they are not recoverable
from the sealed file:

```
apps/kube/kilobase/manifests/sealed-keycloak-db-password.yaml   # provision Job, ns kilobase
apps/kube/keycloak/manifest/sealed-credentials.yaml             # pod,          ns keycloak
```
```bash
git add apps/kube/kilobase/manifests/sealed-keycloak-db-password.yaml \
        apps/kube/keycloak/manifest/sealed-credentials.yaml
```
The committed `sealed-credentials.yaml` placeholder is **not** valid — Keycloak
will not start until you regenerate it and commit the result.

### 2. Go live

Both `keycloak/application.yaml` and the kilobase manifests track `main`, so
land them via the dev→main release. On sync: the `keycloak-db-provision` Sync
hook creates the role/password/schema, then Keycloak builds its tables on first
boot (slow — watch the startup probe).

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
