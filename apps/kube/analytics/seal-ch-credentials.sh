#!/usr/bin/env bash
# seal-ch-credentials.sh — Seal ClickHouse credentials for Logflare
#
# Creates a SealedSecret with the ClickHouse connection details
# that the logflare-ch-setup Job uses to configure the CH backend.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-ch-credentials.sh
#   # or: CH_PASSWORD=<value> ./seal-ch-credentials.sh
#   # Output: apps/kube/analytics/manifests/sealed-logflare-ch.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifests/sealed-logflare-ch.yaml"
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

CH_URL="${CH_URL:-http://clickhouse-clickhouse-cluster.clickhouse.svc.cluster.local:8123}"
CH_USERNAME="${CH_USERNAME:-logflare}"
CH_DATABASE="${CH_DATABASE:-logflare}"
CH_PORT="${CH_PORT:-8123}"

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

echo "Sealing ClickHouse credentials..."

kubectl create secret generic logflare-ch-config \
    --namespace="${TARGET_NS}" \
    --from-literal=ch-url="${CH_URL}" \
    --from-literal=ch-username="${CH_USERNAME}" \
    --from-literal=ch-password="${CH_PASSWORD}" \
    --from-literal=ch-database="${CH_DATABASE}" \
    --from-literal=ch-port="${CH_PORT}" \
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
echo "  3. The logflare-ch-setup Job will use these credentials"
