#!/usr/bin/env bash
# seal-stalwart-hook-secret.sh — Seal the shared bearer secret that
# Stalwart presents when calling the axum-herbmail MTA hook endpoint.
#
# Pipeline that:
#   1. Prompts for (or reads from env) the hook secret
#   2. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   3. Encrypts it via kubeseal (cluster public key)
#   4. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext secret exists only in memory between pipe stages.
#
# The herbmail deployment reads it as STALWART_HOOK_SECRET (optional
# secretKeyRef — the pod runs without it, but the hook endpoint
# answers 503 until the secret exists). The SAME value must be set as
# the Bearer token in Stalwart admin: MTA Hooks -> httpAuth -> Bearer.
#
# Usage:
#   ./seal-stalwart-hook-secret.sh
#   # or generate a random secret automatically:
#   STALWART_HOOK_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40) \
#     ./seal-stalwart-hook-secret.sh
#
# After sealing:
#   1. Add sealed-stalwart-hook-secret.yaml to manifest/kustomization.yaml
#   2. Commit + push — ArgoCD syncs it, reloader restarts herbmail
#   3. Paste the same value into the Stalwart admin MTA hook config

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-stalwart-hook-secret.yaml"
TARGET_NS="herbmail"

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

if [[ -z "${STALWART_HOOK_SECRET:-}" ]]; then
    echo -n "Enter Stalwart hook secret (or set STALWART_HOOK_SECRET env): "
    read -rs STALWART_HOOK_SECRET
    echo
fi

if [[ -z "${STALWART_HOOK_SECRET}" ]]; then
    echo "Error: hook secret cannot be empty" >&2
    exit 1
fi

echo "Sealing Stalwart hook secret into ${TARGET_NS} namespace..."

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
echo ""
echo "Next steps:"
echo "  1. Add sealed-stalwart-hook-secret.yaml to manifest/kustomization.yaml"
echo "  2. git add + commit + push — ArgoCD syncs it"
echo "  3. Paste the same value as the Bearer token in Stalwart admin (MTA Hooks)"
