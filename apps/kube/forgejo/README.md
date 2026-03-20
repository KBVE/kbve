# Forgejo — Git LFS + Actions

Self-hosted Git forge for LFS storage (UE game assets on sdb) and CI.

## Prerequisites

### 1. Create database schema + user

Connect to the CNPG cluster and create the Forgejo schema:

```bash
kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432
```

```sql
CREATE SCHEMA IF NOT EXISTS forgejo;
CREATE USER forgejo WITH PASSWORD '<password>';
GRANT ALL ON SCHEMA forgejo TO forgejo;
ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo GRANT ALL ON TABLES TO forgejo;
ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo GRANT ALL ON SEQUENCES TO forgejo;
```

### 2. Create admin secret

```bash
kubectl create namespace forgejo
kubectl create secret generic forgejo-admin \
  --namespace forgejo \
  --from-literal=username=kbve-admin \
  --from-literal=password=<your-password> \
  --from-literal=email=admin@kbve.com
```

### 3. Create database credential secret

The database password needs to be available to Forgejo. Update the
`PASSWD` field in `application.yaml` or use an ExternalSecret.

## Post-Deploy Setup

### Add SSH keys

```bash
kubectl port-forward svc/forgejo-http -n forgejo 3000:3000
# Open http://localhost:3000 → login → Settings → SSH Keys
```

### Configure GitHub mirror

In Forgejo UI: New Migration → GitHub → paste private repo URL + deploy key.

### Configure LFS in GitHub repo

Add `.lfsconfig` to your GitHub repo:

```ini
[lfs]
    url = https://forgejo.kbve.com/<org>/<repo>.git/info/lfs
```

## Architecture

```
GitHub (private, source of truth)
    ↓ SSH deploy key (read-only mirror)
Forgejo (mirror + LFS on sdb via Longhorn)
    ↓ local clone
Forgejo Actions runner (builds with code + assets)
```

## Storage

- **LFS objects**: `/data/lfs` inside Forgejo PVC (50Gi on Longhorn)
- **Database**: `forgejo` schema in kilobase CNPG cluster (shared Postgres)
- **SSH**: NodePort 30022 → `forgejo.kbve.com:30022`

## DNS

Add `forgejo.kbve.com` A record pointing to `142.132.206.74` in Cloudflare.
Grey-cloud if you want SSH to work directly, or proxied for HTTPS-only access.
