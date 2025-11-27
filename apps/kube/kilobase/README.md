# Kilobase PostgreSQL Cluster

CloudNativePG-managed PostgreSQL cluster with Supabase extensions and S3 backup via barman-cloud plugin.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArgoCD                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Application  │  │ Application  │  │ Application          │   │
│  │ (kilobase)   │  │ (cnpg-system)│  │ (backup-cleanup)     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ kilobase ns     │  │ cnpg-system ns  │  │ CronJob             │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ backup-cleanup      │
│ │ Cluster     │ │  │ │ CNPG        │ │  │ (runs barman-cloud- │
│ │ (3 replicas)│◄┼──┼─┤ Operator    │ │  │  backup-delete)     │
│ └─────────────┘ │  │ └─────────────┘ │  └─────────────────────┘
│ ┌─────────────┐ │  │ ┌─────────────┐ │            │
│ │ ObjectStore │ │  │ │ barman-cloud│ │            │
│ │ (retention) │ │  │ │ plugin      │ │            │
│ └──────┬──────┘ │  │ └─────────────┘ │            │
└────────┼────────┘  └─────────────────┘            │
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         S3 Bucket                                │
│  s3://kilobase/barman/backup/                                   │
│  ├── kilobase-postgres-backup/                                  │
│  │   ├── base/           <- Full backups (managed by retention) │
│  │   │   ├── 20251126T091549/                                   │
│  │   │   └── ...                                                │
│  │   └── wals/           <- WAL archives (need cleanup job)     │
│  │       ├── 0000000100000000/                                  │
│  │       └── ...                                                │
│  └── [orphaned dirs]     <- From old clusters (manual cleanup)  │
└─────────────────────────────────────────────────────────────────┘
```

## Known Issues & Solutions

### Issue 1: WAL Archives Not Being Cleaned Up

**Problem**: The `retentionPolicy: 3d` on ObjectStore only manages base backups, not WAL archives. WALs accumulate indefinitely, causing S3 storage bloat.

**Root Cause**: The barman-cloud plugin's retention policy deletes old base backups but leaves WAL files that were needed for point-in-time recovery to those backups.

**Solution**: Add `instanceSidecarConfiguration` to ObjectStore with `retentionPolicyIntervalSeconds`:

```yaml
# object-store.yaml
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata:
  name: kilobase-backup-store
  namespace: kilobase
spec:
  retentionPolicy: '3d'
  instanceSidecarConfiguration:
    retentionPolicyIntervalSeconds: 1800  # Check every 30 minutes
  configuration:
    destinationPath: s3://kilobase/barman/backup
    s3Credentials:
      accessKeyId:
        name: kilobase-s3-secret
        key: keyId
      secretAccessKey:
        name: kilobase-s3-secret
        key: accessKey
    wal:
      compression: gzip
```

### Issue 2: Orphaned WALs from Old/Renamed Clusters

**Problem**: When clusters are renamed or recreated, old WAL directories remain in S3 with no automatic cleanup mechanism.

**Solution**: Create a CronJob that runs `barman-cloud-backup-delete` to clean up orphaned data:

```yaml
# backup-cleanup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: barman-backup-cleanup
  namespace: kilobase
spec:
  schedule: "0 4 * * *"  # Daily at 4 AM UTC
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cleanup
              image: ghcr.io/cloudnative-pg/barman-cloud:latest
              env:
                - name: AWS_ACCESS_KEY_ID
                  valueFrom:
                    secretKeyRef:
                      name: kilobase-s3-secret
                      key: keyId
                - name: AWS_SECRET_ACCESS_KEY
                  valueFrom:
                    secretKeyRef:
                      name: kilobase-s3-secret
                      key: accessKey
              command:
                - /bin/bash
                - -c
                - |
                  set -e
                  echo "=== Barman Backup Cleanup Started ==="

                  # Run retention policy cleanup
                  barman-cloud-backup-delete \
                    --retention-policy "RECOVERY WINDOW OF 3 DAYS" \
                    s3://kilobase/barman/backup \
                    kilobase-postgres-backup

                  echo "=== Cleanup Completed ==="
```

### Issue 3: ScheduledBackup Running Hourly Instead of Daily

**Problem**: Schedule `0 2 * * *` appears to run hourly instead of daily at 2 AM.

**Investigation Needed**: This may be a CNPG bug or cron interpretation issue. Current behavior creates hourly backups which provides more granular recovery points but uses more storage.

**Current Workaround**: The hourly backups provide better RPO (Recovery Point Objective). Combined with proper WAL cleanup, storage impact is minimal since base backups are ~50MB each.

**To reduce to daily only**, investigate if CNPG uses a different cron format or file a bug report.

## Manifests

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates `kilobase` namespace |
| `secrets.yaml` | Database credentials, JWT secrets, S3 credentials |
| `postgres-cluster.yaml` | CNPG Cluster with barman-cloud plugin |
| `object-store.yaml` | S3 ObjectStore with retention policy |
| `scheduled-backup.yaml` | ScheduledBackup resource |
| `configmap-sql.yaml` | SQL initialization scripts |
| `service.yaml` | Kubernetes services |
| `backup-cleanup-cronjob.yaml` | **TODO** - Automated backup/WAL cleanup |

## Deployment

### Prerequisites
- CloudNativePG operator v1.26+ in `cnpg-system` namespace
- barman-cloud plugin installed
- Longhorn storage class (or modify `storageClass`)
- S3-compatible storage

### Deploy via ArgoCD

The kilobase Application in ArgoCD will sync all manifests automatically.

### Manual Deploy

```bash
kubectl apply -k apps/kube/kilobase/manifests/
```

## Backup & Recovery

### Backup Schedule
- **Full Backups**: Hourly at minute 02 (currently; should be daily at 2 AM)
- **WAL Archiving**: Continuous (every WAL segment ~16MB)
- **Retention**: 3 days of point-in-time recovery

### Manual Backup
```bash
kubectl apply -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: manual-backup-$(date +%Y%m%d%H%M%S)
  namespace: kilobase
spec:
  cluster:
    name: supabase-cluster
  method: plugin
  pluginConfiguration:
    name: barman-cloud.cloudnative-pg.io
    parameters:
      barmanObjectName: kilobase-backup-store
EOF
```

### Check Backup Status
```bash
# List all backups
kubectl get backups -n kilobase

# Check ObjectStore status
kubectl get objectstore -n kilobase -o yaml

# Check S3 storage usage
aws s3 ls s3://kilobase/barman/ --recursive --human-readable --summarize
```

### Recovery

Recovery is configured via `bootstrap.recovery` in the Cluster spec. The cluster can restore from any point within the retention window.

## Monitoring

### Key Metrics (Prometheus)
```
barman_cloud_cloudnative_pg_io_last_backup_timestamp
barman_cloud_cloudnative_pg_io_last_failed_backup_timestamp
barman_cloud_cloudnative_pg_io_wal_archive_count
```

### Health Checks
```bash
# Check cluster status
kubectl get cluster supabase-cluster -n kilobase

# Check WAL archiving status
kubectl exec -n kilobase supabase-cluster-1 -c postgres -- \
  psql -U postgres -c "SELECT * FROM pg_stat_archiver;"

# Check replication status
kubectl exec -n kilobase supabase-cluster-1 -c postgres -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"
```

## Maintenance Tasks

### Manual WAL Cleanup (One-time)

If orphaned WALs exist from before a specific backup:

```bash
# Find oldest needed WAL from oldest backup
kubectl exec -n kilobase supabase-cluster-2 -c postgres -- \
  psql -U postgres -c "SELECT pg_walfile_name(pg_current_wal_lsn());"

# Delete orphaned WAL directories (example: directories 00-1E)
aws s3 rm s3://kilobase/barman/backup/kilobase-postgres-backup/wals/0000000100000000/ --recursive
# ... repeat for each orphaned directory
```

### Clean Up Orphaned Backup Directories

```bash
# List all backup directories
aws s3 ls s3://kilobase/barman/backup/

# Remove old cluster backups (NOT kilobase-postgres-backup)
aws s3 rm s3://kilobase/barman/backup/supabase/ --recursive
aws s3 rm s3://kilobase/barman/backup/supabase-release-supabase-db/ --recursive
```

## Connection Details

| Service | DNS | Port | Description |
|---------|-----|------|-------------|
| Primary (RW) | `supabase-cluster-rw.kilobase.svc.cluster.local` | 5432 | Read-write |
| Replicas (RO) | `supabase-cluster-ro.kilobase.svc.cluster.local` | 5432 | Read-only |
| Any | `supabase-cluster-r.kilobase.svc.cluster.local` | 5432 | Load balanced |

## TODO

- [ ] Add `instanceSidecarConfiguration` to ObjectStore for automatic WAL cleanup
- [ ] Create `backup-cleanup-cronjob.yaml` for orphaned data cleanup
- [ ] Investigate hourly vs daily backup schedule issue
- [ ] Add PodMonitor for backup metrics
- [ ] Set up alerting for backup failures

## References

- [CloudNativePG Documentation](https://cloudnative-pg.io/documentation/)
- [Barman Cloud Plugin - Usage](https://cloudnative-pg.io/plugin-barman-cloud/docs/usage/)
- [Barman Cloud Plugin - Migration](https://cloudnative-pg.io/plugin-barman-cloud/docs/migration/)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
