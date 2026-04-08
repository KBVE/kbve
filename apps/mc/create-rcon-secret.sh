#!/usr/bin/env bash
set -euo pipefail

# Generates a random RCON password and stores it directly in the mc namespace.
# The ExternalSecret in arc-runners syncs this into mc-gameserver-secrets.
# No password is ever displayed or passed as input.
#
# Usage:
#   ./create-rcon-secret.sh

NAMESPACE="mc"
SECRET_NAME="mc-rcon-password"
SECRET_KEY="rcon-password"

RCON_PASS="$(openssl rand -base64 32)"

kubectl create secret generic "$SECRET_NAME" \
    --from-literal="$SECRET_KEY=$RCON_PASS" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

echo "Secret $SECRET_NAME created/updated in namespace $NAMESPACE"
