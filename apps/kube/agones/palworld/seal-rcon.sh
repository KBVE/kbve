#!/usr/bin/env bash
set -euo pipefail

NS="palworld"
SECRET_NAME="palworld-rcon"
OUT="$(dirname "$0")/manifests/rcon-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found in PATH — install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
    exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl not found in PATH" >&2
    exit 1
fi

ADMIN_PW="$(openssl rand -hex 24)"
RCON_PW="$(openssl rand -hex 24)"

kubectl create secret generic "${SECRET_NAME}" \
    --namespace="${NS}" \
    --from-literal="admin_password=${ADMIN_PW}" \
    --from-literal="rcon_password=${RCON_PW}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset ADMIN_PW RCON_PW

echo "Sealed → ${OUT}"
echo "admin_password + rcon_password generated locally; plaintext never written to disk."
echo "Retrieve the live admin password after deploy with:"
echo "  kubectl -n ${NS} get secret ${SECRET_NAME} -o jsonpath='{.data.admin_password}' | base64 -d"
