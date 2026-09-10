#!/usr/bin/env bash
# seal-stalwart-db-credentials.sh — Seal the stalwart Postgres role password
# as `stalwart-db-password` in the kilobase namespace (keys: username,
# password). Two consumers read that one secret:
#
#   1. CNPG: `managed.roles[stalwart].passwordSecret` in
#      apps/kube/kilobase/manifests/postgres-cluster.yaml sets the role's
#      password from it, so no ALTER ROLE by hand.
#   2. An ExternalSecret in the stalwart namespace mirrors `password` into
#      `stalwart-db-credentials`, which the deployment injects as
#      STALWART_DB_PASSWORD for config.json.
#
# The dbmate migration still creates the role (guarded by IF NOT EXISTS)
# with a placeholder for local runs; in the cluster CNPG owns the password.
#
# Usage:
#   ./seal-stalwart-db-credentials.sh
#   # or generate a random password automatically:
#   STALWART_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40) \
#     ./seal-stalwart-db-credentials.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/../kilobase/manifests/sealed-stalwart-db-password.yaml"
TARGET_NS="kilobase"

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
| kubectl create secret generic stalwart-db-password \
    --namespace="${TARGET_NS}" \
    --from-literal=username=stalwart \
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
echo "  1. git add ${OUTPUT_FILE} — the kilobase app picks up every yaml in manifests/"
echo "  2. Commit + push; after the dev->main release ArgoCD syncs it"
echo "  3. CNPG sets the stalwart role password; the ExternalSecret in the"
echo "     stalwart namespace mirrors it and the pod starts"
echo "  4. Run the dbmate migrations whenever ready — the role already exists"
