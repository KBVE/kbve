#!/usr/bin/env bash
# Seal ClickHouse read credentials for the logs edge function.
# Run from a machine with kubeseal + cluster access.
#
# Uses the logflare user (read access to observability.*).
# The SealedSecret lands in kilobase namespace so ExternalSecrets can read it.

set -euo pipefail

kubectl create secret generic clickhouse-logs \
  --namespace kilobase \
  --from-literal=endpoint='http://chi-clickhouse-cluster-cluster-1-0.clickhouse.svc.cluster.local:8123' \
  --from-literal=username='logflare' \
  --from-literal=password='bjbjIZ1jZj2hoMVzWtZaycTQasPmaldiIv622lcR' \
  --dry-run=client -o yaml \
  | kubeseal --format yaml \
  > "$(dirname "$0")/sealed-clickhouse-logs.yaml"

echo "Sealed secret written to sealed-clickhouse-logs.yaml"
