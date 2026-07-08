#!/usr/bin/env bash
# seal-superadmin-token.sh — Seal the Windmill superadmin API token for the gate bridge
#
# The kbve-gate Windmill bridge (GATE_WINDMILL_BRIDGE) provisions users and
# mints per-user impersonation tokens with a superadmin API token. Mint one in
# the Windmill UI as a superadmin (User settings -> Tokens, no expiration),
# then run this script and paste it when prompted.
#
# The plaintext token exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-superadmin-token.sh
#   # Output: apps/kube/windmill/manifest/windmill-superadmin-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/windmill-superadmin-sealedsecret.yaml"

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

read -r -s -p "Windmill superadmin token: " TOKEN
echo

if [ -z "$TOKEN" ]; then
    echo "Error: empty token" >&2
    exit 1
fi

printf '%s' "$TOKEN" \
| kubectl create secret generic windmill-superadmin-token \
    --namespace=windmill \
    --from-file=token=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext token was never written to disk."
