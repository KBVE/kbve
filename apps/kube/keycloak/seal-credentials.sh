#!/usr/bin/env bash
# Seal the keycloak-credentials Secret into manifest/sealed-credentials.yaml.
#
# Prereqs:
#   - kubectl + kubeseal (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#   - the keycloak Postgres schema + user already created on the kilobase
#     CNPG cluster (see README.md "Database" section)
#
# Usage: run from the repo root, then commit the regenerated sealed file.
set -euo pipefail

OUT="apps/kube/keycloak/manifest/sealed-credentials.yaml"

for cmd in kubectl kubeseal; do
    command -v "$cmd" >/dev/null || { echo "Error: $cmd not found" >&2; exit 1; }
done

if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system" >&2
    exit 1
fi

read -rp  "Keycloak DB username (kilobase): " DB_USER
read -rsp "Keycloak DB password: " DB_PASS; echo
read -rp  "Keycloak admin username [admin]: " ADMIN_USER; ADMIN_USER=${ADMIN_USER:-admin}
read -rsp "Keycloak admin password: " ADMIN_PASS; echo

kubectl create secret generic keycloak-credentials \
    --namespace=keycloak \
    --from-literal=db-username="$DB_USER" \
    --from-literal=db-password="$DB_PASS" \
    --from-literal=admin-username="$ADMIN_USER" \
    --from-literal=admin-password="$ADMIN_PASS" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "$OUT"

echo "Wrote $OUT — commit it."
