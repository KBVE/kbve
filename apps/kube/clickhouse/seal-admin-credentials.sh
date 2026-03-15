#!/usr/bin/env bash
# seal-admin-credentials.sh — Seal ClickHouse admin credentials
#
# Creates a SealedSecret with the ClickHouse admin connection details
# that the logflare-ch-setup Job uses to bootstrap SQL users.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-admin-credentials.sh
#   # or: CH_ADMIN_PASSWORD=<value> ./seal-admin-credentials.sh
#   # Output: apps/kube/clickhouse/manifests/sealed-clickhouse-admin.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/../analytics/manifests/sealed-clickhouse-admin.yaml"
TARGET_NS="kilobase"

# --- Preflight checks ---

for cmd in kubectl kubeseal; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed or not in PATH" >&2
        exit 1
    fi
done

if ! kubectl cluster-info &>/dev/null; then
    echo "Error: Cannot connect to Kubernetes cluster" >&2
    exit 1
fi

if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system namespace" >&2
    exit 1
fi

# --- Get credentials ---

CH_ADMIN_URL="${CH_ADMIN_URL:-http://clickhouse-clickhouse-cluster.clickhouse.svc.cluster.local:8123}"
CH_ADMIN_USERNAME="${CH_ADMIN_USERNAME:-admin}"

if [[ -z "${CH_ADMIN_PASSWORD:-}" ]]; then
    echo -n "Enter ClickHouse admin password: "
    read -rs CH_ADMIN_PASSWORD
    echo
fi

if [[ -z "${CH_ADMIN_PASSWORD}" ]]; then
    echo "Error: ClickHouse admin password cannot be empty" >&2
    exit 1
fi

# --- Seal the credentials ---

echo "Sealing ClickHouse admin credentials..."

kubectl create secret generic clickhouse-admin-credentials \
    --namespace="${TARGET_NS}" \
    --from-literal=url="${CH_ADMIN_URL}" \
    --from-literal=username="${CH_ADMIN_USERNAME}" \
    --from-literal=password="${CH_ADMIN_PASSWORD}" \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext credentials were never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Commit and push — ArgoCD will sync the SealedSecret"
echo "  3. The logflare-ch-setup Job will use admin creds to bootstrap SQL users"
