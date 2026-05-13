#!/usr/bin/env bash
# Seal the Discord bot token for the Velocity Discord-relay plugin.
#
# Usage (run once locally — kubeseal needs the running cluster's public key):
#   ./seal-discord-token.sh
# It will prompt for the token (silent input, not echoed, not stored in
# shell history). Output is written to discord-relay-sealed-secret.yaml,
# which IS safe to commit and ArgoCD will sync.
#
# Pre-reqs:
#   - kubectl context pointing at the target cluster
#   - kubeseal CLI installed
#   - sealed-secrets-controller running in kube-system
#
# Re-run any time you rotate the token.

set -euo pipefail

NS="arc-runners"
SECRET_NAME="mc-discord-relay"
KEY="DISCORD_BOT_TOKEN"
OUT="$(dirname "$0")/manifests/discord-relay-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found. Install: brew install kubeseal" >&2
    exit 1
fi

# Read silently — token is not echoed or written to shell history.
read -rsp "Discord bot token: " TOKEN
echo

if [[ -z "${TOKEN}" ]]; then
    echo "Empty token — aborting." >&2
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
