#!/usr/bin/env bash
# seal-runner-auth-token.sh — Generate and seal n8n task runner auth token
#
# One-shot pipeline that:
#   1. Generates a random 256-bit hex token (openssl rand)
#   2. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   3. Encrypts it via kubeseal (cluster public key)
#   4. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext token exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# This token is shared between the main n8n container and the
# task runner sidecar container to authenticate runner connections.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-runner-auth-token.sh
#   # Output: apps/kube/n8n/manifest/n8n-runner-auth-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/n8n-runner-auth-sealedsecret.yaml"

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

echo "Generating n8n task runner auth token and sealing..."

openssl rand -hex 32 | tr -d '\n' \
| kubectl create secret generic n8n-runner-auth \
    --namespace=n8n \
    --from-file=auth-token=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext token was never written to disk."
