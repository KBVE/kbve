#!/usr/bin/env bash
# seal-encryption-key.sh — Generate and seal n8n encryption key
#
# One-shot pipeline that:
#   1. Generates a random 256-bit hex key (openssl rand)
#   2. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   3. Encrypts it via kubeseal (cluster public key)
#   4. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext key exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-encryption-key.sh
#   # Output: apps/kube/n8n/manifest/n8n-encryption-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/n8n-encryption-sealedsecret.yaml"

# --- Preflight checks ---

for cmd in kubectl kubeseal openssl; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed or not in PATH" >&2
        exit 1
    fi
done

if ! kubectl cluster-info &>/dev/null; then
    echo "Error: Cannot connect to Kubernetes cluster" >&2
    echo "       Make sure kubectl is configured and the cluster is reachable" >&2
    exit 1
fi

# Verify sealed-secrets-controller is running
if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system namespace" >&2
    exit 1
fi

# --- Generate, seal, and write ---

echo "Generating n8n encryption key and sealing..."

openssl rand -hex 32 | tr -d '\n' \
| kubectl create secret generic n8n-encryption-secret \
    --namespace=n8n \
    --from-file=encryption-key=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext key was never written to disk."
