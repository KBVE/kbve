#!/usr/bin/env bash
# Seal the IRC credentials for the factorio-relay sidecar.
#
# All keys are optional from the relay's point of view (the GameServer
# manifest marks each `secretKeyRef` with optional: true), so unset fields
# fall back to the defaults baked into the relay binary
# (irc.kbve.com:6697, nick factorio-bot, no NickServ identify).
#
# Usage:
#   ./seal-irc-creds.sh
#
# Output is written to manifests/irc-creds-sealed-secret.yaml — safe to
# commit. The relay reads:
#   irc_server, irc_port, irc_nick, irc_password
# from the resulting `factorio-irc` Secret.

set -euo pipefail

NS="factorio"
SECRET_NAME="factorio-irc"
OUT="$(dirname "$0")/manifests/irc-creds-sealed-secret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

if ! command -v kubeseal >/dev/null 2>&1; then
    echo "kubeseal not found in PATH — install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
    exit 1
fi

read -rp "IRC server [irc.kbve.com]: " IRC_SERVER
IRC_SERVER="${IRC_SERVER:-irc.kbve.com}"
read -rp "IRC port [6697]: " IRC_PORT
IRC_PORT="${IRC_PORT:-6697}"
read -rp "IRC nick [factorio-bot]: " IRC_NICK
IRC_NICK="${IRC_NICK:-factorio-bot}"
read -rsp "IRC password (blank to skip NickServ identify): " IRC_PASSWORD
echo

ARGS=(
    --from-literal="irc_server=${IRC_SERVER}"
    --from-literal="irc_port=${IRC_PORT}"
    --from-literal="irc_nick=${IRC_NICK}"
)
if [[ -n "${IRC_PASSWORD}" ]]; then
    ARGS+=(--from-literal="irc_password=${IRC_PASSWORD}")
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

unset IRC_PASSWORD

echo "Sealed → ${OUT}"
echo "Commit and ArgoCD will sync."
