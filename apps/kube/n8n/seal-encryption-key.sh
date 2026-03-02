#!/usr/bin/env bash
# ============================================================
# One-shot: Generate n8n encryption key → SealedSecret
#
# This script:
#   1. Generates a random 64-char hex key (in memory, never on disk)
#   2. Creates a Kubernetes Secret (dry-run, never sent to cluster)
#   3. Pipes it through kubeseal (encrypts with cluster public key)
#   4. Writes ONLY the encrypted SealedSecret YAML to the repo
#
# The plaintext key exists ONLY in the pipe. It never touches:
#   - Disk (no temp files)
#   - Shell history (generated inline, not typed)
#   - Git (only the sealed YAML is committed)
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   cd apps/kube/n8n
#   bash seal-encryption-key.sh
#   git add manifest/n8n-encryption-sealedsecret.yaml
#   git commit -m "chore(n8n): add encryption key sealed secret"
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/n8n-encryption-sealedsecret.yaml"

# Verify prerequisites
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found"; exit 1; }
command -v kubeseal >/dev/null 2>&1 || { echo "ERROR: kubeseal not found (brew install kubeseal)"; exit 1; }

# Verify cluster connectivity
kubectl cluster-info >/dev/null 2>&1 || { echo "ERROR: Cannot reach cluster. Check kubectl config."; exit 1; }

# Verify sealed-secrets controller is reachable
kubeseal --controller-name=sealed-secrets-controller \
         --controller-namespace=kube-system \
         --fetch-cert >/dev/null 2>&1 || {
    echo "ERROR: Cannot reach sealed-secrets-controller in kube-system."
    echo "       Is the cluster accessible and sealed-secrets deployed?"
    exit 1
}

echo "Generating n8n encryption key and sealing..."

# One-shot pipeline:
#   openssl rand → kubectl create secret (dry-run) → kubeseal → file
#
# The plaintext key only exists in the pipe between openssl and kubectl.
openssl rand -hex 32 \
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

echo "SealedSecret written to: ${OUTPUT_FILE}"
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. git commit -m 'chore(n8n): add encryption key sealed secret'"
echo "  3. Add n8n/application.yaml to apps/kube/kustomization.yaml"
echo ""
echo "The sealed secret will be decrypted by the cluster when ArgoCD syncs."
