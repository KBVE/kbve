#!/usr/bin/env bash
# seal-stalwart-recovery-admin.sh — Seal the Stalwart web-admin recovery
# login as `stalwart-recovery-admin` (key: credentials, value "user:password")
# in the stalwart namespace. The deployment injects it as
# STALWART_RECOVERY_ADMIN, which Stalwart honours as an always-valid admin
# login independent of the registry.
#
# Usage:
#   STALWART_RECOVERY_ADMIN='admin:<password>' ./seal-stalwart-recovery-admin.sh
#   # or generate the password:
#   STALWART_RECOVERY_ADMIN="admin:$(openssl rand -base64 24 | tr -d '/+=')" \
#     ./seal-stalwart-recovery-admin.sh
#
# Keep the plaintext somewhere you control; the script never writes it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-stalwart-recovery-admin.yaml"
TARGET_NS="stalwart"

for cmd in kubectl kubeseal; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed or not in PATH" >&2
        exit 1
    fi
done

if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system namespace" >&2
    exit 1
fi

if [[ -z "${STALWART_RECOVERY_ADMIN:-}" ]]; then
    echo -n "Enter recovery admin as user:password (or set STALWART_RECOVERY_ADMIN env): "
    read -rs STALWART_RECOVERY_ADMIN
    echo
fi

case "${STALWART_RECOVERY_ADMIN}" in
    *:*) ;;
    *) echo "Error: value must be user:password" >&2; exit 1 ;;
esac

echo "Sealing recovery admin into ${TARGET_NS} namespace..."

echo -n "${STALWART_RECOVERY_ADMIN}" \
| kubectl create secret generic stalwart-recovery-admin \
    --namespace="${TARGET_NS}" \
    --from-file=credentials=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Already listed in manifest/kustomization.yaml; commit + push, ArgoCD syncs it,"
echo "reloader restarts stalwart, then log in at /login with those credentials."
