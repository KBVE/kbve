#!/usr/bin/env bash
# seal-stalwart-db-credentials.sh — Seal the stalwart Postgres role password
# into the stalwart namespace. The deployment injects it as
# STALWART_DB_PASSWORD, which config.json references via
# {"@type": "EnvironmentVariable", "variableName": "STALWART_DB_PASSWORD"}.
#
# The SAME password must be set on the role:
#   ALTER ROLE stalwart WITH PASSWORD '<password>';
#
# Usage:
#   ./seal-stalwart-db-credentials.sh
#   # or generate a random password automatically:
#   STALWART_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40) \
#     ./seal-stalwart-db-credentials.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-stalwart-db-credentials.yaml"
TARGET_NS="stalwart"

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

if [[ -z "${STALWART_DB_PASSWORD:-}" ]]; then
    echo -n "Enter stalwart DB password (or set STALWART_DB_PASSWORD env): "
    read -rs STALWART_DB_PASSWORD
    echo
fi

if [[ -z "${STALWART_DB_PASSWORD}" ]]; then
    echo "Error: stalwart DB password cannot be empty" >&2
    exit 1
fi

echo "Sealing stalwart DB credentials into ${TARGET_NS} namespace..."

echo -n "${STALWART_DB_PASSWORD}" \
| kubectl create secret generic stalwart-db-credentials \
    --namespace="${TARGET_NS}" \
    --from-file=password=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo ""
echo "Next steps:"
echo "  1. Add sealed-stalwart-db-credentials.yaml to manifest/kustomization.yaml"
echo "  2. Run: ALTER ROLE stalwart WITH PASSWORD '<same-password>';"
echo "  3. git add + commit + push — ArgoCD syncs, reloader restarts stalwart"
