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
        retentionPolicyIntervalSeconds: 1800 # Check every 30 minutes
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
    schedule: '0 4 * * *' # Daily at 4 AM UTC
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

| File                              | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| `namespace.yaml`                  | Creates `kilobase` namespace                                    |
| `sealed-postgres-db-login.yaml`   | SealedSecret for database credentials                           |
| `kilobase-jwt-secret-sealed.yaml` | SealedSecret for JWT secrets                                    |
| `sealed-aws-s3-bucket.yaml`       | SealedSecret for S3 credentials                                 |
| `sealed-pg-sodium-key.yaml`       | SealedSecret for PostgreSQL sodium encryption key               |
| `postgres-cluster.yaml`           | CNPG Cluster with barman-cloud plugin                           |
| `object-store.yaml`               | S3 ObjectStore with retention policy                            |
| `scheduled-backup.yaml`           | ScheduledBackup resource                                        |
| `initial-backup.yaml`             | One-time initial backup resource                                |
| `configmap-sql.yaml`              | SQL initialization scripts                                      |
| `cross-namespace-rbac.yaml`       | RBAC for external services (discord, bugwars) to access secrets |
| `cert-expiry-alert.yaml`          | PrometheusRule for certificate expiry alerting                  |
| `backup-restore-test.yaml`        | Weekly backup restore fire drill CronJob                        |

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

| Service       | DNS                                              | Port | Description   |
| ------------- | ------------------------------------------------ | ---- | ------------- |
| Primary (RW)  | `supabase-cluster-rw.kilobase.svc.cluster.local` | 5432 | Read-write    |
| Replicas (RO) | `supabase-cluster-ro.kilobase.svc.cluster.local` | 5432 | Read-only     |
| Any           | `supabase-cluster-r.kilobase.svc.cluster.local`  | 5432 | Load balanced |

## TODO

- [ ] Add `instanceSidecarConfiguration` to ObjectStore for automatic WAL cleanup
- [ ] Create `backup-cleanup-cronjob.yaml` for orphaned data cleanup
- [ ] Investigate hourly vs daily backup schedule issue (see Research section - 6-field cron format)
- [ ] Add PodMonitor for backup metrics
- [ ] Set up alerting for certificate expiry (`cert-expiry-alert.yaml` - needs verification)
- [ ] Set up alerting for backup failures
- [x] Create `backup-restore-test.yaml` weekly fire drill CronJob
- [ ] Create `storage-usage-report.yaml` monthly CronJob (see Scheduled Health Checks)
- [ ] Create `backup-health-alerts.yaml` PrometheusRule (see Scheduled Health Checks)
- [ ] Verify Prometheus Pushgateway is deployed and accessible

## Scheduled Health Checks

Read-only monitoring jobs that push metrics to Prometheus Pushgateway for unified alerting. These run as Python scripts that collect S3 backup data and expose it as Prometheus metrics.

### Prerequisites

- Prometheus Pushgateway deployed (typically in `monitoring` namespace)
- Update `PUSHGATEWAY_URL` env var to match your Pushgateway service

### Weekly: Backup Health Check

**Purpose**: Verify backups are being created and check age of stored data in S3.

**Schedule**: `0 6 * * 0` (Sundays at 6 AM UTC)

**Metrics Pushed**:

- `kilobase_backup_count` - Number of base backups in S3
- `kilobase_backup_latest_age_days` - Age of most recent backup in days
- `kilobase_backup_wal_exists` - Whether WAL archives exist (1=yes, 0=no)
- `kilobase_backup_check_timestamp` - Unix timestamp of last check
- `kilobase_backup_check_success` - Whether check completed successfully (1=yes, 0=no)

```yaml
# backup-health-check.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
    name: backup-health-check
    namespace: kilobase
spec:
    schedule: '0 6 * * 0' # Weekly on Sunday at 6 AM UTC
    concurrencyPolicy: Forbid
    successfulJobsHistoryLimit: 4
    failedJobsHistoryLimit: 2
    jobTemplate:
        spec:
            template:
                spec:
                    restartPolicy: OnFailure
                    containers:
                        - name: health-check
                          image: python:3.12-slim
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
                              - name: S3_BUCKET
                                value: 'kilobase'
                              - name: BACKUP_PATH
                                value: 'barman/backup/kilobase-postgres-backup'
                              - name: PUSHGATEWAY_URL
                                value: 'http://prometheus-pushgateway.monitoring.svc.cluster.local:9091'
                          command:
                              - /bin/bash
                              - -c
                              - |
                                  pip install -q boto3 prometheus-client
                                  python3 << 'EOF'
                                  import boto3
                                  import os
                                  import sys
                                  from datetime import datetime, timezone
                                  from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

                                  # Config
                                  s3 = boto3.client('s3')
                                  bucket = os.environ['S3_BUCKET']
                                  backup_path = os.environ['BACKUP_PATH']
                                  pushgateway_url = os.environ['PUSHGATEWAY_URL']

                                  # Create registry and metrics
                                  registry = CollectorRegistry()

                                  backup_count = Gauge('kilobase_backup_count',
                                      'Number of base backups in S3', registry=registry)
                                  backup_age = Gauge('kilobase_backup_latest_age_days',
                                      'Age of most recent backup in days', registry=registry)
                                  wal_exists = Gauge('kilobase_backup_wal_exists',
                                      'Whether WAL archives exist (1=yes, 0=no)', registry=registry)
                                  check_timestamp = Gauge('kilobase_backup_check_timestamp',
                                      'Unix timestamp of last health check', registry=registry)
                                  check_success = Gauge('kilobase_backup_check_success',
                                      'Whether health check completed successfully', registry=registry)

                                  print("=== Kilobase Backup Health Check ===")
                                  print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

                                  try:
                                      # Check base backups
                                      base_path = f"{backup_path}/base/"
                                      response = s3.list_objects_v2(Bucket=bucket, Prefix=base_path, Delimiter='/')

                                      backups = []
                                      for prefix in response.get('CommonPrefixes', []):
                                          backup_name = prefix['Prefix'].split('/')[-2]
                                          backups.append(backup_name)

                                      backup_count.set(len(backups))
                                      print(f"Found {len(backups)} base backup(s)")

                                      if backups:
                                          backups.sort(reverse=True)
                                          print(f"Latest: {backups[0]}")
                                          try:
                                              latest_date = datetime.strptime(backups[0][:8], '%Y%m%d')
                                              age_days = (datetime.now() - latest_date).days
                                              backup_age.set(age_days)
                                              print(f"Backup age: {age_days} day(s)")
                                          except ValueError:
                                              backup_age.set(-1)  # Invalid date format
                                              print(f"WARNING: Could not parse backup date")
                                      else:
                                          backup_age.set(-1)  # No backups
                                          print("ERROR: No base backups found!")

                                      # Check WAL archives
                                      wal_path = f"{backup_path}/wals/"
                                      response = s3.list_objects_v2(Bucket=bucket, Prefix=wal_path, MaxKeys=1)
                                      wal_count = response.get('KeyCount', 0)
                                      wal_exists.set(1 if wal_count > 0 else 0)
                                      print(f"WAL archives exist: {wal_count > 0}")

                                      # Set success metrics
                                      check_timestamp.set(datetime.now(timezone.utc).timestamp())
                                      check_success.set(1)

                                      # Push to Pushgateway
                                      push_to_gateway(pushgateway_url, job='kilobase_backup_health', registry=registry)
                                      print(f"Metrics pushed to {pushgateway_url}")
                                      print("=== Health Check Complete ===")

                                  except Exception as e:
                                      print(f"ERROR: {e}")
                                      check_success.set(0)
                                      check_timestamp.set(datetime.now(timezone.utc).timestamp())
                                      try:
                                          push_to_gateway(pushgateway_url, job='kilobase_backup_health', registry=registry)
                                      except:
                                          pass
                                      sys.exit(1)
                                  EOF
```

### Monthly: Storage Usage Report

**Purpose**: Report total S3 bucket size and breakdown of stored data.

**Schedule**: `0 8 1 * *` (1st of each month at 8 AM UTC)

**Metrics Pushed**:

- `kilobase_storage_total_bytes` - Total size of backup storage in bytes
- `kilobase_storage_total_files` - Total number of files
- `kilobase_storage_base_bytes` - Size of base backups
- `kilobase_storage_wal_bytes` - Size of WAL archives
- `kilobase_storage_report_timestamp` - Unix timestamp of last report
- `kilobase_storage_report_success` - Whether report completed successfully

```yaml
# storage-usage-report.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
    name: storage-usage-report
    namespace: kilobase
spec:
    schedule: '0 8 1 * *' # Monthly on 1st at 8 AM UTC
    concurrencyPolicy: Forbid
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 2
    jobTemplate:
        spec:
            template:
                spec:
                    restartPolicy: OnFailure
                    containers:
                        - name: storage-report
                          image: python:3.12-slim
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
                              - name: S3_BUCKET
                                value: 'kilobase'
                              - name: BACKUP_PATH
                                value: 'barman/backup/kilobase-postgres-backup'
                              - name: PUSHGATEWAY_URL
                                value: 'http://prometheus-pushgateway.monitoring.svc.cluster.local:9091'
                          command:
                              - /bin/bash
                              - -c
                              - |
                                  pip install -q boto3 prometheus-client
                                  python3 << 'EOF'
                                  import boto3
                                  import os
                                  import sys
                                  from datetime import datetime, timezone
                                  from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

                                  def format_size(bytes_size):
                                      for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                                          if bytes_size < 1024:
                                              return f"{bytes_size:.2f} {unit}"
                                          bytes_size /= 1024
                                      return f"{bytes_size:.2f} PB"

                                  # Config
                                  s3 = boto3.client('s3')
                                  bucket = os.environ['S3_BUCKET']
                                  backup_path = os.environ['BACKUP_PATH']
                                  pushgateway_url = os.environ['PUSHGATEWAY_URL']

                                  # Create registry and metrics
                                  registry = CollectorRegistry()

                                  total_bytes = Gauge('kilobase_storage_total_bytes',
                                      'Total backup storage size in bytes', registry=registry)
                                  total_files = Gauge('kilobase_storage_total_files',
                                      'Total number of backup files', registry=registry)
                                  base_bytes = Gauge('kilobase_storage_base_bytes',
                                      'Size of base backups in bytes', registry=registry)
                                  wal_bytes = Gauge('kilobase_storage_wal_bytes',
                                      'Size of WAL archives in bytes', registry=registry)
                                  report_timestamp = Gauge('kilobase_storage_report_timestamp',
                                      'Unix timestamp of last storage report', registry=registry)
                                  report_success = Gauge('kilobase_storage_report_success',
                                      'Whether storage report completed successfully', registry=registry)

                                  print("=== Kilobase Storage Usage Report ===")
                                  print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

                                  try:
                                      paginator = s3.get_paginator('list_objects_v2')

                                      stats = {
                                          'total_size': 0,
                                          'total_count': 0,
                                          'base_size': 0,
                                          'wal_size': 0,
                                      }

                                      for page in paginator.paginate(Bucket=bucket, Prefix=f"{backup_path}/"):
                                          for obj in page.get('Contents', []):
                                              key = obj['Key']
                                              size = obj['Size']
                                              stats['total_size'] += size
                                              stats['total_count'] += 1

                                              if '/base/' in key:
                                                  stats['base_size'] += size
                                              elif '/wals/' in key:
                                                  stats['wal_size'] += size

                                      # Set metrics
                                      total_bytes.set(stats['total_size'])
                                      total_files.set(stats['total_count'])
                                      base_bytes.set(stats['base_size'])
                                      wal_bytes.set(stats['wal_size'])
                                      report_timestamp.set(datetime.now(timezone.utc).timestamp())
                                      report_success.set(1)

                                      # Print summary
                                      print(f"Total Size: {format_size(stats['total_size'])}")
                                      print(f"Total Files: {stats['total_count']:,}")
                                      print(f"Base Backups: {format_size(stats['base_size'])}")
                                      print(f"WAL Archives: {format_size(stats['wal_size'])}")

                                      # Push to Pushgateway
                                      push_to_gateway(pushgateway_url, job='kilobase_storage_report', registry=registry)
                                      print(f"Metrics pushed to {pushgateway_url}")
                                      print("=== Report Complete ===")

                                  except Exception as e:
                                      print(f"ERROR: {e}")
                                      report_success.set(0)
                                      report_timestamp.set(datetime.now(timezone.utc).timestamp())
                                      try:
                                          push_to_gateway(pushgateway_url, job='kilobase_storage_report', registry=registry)
                                      except:
                                          pass
                                      sys.exit(1)
                                  EOF
```

### PrometheusRule for Backup Alerts

Create alerts based on the metrics pushed by the health check jobs:

```yaml
# backup-health-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
    name: kilobase-backup-alerts
    namespace: kilobase
    labels:
        prometheus: kube-prometheus
        role: alert-rules
spec:
    groups:
        - name: kilobase-backup-health
          rules:
              # Alert if no backups exist
              - alert: KilobaseNoBackups
                annotations:
                    description: 'No base backups found in S3 for kilobase'
                    summary: 'Kilobase has no backups'
                expr: kilobase_backup_count == 0
                for: 1h
                labels:
                    severity: critical

              # Alert if backup is too old (> 3 days)
              - alert: KilobaseBackupStale
                annotations:
                    description: 'Latest kilobase backup is {{ $value }} days old'
                    summary: 'Kilobase backup is stale'
                expr: kilobase_backup_latest_age_days > 3
                for: 30m
                labels:
                    severity: warning

              # Alert if backup is very old (> 7 days)
              - alert: KilobaseBackupCriticallyStale
                annotations:
                    description: 'Latest kilobase backup is {{ $value }} days old - exceeds retention!'
                    summary: 'Kilobase backup critically stale'
                expr: kilobase_backup_latest_age_days > 7
                for: 15m
                labels:
                    severity: critical

              # Alert if no WAL archives
              - alert: KilobaseNoWALArchives
                annotations:
                    description: 'No WAL archives found - point-in-time recovery not possible'
                    summary: 'Kilobase WAL archiving may be broken'
                expr: kilobase_backup_wal_exists == 0
                for: 1h
                labels:
                    severity: warning

              # Alert if health check hasn't run (stale metrics > 8 days)
              - alert: KilobaseHealthCheckStale
                annotations:
                    description: "Backup health check hasn't run in over 8 days"
                    summary: 'Kilobase health check not running'
                expr: (time() - kilobase_backup_check_timestamp) > 691200
                for: 1h
                labels:
                    severity: warning

              # Alert if health check failed
              - alert: KilobaseHealthCheckFailed
                annotations:
                    description: 'Backup health check job failed'
                    summary: 'Kilobase health check error'
                expr: kilobase_backup_check_success == 0
                for: 5m
                labels:
                    severity: warning

        - name: kilobase-storage-health
          rules:
              # Alert if storage exceeds threshold (e.g., 50GB)
              - alert: KilobaseStorageHigh
                annotations:
                    description: 'Kilobase backup storage is {{ $value | humanize1024 }}B'
                    summary: 'Kilobase storage usage high'
                expr: kilobase_storage_total_bytes > 53687091200
                for: 1h
                labels:
                    severity: warning

              # Alert if WAL storage exceeds base storage (potential cleanup issue)
              - alert: KilobaseWALStorageHigh
                annotations:
                    description: 'WAL archives ({{ $value | humanize1024 }}B) exceed base backups - may need cleanup'
                    summary: 'Kilobase WAL storage disproportionate'
                expr: kilobase_storage_wal_bytes > (kilobase_storage_base_bytes * 2)
                for: 1h
                labels:
                    severity: warning
```

### Notes on Prometheus Integration

- **Image**: Uses `python:3.12-slim` with `boto3` and `prometheus-client`
- **Pushgateway**: Metrics are pushed to Prometheus Pushgateway for scraping
- **Job names**: `kilobase_backup_health` and `kilobase_storage_report`
- **Retention**: Pushgateway retains metrics until overwritten or deleted
- **No actions**: Read-only monitoring, no modifications to backup data

### Viewing Metrics and Logs

```bash
# View metrics in Prometheus
# Query: kilobase_backup_count, kilobase_storage_total_bytes, etc.

# List recent job runs
kubectl get jobs -n kilobase | grep -E "(backup-health|storage-usage)"

# View logs from latest health check
kubectl logs -n kilobase -l job-name=backup-health-check --tail=100

# View logs from latest storage report
kubectl logs -n kilobase -l job-name=storage-usage-report --tail=100

# Check Pushgateway metrics directly
curl http://prometheus-pushgateway.monitoring.svc.cluster.local:9091/metrics | grep kilobase
```

## Research

Key findings from CloudNativePG documentation that may be relevant for future improvements.

### 6-Field Cron Format (Seconds)

**Important**: CloudNativePG uses a 6-field cron format that includes seconds:

```
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (1 - 12)
│ │ │ │ │ ┌───────────── day of week (0 - 6)
│ │ │ │ │ │
* * * * * *
```

This explains Issue #3 - our schedule `0 2 * * *` is interpreted as:

- Second: 0
- Minute: 2
- Hour: \* (every hour)
- Day: \* (every day)
- Month: \* (every month)

**Fix**: Change to `0 0 2 * * *` for daily at 2 AM, or `0 2 * * * *` for every minute at second 2.

### WAL Archive Management

From the barman-cloud plugin documentation:

1. **WAL archiving is essential** - Without continuous WAL archiving, you cannot recover to any point in time between base backups
2. **Retention policy scope** - The `retentionPolicy` on ObjectStore only triggers `barman-cloud-backup-delete` which manages base backups
3. **WAL cleanup mechanism** - `instanceSidecarConfiguration.retentionPolicyIntervalSeconds` runs periodic cleanup that removes WALs no longer needed for recovery

### Synchronous Replication

For higher durability, consider synchronous replication:

```yaml
spec:
    postgresql:
        synchronous:
            method: any # or 'first'
            number: 1 # number of synchronous standbys
```

**Trade-off**: Increases write latency but ensures data is on multiple nodes before commit acknowledged.

### Instance Manager & Probes

CNPG uses an instance manager sidecar that handles:

- **Liveness probe**: Checks if postmaster is running
- **Readiness probe**: Checks if accepting connections and not in recovery (for RW service)
- **Startup probe**: Allows time for recovery/startup before liveness kicks in

Custom probe configuration:

```yaml
spec:
    startDelay: 30
    stopDelay: 30
    smartShutdownTimeout: 180
    switchoverDelay: 40000000 # microseconds
```

### Monitoring with PodMonitor

CNPG supports Prometheus metrics via PodMonitor:

```yaml
spec:
    monitoring:
        enablePodMonitor: true
        customQueriesConfigMap:
            - name: custom-queries
              key: queries
```

**Key metrics** (exported at `/metrics`):

- `cnpg_collector_*` - Collector status
- `cnpg_pg_replication_*` - Replication lag metrics
- `cnpg_pg_stat_archiver_*` - WAL archiving stats
- `cnpg_pg_database_size_bytes` - Database sizes

### Troubleshooting Commands

Useful diagnostic commands:

```bash
# Check cluster status
kubectl cnpg status supabase-cluster -n kilobase

# Get cluster logs
kubectl cnpg logs cluster supabase-cluster -n kilobase -f

# Promote a replica (emergency failover)
kubectl cnpg promote supabase-cluster-2 -n kilobase

# Restart a specific instance
kubectl cnpg restart supabase-cluster-1 -n kilobase

# Run psql on primary
kubectl cnpg psql supabase-cluster -n kilobase -- -c "SELECT 1"
```

### SSL/TLS Certificates

CNPG auto-manages certificates with 90-day validity and 7-day pre-expiry renewal:

```yaml
spec:
    certificates:
        serverTLSSecret: supabase-cluster-server
        serverCASecret: supabase-cluster-ca
        replicationTLSSecret: supabase-cluster-replication
        clientCASecret: supabase-cluster-ca
```

**Note**: Client applications should trust the CA secret for secure connections.

### Operator Capability Levels

CloudNativePG is rated **Level 5 - Auto Pilot** (highest level):

- Level 1: Basic Install
- Level 2: Seamless Upgrades
- Level 3: Full Lifecycle (backup/restore)
- Level 4: Deep Insights (metrics/alerts)
- Level 5: Auto Pilot (auto-scaling, auto-healing, auto-tuning)

### Backup Best Practices

1. **Always enable WAL archiving** before creating backups
2. **Test recovery regularly** in a separate namespace
3. **Use `prefer-standby` target** to reduce load on primary
4. **Monitor `pg_stat_archiver`** for archiving failures
5. **Set appropriate retention** based on RPO requirements

### Point-in-Time Recovery (PITR)

To recover to a specific point in time:

```yaml
spec:
    bootstrap:
        recovery:
            source: kilobase-postgres-backup
            recoveryTarget:
                targetTime: '2024-11-26T10:00:00Z' # ISO 8601 format
                # OR
                targetLSN: '0/1234567'
                # OR
                targetXID: '1234567'
```

**Important**: After PITR, the cluster cannot rejoin the original timeline. Consider cloning instead.

### Replication Slots

For guaranteed WAL retention during replica lag:

```yaml
spec:
    replicationSlots:
        highAvailability:
            enabled: true
            slotPrefix: _cnpg_
        updateInterval: 30 # seconds
```

**Warning**: If a replica falls too far behind, slots prevent WAL cleanup, potentially filling disk.

## References

- [CloudNativePG Documentation](https://cloudnative-pg.io/documentation/)
- [Barman Cloud Plugin - Usage](https://cloudnative-pg.io/plugin-barman-cloud/docs/usage/)
- [Barman Cloud Plugin - Migration](https://cloudnative-pg.io/plugin-barman-cloud/docs/migration/)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
