#!/usr/bin/env bash
set -euo pipefail

# Generates a random RCON password, seals it via kubeseal, and writes the
# SealedSecret YAML into the repo. Commit the result — ArgoCD syncs it,
# sealed-secrets decrypts it in mc namespace, ExternalSecret syncs to arc-runners.
#
# Usage:  ./create-rcon-secret.sh
#
# Requires: kubeseal, kubectl (context pointed at target cluster)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEALED_OUT="$REPO_ROOT/apps/kube/agones/mc/rcon-sealed-secret.yaml"

NAMESPACE="mc"
SECRET_NAME="mc-rcon-password"
SECRET_KEY="rcon-password"
CONTROLLER_NAME="sealed-secrets-controller"
CONTROLLER_NS="kube-system"

RCON_PASS="$(openssl rand -base64 32)"

kubectl create secret generic "$SECRET_NAME" \
    --from-literal="$SECRET_KEY=$RCON_PASS" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml \
  | kubeseal \
      --controller-name="$CONTROLLER_NAME" \
      --controller-namespace="$CONTROLLER_NS" \
      -o yaml \
  > "$SEALED_OUT"

echo "Wrote sealed secret to: $SEALED_OUT"
echo "Commit and push — ArgoCD handles the rest."
