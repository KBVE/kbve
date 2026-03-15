#!/usr/bin/env bash
# seal-rcon-password.sh — Seal the MC RCON password
#
# Pipeline that:
#   1. Prompts for (or reads from env) the RCON password
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
#   ./seal-rcon-password.sh
#   # or: MC_RCON_PASSWORD=<value> ./seal-rcon-password.sh
#   # Output: apps/kube/mc/manifest/mc-rcon-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/mc-rcon-sealedsecret.yaml"
TARGET_NS="mc"

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

if [[ -z "${MC_RCON_PASSWORD:-}" ]]; then
    echo -n "Enter RCON password: "
    read -rs MC_RCON_PASSWORD
    echo
fi

if [[ -z "${MC_RCON_PASSWORD}" ]]; then
    echo "Error: RCON password cannot be empty" >&2
    exit 1
fi

# --- Seal the password ---

echo "Sealing RCON password..."

echo -n "${MC_RCON_PASSWORD}" \
| kubectl create secret generic mc-rcon-secret \
    --namespace="${TARGET_NS}" \
    --from-file=rcon-password=/dev/stdin \
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
echo "  2. Add mc-rcon-sealedsecret.yaml to kustomization.yaml"
echo "  3. Commit and push — ArgoCD will sync the SealedSecret"
echo "  4. Update kbve-deployment.yaml to use secretKeyRef"
