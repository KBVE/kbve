#!/usr/bin/env bash
# Seal the Factorio RCON password.
#
# Usage (run once locally — kubeseal needs the running cluster's public key):
#   ./seal-rcon.sh
# Prompts silently for the password (not echoed, not stored in shell history).
# Output is written to manifests/rcon-sealed-secret.yaml — safe to commit;
# ArgoCD will sync it into the cluster, the sealed-secrets controller
# decrypts it into a regular `factorio-rcon` Secret, and the GameServer pod
# mounts the rcon_password key from it.
#
# Pre-reqs:
#   - kubectl context pointing at the target cluster
#   - kubeseal CLI installed
#   - sealed-secrets-controller running in kube-system

set -euo pipefail

NS="factorio"
SECRET_NAME="factorio-rcon"
KEY="rcon_password"
OUT="$(dirname "$0")/manifests/rcon-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found in PATH — install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
    exit 1
fi

read -rsp "Factorio RCON password: " TOKEN
echo

if [[ -z "${TOKEN}" ]]; then
    echo "Empty password — aborting." >&2
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
