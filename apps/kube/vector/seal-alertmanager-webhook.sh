#!/usr/bin/env bash
# seal-alertmanager-webhook.sh — Seal the shared basic-auth credential that
# gates Vector's alertmanager_webhook source on :9002.
#
# Alertmanager (monitoring ns) POSTs alerts to the Vector http_server source
# (vector ns). This seals ONE random password into BOTH namespaces so the
# caller and the listener share the secret:
#
#   vector ns     secret vector-alertmanager-webhook  key password
#                 -> Vector reads it as ${ALERTMANAGER_WEBHOOK_PASSWORD}
#   monitoring ns secret vector-webhook-auth          keys username + password
#                 -> AlertmanagerConfig httpConfig.basicAuth references it
#
# Username is the fixed non-secret literal "alertmanager" (matches the Vector
# source config). Rotate by re-running this script, commit, ArgoCD syncs both.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-alertmanager-webhook.sh
#   # or supply your own: WEBHOOK_PASSWORD=<value> ./seal-alertmanager-webhook.sh
#
# Output:
#   apps/kube/vector/manifests/sealed-alertmanager-webhook.yaml
#   apps/kube/monitoring/manifests/sealed-vector-webhook-auth.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
VECTOR_OUT="${SCRIPT_DIR}/manifests/sealed-alertmanager-webhook.yaml"
MONITORING_OUT="${REPO_ROOT}/apps/kube/monitoring/manifests/sealed-vector-webhook-auth.yaml"

WEBHOOK_USER="alertmanager"

for cmd in kubectl kubeseal openssl; do
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

WEBHOOK_PASSWORD="${WEBHOOK_PASSWORD:-$(openssl rand -hex 24)}"

echo "Sealing alertmanager webhook credential into vector + monitoring..."

kubectl create secret generic vector-alertmanager-webhook \
    --namespace=vector \
    --from-literal=password="${WEBHOOK_PASSWORD}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${VECTOR_OUT}"

kubectl create secret generic vector-webhook-auth \
    --namespace=monitoring \
    --from-literal=username="${WEBHOOK_USER}" \
    --from-literal=password="${WEBHOOK_PASSWORD}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${MONITORING_OUT}"

unset WEBHOOK_PASSWORD

echo ""
echo "Sealed secrets written to:"
echo "  ${VECTOR_OUT}"
echo "  ${MONITORING_OUT}"
echo "Plaintext password was never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add the two sealed manifests"
echo "  2. Commit and push — ArgoCD syncs both namespaces"
echo "  3. Vector rejects unauthenticated POST to :9002 (401)"
