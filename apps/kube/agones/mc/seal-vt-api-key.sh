#!/usr/bin/env bash
# Seal the VirusTotal API key for the Agones-managed Fabric MC fleet.
#
# Usage (run once locally — kubeseal needs the running cluster's public key):
#   ./seal-vt-api-key.sh
# Prompts silently for the key (not echoed, not stored in shell history).
# Output is written to vt-api-key-sealed-secret.yaml — safe to commit;
# ArgoCD will sync it into the cluster.
#
# Pre-reqs:
#   - kubectl context pointing at the target cluster
#   - kubeseal CLI installed
#   - sealed-secrets-controller running in kube-system
#
# Re-run any time you rotate the key.

set -euo pipefail

NS="arc-runners"
SECRET_NAME="mc-vt-api-key"
KEY="VT_API_KEY"
OUT="$(dirname "$0")/vt-api-key-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found. Install: brew install kubeseal" >&2
    exit 1
fi

read -rsp "VirusTotal API key: " TOKEN
echo

if [[ -z "${TOKEN}" ]]; then
    echo "Empty key — aborting." >&2
    exit 1
fi

kubectl create secret generic "${SECRET_NAME}" \
    --namespace="${NS}" \
    --from-literal="${KEY}=${TOKEN}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset TOKEN

echo "Sealed → ${OUT}"
echo "Commit and ArgoCD will sync."
