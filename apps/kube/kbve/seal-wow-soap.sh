#!/usr/bin/env bash
# Seal the GM account axum-kbve uses to talk SOAP to the ToCloud9 worldserver.
#
# There is no service-account concept in AzerothCore SOAP. The credentials are
# the username and password of an ordinary account in acore_auth that has been
# granted GM level 3, and every command runs with that account's permissions.
# So the account has to exist before this script is worth running.
#
# Create it first, on a worldserver pod or against MySQL directly:
#
#   kubectl -n tocloud9 exec deploy/mysql -- mysql -u root -p acore_auth
#   > -- then, from a worldserver console or via the AC account command:
#   > .account create KBVE_SOAP <password>
#   > .account set gmlevel KBVE_SOAP 3 -1
#
# Level 3 is what the security-sensitive commands require and -1 scopes it to
# all realms. A lower level does not error at connect time -- it authenticates
# and then refuses individual commands, which reads as a broken integration.
#
# Treat this account as a credential, not a person: it should not be a GM's
# own login, and rotating it means re-running this script and restarting the
# axum-kbve deployment.
#
# The password is read from the terminal, never taken as an argument, so it
# does not land in shell history.

set -euo pipefail

NS="kbve"
OUT="$(dirname "$0")/manifest/wow-soap-sealedsecret.yaml"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

for bin in kubeseal kubectl; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo "$bin not found in PATH" >&2
        exit 1
    fi
done

read -r -p "SOAP GM username: " SOAP_USER
read -r -s -p "SOAP GM password: " SOAP_PASS
echo

if [ -z "${SOAP_USER}" ] || [ -z "${SOAP_PASS}" ]; then
    echo "both values are required" >&2
    exit 1
fi

kubectl create secret generic wow-soap-credentials \
    --namespace="${NS}" \
    --from-literal="username=${SOAP_USER}" \
    --from-literal="password=${SOAP_PASS}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT}"

unset SOAP_USER SOAP_PASS

echo "Sealed → ${OUT}"
echo "Add it to apps/kube/kbve/manifest/kustomization.yaml, commit, and ArgoCD will sync."
