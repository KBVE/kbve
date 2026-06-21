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

## LFS space reclaim (GC + trim)

Reclaiming disk after stale LFS objects accumulate is a **two-layer** problem
(see issues #11930 and #12793). Doing only one layer makes GC "succeed" while
disk usage stays flat:

1. **Forgejo LFS GC** — deletes unreferenced LFS objects from the store
   (`/data/lfs`). Frees ext4 files/inodes only.
2. **Longhorn filesystem trim** — unmaps the freed blocks from the volume so
   `volume.status.actualSize` actually drops. ext4 deletes do not UNMAP blocks,
   so without a trim the space stays pinned in the Longhorn volume/snapshot
   chain.

### Automation (current state)

- **GC**: `[cron.gc_lfs]` (`SCHEDULE = '0 1 * * 0'`, `OLDER_THAN = 168h`),
  configured in `apps/kube/forgejo/application.yaml`. Pinned to Sunday 01:00
  (cron, not `@every 168h`) so it deterministically runs before the trim.
- **Trim**: Longhorn `RecurringJob forgejo-filesystem-trim-weekly` (Sun 03:00) in
  `apps/kube/storage/manifests/recurring-jobs.yaml`, with
  `removeSnapshotsDuringFilesystemTrim: true` (values.yaml) so snapshot-chain
  space is reclaimed too. A `forgejo-snapshot-weekly` job (Sat 02:00, retain 2)
  provides a safety point before the trim.
- **Scoping**: both jobs target the `forgejo-reclaim` group, **not** Longhorn's
  cluster-wide `default` group, so they only touch the LFS volume. Binding is via
  a label on the CSI-created Volume CR (not in git) — re-apply it if the PVC is
  ever recreated:

    ```bash
    kubectl -n longhorn-system label volume \
      $(kubectl -n forgejo get pvc gitea-shared-storage -o jsonpath='{.spec.volumeName}') \
      recurring-job-group.longhorn.io/forgejo-reclaim=enabled --overwrite
    ```

### Manual runbook (on-demand reclaim / verification)

```bash
# 1. Run LFS GC now (instead of waiting for the weekly cron).
#    Forgejo admin API — token must have admin scope.
curl -X POST -H "Authorization: token <ADMIN_TOKEN>" \
  https://git.kbve.com/api/v1/admin/cron/gc_lfs

# 2. Confirm the store shrank inside the pod.
kubectl exec -n forgejo deploy/forgejo -- du -sh /data/lfs

# 3. Trigger the Longhorn filesystem trim for the volume (or run the
#    RecurringJob ad-hoc). Easiest via the Longhorn UI:
#    Volume → gitea-shared-storage → "Trim Filesystem".
#    API equivalent:
#    POST /v1/volumes/<vol>?action=trimFilesystem

# 4. Verify reclaim — actualSize should track the live filesystem size.
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns=NAME:.metadata.name,SIZE:.spec.size,ACTUAL:.status.actualSize

# 5. Storage-layer health.
kubectl exec -n forgejo deploy/forgejo -- forgejo doctor check --run storage-lfs
```

## DNS

Add `forgejo.kbve.com` A record pointing to `142.132.206.74` in Cloudflare.
Grey-cloud if you want SSH to work directly, or proxied for HTTPS-only access.
