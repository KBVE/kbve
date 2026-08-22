#!/usr/bin/env bash
# Seal the ToCloud9 database credentials.
#
# Generates one random password for the `acore` MySQL user and one for root,
# then renders both sealed secrets the stack needs:
#
#   tocloud9-mysql  root_password / username / password   (the StatefulSet)
#   tocloud9-db     DSNs + AC_*_DATABASE_INFO strings     (every other workload)
#
# Both are derived from the same password here so they cannot drift. The
# plaintext never lands in shell history or on disk — it is generated, piped
# straight into kubeseal, and unset.
#
# Run once before the first ArgoCD sync, then commit both manifests. Re-run to
# rotate, but note that rotating after the databases exist also requires an
# ALTER USER inside MySQL — the sealed value alone will not change what the
# server accepts.

set -euo pipefail

NS="tocloud9"
DB_USER="acore"
OUT_DIR="$(dirname "$0")/manifests"
CONTROLLER_NS="kube-system"
CONTROLLER_NAME="sealed-secrets-controller"

for bin in kubeseal kubectl openssl; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo "$bin not found in PATH" >&2
        exit 1
    fi
done

DB_PASS="$(openssl rand -hex 24)"
ROOT_PASS="$(openssl rand -hex 24)"

kubectl create secret generic tocloud9-mysql \
    --namespace="${NS}" \
    --from-literal="root_password=${ROOT_PASS}" \
    --from-literal="username=${DB_USER}" \
    --from-literal="password=${DB_PASS}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT_DIR}/mysql-sealed-secret.yaml"

# The Go services take Go-style DSNs; the C++ worldserver and the AzerothCore
# importer take semicolon-separated tuples. The characters DSN carries a
# leading "1:" realm prefix — ToCloud9 keys character databases by realm ID.
kubectl create secret generic tocloud9-db \
    --namespace="${NS}" \
    --from-literal="AUTH_DB_CONNECTION=${DB_USER}:${DB_PASS}@tcp(mysql:3306)/acore_auth" \
    --from-literal="CHAR_DB_CONNECTION=1:${DB_USER}:${DB_PASS}@tcp(mysql:3306)/acore_characters" \
    --from-literal="WORLD_DB_CONNECTION=${DB_USER}:${DB_PASS}@tcp(mysql:3306)/acore_world" \
    --from-literal="AC_LOGIN_DATABASE_INFO=mysql;3306;${DB_USER};${DB_PASS};acore_auth" \
    --from-literal="AC_CHARACTER_DATABASE_INFO=mysql;3306;${DB_USER};${DB_PASS};acore_characters" \
    --from-literal="AC_WORLD_DATABASE_INFO=mysql;3306;${DB_USER};${DB_PASS};acore_world" \
    `# No AC_PLAYERBOTS_DATABASE_INFO here on purpose. This script mints a new` \
    `# password on every run, so a key could never be appended to an existing` \
    `# tocloud9-db without rotating the three DSNs the live MySQL still expects.` \
    `# worldserver-fleet.yaml composes that DSN from the tocloud9-mysql secret` \
    `# instead, which also makes it impossible for the two to disagree.` \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-namespace="${CONTROLLER_NS}" \
    --controller-name="${CONTROLLER_NAME}" \
    --format=yaml \
> "${OUT_DIR}/db-sealed-secret.yaml"

unset DB_PASS ROOT_PASS

echo "Sealed → ${OUT_DIR}/mysql-sealed-secret.yaml"
echo "Sealed → ${OUT_DIR}/db-sealed-secret.yaml"
echo "Commit both and ArgoCD will sync."
