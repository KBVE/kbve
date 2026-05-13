#!/usr/bin/env bash
# seal-argocd-token.sh — Generate ArgoCD API token and seal it
#
# One-shot pipeline that:
#   1. Port-forwards to the ArgoCD server
#   2. Retrieves the admin password from the cluster
#   3. Authenticates and generates a long-lived API token
#   4. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   5. Encrypts it via kubeseal (cluster public key)
#   6. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext token exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#   - ArgoCD deployed in the argocd namespace
#
# Usage:
#   ./seal-argocd-token.sh
#   # Output: apps/kube/kbve/manifest/argocd-auth-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/argocd-auth-sealedsecret.yaml"
ARGOCD_NS="argocd"
TARGET_NS="kbve"
LOCAL_PORT="18443"

# --- Preflight checks ---

for cmd in kubectl kubeseal curl jq; do
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

if ! kubectl get svc argocd-server -n "${ARGOCD_NS}" &>/dev/null; then
    echo "Error: argocd-server service not found in ${ARGOCD_NS} namespace" >&2
    exit 1
fi

# --- Retrieve admin password ---

echo "Retrieving ArgoCD admin password..."
ADMIN_PASS=$(kubectl get secret argocd-initial-admin-secret -n "${ARGOCD_NS}" \
    -o jsonpath='{.data.password}' | base64 -d)

if [[ -z "${ADMIN_PASS}" ]]; then
    echo "Error: Could not retrieve ArgoCD admin password" >&2
    echo "       (argocd-initial-admin-secret may have been deleted)" >&2
    exit 1
fi

# --- Port-forward to ArgoCD ---

echo "Starting port-forward to argocd-server..."
kubectl port-forward svc/argocd-server -n "${ARGOCD_NS}" "${LOCAL_PORT}:443" &>/dev/null &
PF_PID=$!

cleanup() {
    kill "${PF_PID}" 2>/dev/null || true
    wait "${PF_PID}" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for port-forward to be ready
for i in $(seq 1 15); do
    if curl -sk "https://localhost:${LOCAL_PORT}/api/v1/session" -o /dev/null 2>/dev/null; then
        break
    fi
    if [[ $i -eq 15 ]]; then
        echo "Error: Port-forward to ArgoCD did not become ready" >&2
        exit 1
    fi
    sleep 1
done

# --- Authenticate and generate API token ---

echo "Authenticating with ArgoCD..."
SESSION_TOKEN=$(curl -sk "https://localhost:${LOCAL_PORT}/api/v1/session" \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" \
    -H 'Content-Type: application/json' \
    | jq -r '.token')

if [[ -z "${SESSION_TOKEN}" || "${SESSION_TOKEN}" == "null" ]]; then
    echo "Error: Failed to authenticate with ArgoCD" >&2
    exit 1
fi

echo "Generating long-lived API token..."
API_TOKEN=$(curl -sk "https://localhost:${LOCAL_PORT}/api/v1/account/admin/token" \
    -X POST \
    -H "Authorization: Bearer ${SESSION_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"expiresIn":0}' \
    | jq -r '.token')

if [[ -z "${API_TOKEN}" || "${API_TOKEN}" == "null" ]]; then
    echo "Error: Failed to generate ArgoCD API token" >&2
    exit 1
fi

# --- Seal the token ---

echo "Sealing token..."

echo -n "${API_TOKEN}" \
| kubectl create secret generic argocd-auth \
    --namespace="${TARGET_NS}" \
    --from-file=argocd-auth-token=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext token was never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Add argocd-auth-sealedsecret.yaml to kustomization.yaml"
echo "  3. Commit and push — ArgoCD will sync the SealedSecret"
