#!/usr/bin/env bash
set -euo pipefail

# Creates the mc-rcon-password secret in the mc namespace.
# The ExternalSecret in arc-runners syncs this into mc-gameserver-secrets.
#
# Usage:
#   ./create-rcon-secret.sh                  # prompts for password
#   ./create-rcon-secret.sh 'my-password'    # inline

NAMESPACE="mc"
SECRET_NAME="mc-rcon-password"
SECRET_KEY="rcon-password"

if [ "${1:-}" != "" ]; then
    RCON_PASS="$1"
else
    read -rsp "Enter RCON password: " RCON_PASS
    echo
fi

if [ -z "$RCON_PASS" ]; then
    echo "Error: password cannot be empty" >&2
    exit 1
fi

kubectl create secret generic "$SECRET_NAME" \
    --from-literal="$SECRET_KEY=$RCON_PASS" \
    -n "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

echo "Secret $SECRET_NAME created/updated in namespace $NAMESPACE"
