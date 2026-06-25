#!/usr/bin/env bash
# Generate a random keycloak DB password and seal it into BOTH namespaces it is
# needed in, plus the bootstrap admin creds. Run from the repo root, then commit
# the two regenerated sealed files.
#
#   1. keycloak-db-password  (ns kilobase, basic-auth) — CNPG managed-role reads
#      this to set the `keycloak` role password on the supabase-cluster.
#   2. keycloak-credentials  (ns keycloak)             — the Keycloak pod auths
#      to Postgres with db-password (== the password above) and seeds the
#      master-realm admin from admin-username/admin-password.
#
# The DB password is generated ONCE here so both secrets always agree.
#
# Prereqs: kubectl + kubeseal, sealed-secrets-controller in kube-system.
set -euo pipefail

DB_OUT="apps/kube/kilobase/manifests/sealed-keycloak-db-password.yaml"
CRED_OUT="apps/kube/keycloak/manifest/sealed-credentials.yaml"

DB_ROLE="keycloak"
ADMIN_USER="${KC_ADMIN_USER:-admin}"

for cmd in kubectl kubeseal openssl; do
    command -v "$cmd" >/dev/null || { echo "Error: $cmd not found" >&2; exit 1; }
done

if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system" >&2
    exit 1
fi

DB_PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)"
ADMIN_PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"

seal() {
    kubeseal \
        --controller-name=sealed-secrets-controller \
        --controller-namespace=kube-system \
        --format=yaml
}

kubectl create secret generic keycloak-db-password \
    --namespace=kilobase \
    --type=kubernetes.io/basic-auth \
    --from-literal=username="$DB_ROLE" \
    --from-literal=password="$DB_PASS" \
    --dry-run=client -o yaml \
| seal > "$DB_OUT"

kubectl create secret generic keycloak-credentials \
    --namespace=keycloak \
    --from-literal=db-username="$DB_ROLE" \
    --from-literal=db-password="$DB_PASS" \
    --from-literal=admin-username="$ADMIN_USER" \
    --from-literal=admin-password="$ADMIN_PASS" \
    --dry-run=client -o yaml \
| seal > "$CRED_OUT"

echo "Wrote:"
echo "  $DB_OUT"
echo "  $CRED_OUT"
echo
echo "Bootstrap admin (SAVE NOW — not recoverable from the sealed file):"
echo "  username: $ADMIN_USER"
echo "  password: $ADMIN_PASS"
echo
echo "Commit both files. CNPG sets the role password on reconcile; the dbmate"
echo "keycloak_schema migration creates the schema; Keycloak builds its tables."
