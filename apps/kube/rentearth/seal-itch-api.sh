#!/usr/bin/env bash
# seal-itch-api.sh — Seal the itch.io server-side API key into Secret axum-rentearth-secrets.
#
# Reads ITCH_API from the repo-root .env, wraps it in a Secret (kubectl --dry-run),
# encrypts via kubeseal (cluster public key), writes ONLY the SealedSecret to the repo.
# Plaintext never touches disk or git.
#
# Usage:
#   ./apps/kube/chuckrpg/seal-itch-api.sh
#   # Output: apps/kube/chuckrpg/manifest/axum-rentearth-secrets-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/axum-rentearth-secrets-sealedsecret.yaml"

for cmd in kubectl kubeseal; do
    command -v "$cmd" &>/dev/null || { echo "Error: $cmd not in PATH" >&2; exit 1; }
done

ITCH_API="${ITCH_API:-$(grep -E '^ITCH_API=' "${REPO_ROOT}/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')}"
[ -n "${ITCH_API}" ] || { echo "Error: ITCH_API empty (set env or .env)" >&2; exit 1; }

printf '%s' "${ITCH_API}" \
| kubectl create secret generic axum-rentearth-secrets \
    --namespace=rentearth \
    --from-file=ITCH_API=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo "Sealed secret written to: ${OUTPUT_FILE}"
