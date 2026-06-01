#!/usr/bin/env bash
# seal-n8n-hmac.sh — Generate the shared discordsh ↔ n8n HMAC and seal it
# into the n8n namespace (canonical source). The discordsh namespace pulls
# it across via ExternalSecret + cross-namespace SecretStore.
#
# Re-running this script ROTATES the HMAC. Reloader rolls both Deployments
# once the SealedSecret + the mirrored Secret update.
#
# Usage:
#   ./seal-n8n-hmac.sh
#   # Output: apps/kube/n8n/manifest/n8n-hmac-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_FILE="${REPO_ROOT}/apps/kube/n8n/manifest/n8n-hmac-sealedsecret.yaml"

SECRET_NAME="discordsh-n8n-hmac"
ENV_KEY="N8N_HMAC_SECRET"

for cmd in kubectl kubeseal openssl; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "missing: $cmd" >&2; exit 1; }
done

kubectl cluster-info >/dev/null 2>&1 || { echo "no cluster access" >&2; exit 1; }
kubectl get deployment sealed-secrets-controller -n kube-system >/dev/null 2>&1 \
    || { echo "sealed-secrets-controller not found in kube-system" >&2; exit 1; }

openssl rand -hex 32 | tr -d '\n' \
    | kubectl create secret generic "${SECRET_NAME}" \
        --namespace=n8n \
        --from-file="${ENV_KEY}=/dev/stdin" \
        --dry-run=client \
        -o yaml \
    | kubeseal \
        --controller-name=sealed-secrets-controller \
        --controller-namespace=kube-system \
        --format=yaml \
    > "${OUTPUT_FILE}"

echo "Sealed secret written: ${OUTPUT_FILE}"
