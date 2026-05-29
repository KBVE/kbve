#!/usr/bin/env bash
# Seal a fresh random RCON password for the Factorio GameServer.
#
# Unlike seal-credentials.sh (which takes a human-provided value from
# factorio.com), the RCON password is generated locally via
# `openssl rand -hex 24` and immediately fed into kubeseal — the
# plaintext never lands in shell history or on disk.
#
# This script replaces the Password generator + ExternalSecret pattern
# that lived in manifests/rcon-generated-secret.yaml. We're using
# kubeseal until the ES `generators.external-secrets.io/Password` CRD
# is installed cluster-wide (separate follow-up).
#
# Re-run any time you want to rotate the RCON password. The factorio
# and factorio-relay containers re-auth on next pod restart.

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
if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl not found in PATH" >&2
    exit 1
fi

PW="$(openssl rand -hex 24)"

kubectl create secret generic "${SECRET_NAME}" \
    --namespace="${NS}" \
    --from-literal="${KEY}=${PW}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset PW

echo "Sealed → ${OUT}"
echo "Commit and ArgoCD will sync."
