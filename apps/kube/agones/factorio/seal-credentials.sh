#!/usr/bin/env bash
# Seal the Factorio matchmaking credentials.
#
# These are the `username` + `token` that authenticate the dedicated
# server with auth.factorio.com so it can register with the public
# multiplayer browser. Get them from
#   https://www.factorio.com/profile  ("Token" near the bottom).
#
# The token grants list-the-server privilege under the bound username,
# so do not paste it anywhere. Rotate it at the profile page if it ever
# leaks (a fresh token instantly invalidates the previous one).
#
# Output → manifests/credentials-sealed-secret.yaml
# Safe to commit; the sealed-secrets controller decrypts it into a
# normal `factorio-credentials` Secret in the `factorio` namespace.

set -euo pipefail

NS="factorio"
SECRET_NAME="factorio-credentials"
OUT="$(dirname "$0")/manifests/credentials-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found in PATH — install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
    exit 1
fi

read -rp "Factorio matchmaking username: " USERNAME
if [[ -z "${USERNAME}" ]]; then
    echo "Empty username — aborting." >&2
    exit 1
fi

read -rsp "Factorio matchmaking token: " TOKEN
echo
if [[ -z "${TOKEN}" ]]; then
    echo "Empty token — aborting." >&2
    exit 1
fi

read -rsp "Game password (optional; blank = no password): " GAME_PASSWORD
echo

ARGS=(
    --from-literal="username=${USERNAME}"
    --from-literal="token=${TOKEN}"
)
if [[ -n "${GAME_PASSWORD}" ]]; then
    ARGS+=(--from-literal="game_password=${GAME_PASSWORD}")
fi

kubectl create secret generic "${SECRET_NAME}" \
    --namespace="${NS}" \
    "${ARGS[@]}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset TOKEN GAME_PASSWORD

echo "Sealed → ${OUT}"
echo "Commit and ArgoCD will sync."
