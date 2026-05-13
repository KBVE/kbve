#!/usr/bin/env bash
# seal-ch-credentials.sh — Seal ClickHouse credentials for Vector
#
# Creates a SealedSecret with the ClickHouse connection details
# that Vector uses for its clickhouse sink.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-ch-credentials.sh
#   # or: CH_PASSWORD=<value> ./seal-ch-credentials.sh
#   # Output: apps/kube/vector/manifests/sealed-clickhouse-vector.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifests/sealed-clickhouse-vector.yaml"
TARGET_NS="vector"

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

CH_ENDPOINT="${CH_ENDPOINT:-http://chi-clickhouse-cluster-cluster-1-0.clickhouse.svc.cluster.local:8123}"
CH_USERNAME="${CH_USERNAME:-logflare}"

if [[ -z "${CH_PASSWORD:-}" ]]; then
    echo -n "Enter ClickHouse password: "
    read -rs CH_PASSWORD
    echo
fi

if [[ -z "${CH_PASSWORD}" ]]; then
    echo "Error: ClickHouse password cannot be empty" >&2
    exit 1
fi

# --- Seal the credentials ---

echo "Sealing ClickHouse credentials for Vector..."

kubectl create secret generic clickhouse-vector-credentials \
    --namespace="${TARGET_NS}" \
    --from-literal=endpoint="${CH_ENDPOINT}" \
    --from-literal=username="${CH_USERNAME}" \
    --from-literal=password="${CH_PASSWORD}" \
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
echo "  3. Vector will use these credentials for its ClickHouse sink"
