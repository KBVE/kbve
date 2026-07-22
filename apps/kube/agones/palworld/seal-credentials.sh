#!/usr/bin/env bash
set -euo pipefail

NS="palworld"
SECRET_NAME="palworld-credentials"
OUT="$(dirname "$0")/manifests/credentials-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found in PATH — install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
    exit 1
fi

read -rsp "Palworld server join password (blank = open server): " SERVER_PASSWORD
echo

kubectl create secret generic "${SECRET_NAME}" \
    --namespace="${NS}" \
    --from-literal="server_password=${SERVER_PASSWORD}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset SERVER_PASSWORD

echo "Sealed → ${OUT}"
echo "Commit and ArgoCD will sync."
