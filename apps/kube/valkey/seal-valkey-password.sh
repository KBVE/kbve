#!/usr/bin/env bash
# seal-valkey-password.sh — Seal the Valkey auth password
#
# Pipeline that:
#   1. Prompts for (or reads from env) the Valkey password
#   2. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   3. Encrypts it via kubeseal (cluster public key)
#   4. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext password exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-valkey-password.sh
#   # or: VALKEY_PASSWORD=<value> ./seal-valkey-password.sh
#   # Output: apps/kube/valkey/manifests/valkey-auth-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifests/valkey-auth-sealedsecret.yaml"
TARGET_NS="valkey"

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

# --- Get password ---

if [[ -z "${VALKEY_PASSWORD:-}" ]]; then
    echo -n "Enter Valkey password: "
    read -rs VALKEY_PASSWORD
    echo
fi

if [[ -z "${VALKEY_PASSWORD}" ]]; then
    echo "Error: Valkey password cannot be empty" >&2
    exit 1
fi

# --- Seal the password ---

echo "Sealing Valkey password..."

echo -n "${VALKEY_PASSWORD}" \
| kubectl create secret generic valkey-auth \
    --namespace="${TARGET_NS}" \
    --from-file=valkey-password=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext password was never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Commit and push — ArgoCD will sync the SealedSecret"
echo "  3. Services can reference valkey-auth secret via ExternalSecret"
