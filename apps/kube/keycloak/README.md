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
- **DB**: `keycloak` schema on the kilobase CNPG cluster (`supabase` database)
- **Ingress**: `sso.kbve.com` via `kbve-gateway` (TLS terminates at the gateway;
  Keycloak runs plain HTTP with `KC_PROXY_HEADERS=xforwarded`)

## Deploy runbook

### 1. Database (kilobase CNPG)

Create the schema + user (mirrors the forgejo pattern):

```bash
kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
```
```sql
CREATE SCHEMA IF NOT EXISTS keycloak;
CREATE USER keycloak WITH PASSWORD '<db-password>';
GRANT ALL ON SCHEMA keycloak TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON TABLES TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA keycloak GRANT ALL ON SEQUENCES TO keycloak;
```

### 2. Seal credentials

```bash
./apps/kube/keycloak/seal-credentials.sh   # prompts for db + admin creds
git add apps/kube/keycloak/manifest/sealed-credentials.yaml
```
The committed `sealed-credentials.yaml` placeholder is **not** valid — Keycloak
will not start until you regenerate it with the script and commit the result.

### 3. Go live

`keycloak/application.yaml` is wired into `apps/kube/kustomization.yaml`. Once
the schema exists and the sealed secret is committed + synced to `main`,
ArgoCD brings Keycloak up. First boot runs the Keycloak build + DB migration
(slow — watch the startup probe).

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
