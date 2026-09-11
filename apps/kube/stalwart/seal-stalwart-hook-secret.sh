#!/usr/bin/env bash
# seal-stalwart-hook-secret.sh — Seal the Stalwart web-admin recovery
# login as `stalwart-hook-secret` (key: credentials, value "user:password")
# in the stalwart namespace. The deployment injects it as
# STALWART_HOOK_SECRET, which Stalwart honours as an always-valid admin
# login independent of the registry.
#
# Usage:
#   STALWART_HOOK_SECRET='admin:<password>' ./seal-stalwart-hook-secret.sh
#   # or generate the password:
#   STALWART_HOOK_SECRET="admin:$(openssl rand -base64 24 | tr -d '/+=')" \
#     ./seal-stalwart-hook-secret.sh
#
# Keep the plaintext somewhere you control; the script never writes it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-stalwart-hook-secret.yaml"
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

if [[ -z "${STALWART_HOOK_SECRET:-}" ]]; then
    echo -n "Enter Stalwart hook bearer token (or set STALWART_HOOK_SECRET env): "
    read -rs STALWART_HOOK_SECRET
    echo
fi

if [[ -z "${STALWART_HOOK_SECRET}" ]]; then
    echo "Error: hook secret cannot be empty" >&2
    exit 1
fi

echo "Sealing hook bearer token into ${TARGET_NS} namespace..."

echo -n "${STALWART_HOOK_SECRET}" \
| kubectl create secret generic stalwart-hook-secret \
    --namespace="${TARGET_NS}" \
    --from-file=secret=/dev/stdin \
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
echo "reloader restarts stalwart. The MTA hook bearer is the EnvironmentVariable"
echo "STALWART_HOOK_SECRET, so no token is ever pasted into the admin UI. Seal the"
echo "same value with apps/kube/herbmail/seal-stalwart-hook-secret.sh for herbmail-api."