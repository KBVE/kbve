#!/usr/bin/env bash
# seal-forgejo-db-credentials.sh — Seal the Forgejo Postgres role password
#
# Pipeline that:
#   1. Prompts for (or reads from env) the forgejo DB password
#   2. Wraps it in a Kubernetes Secret (kubectl --dry-run)
#   3. Encrypts it via kubeseal (cluster public key)
#   4. Writes ONLY the SealedSecret YAML to the repo
#
# The plaintext password exists only in memory between pipe stages.
# It never touches disk, shell history, or git.
#
# The ExternalSecret in the forgejo namespace reads from this secret
# to inject FORGEJO__DATABASE__PASSWD at runtime.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-forgejo-db-credentials.sh
#   # or: FORGEJO_DB_PASSWORD=<value> ./seal-forgejo-db-credentials.sh
#   # or: generate a random password automatically:
#   FORGEJO_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40) \
#     ./seal-forgejo-db-credentials.sh
#
# After sealing:
#   1. Apply the dbmate migration (creates forgejo role)
#   2. Set the role password: ALTER ROLE forgejo WITH PASSWORD '<same-password>';
#   3. Commit + push the sealed secret — ArgoCD syncs it
#   4. ExternalSecret picks up the password → Forgejo restarts with scoped role

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifests/sealed-forgejo-db-credentials.yaml"
TARGET_NS="kilobase"

# --- Preflight checks ---

for cmd in kubectl kubeseal; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed or not in PATH" >&2
        exit 1
    fi
done

if ! kubectl cluster-info &>/dev/null; then
    echo "Error: Cannot connect to Kubernetes cluster" >&2
    exit 1
fi

if ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system namespace" >&2
    exit 1
fi

# --- Get password ---

if [[ -z "${FORGEJO_DB_PASSWORD:-}" ]]; then
    echo -n "Enter Forgejo DB password (or set FORGEJO_DB_PASSWORD env): "
    read -rs FORGEJO_DB_PASSWORD
    echo
fi

if [[ -z "${FORGEJO_DB_PASSWORD}" ]]; then
    echo "Error: Forgejo DB password cannot be empty" >&2
    exit 1
fi

# --- Seal the password ---

echo "Sealing Forgejo DB credentials into ${TARGET_NS} namespace..."

echo -n "${FORGEJO_DB_PASSWORD}" \
| kubectl create secret generic forgejo-db-credentials \
    --namespace="${TARGET_NS}" \
    --from-file=password=/dev/stdin \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext password was never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Commit and push — ArgoCD will sync the SealedSecret to ${TARGET_NS}"
echo "  3. Run dbmate migration to create the forgejo role"
echo "  4. Set role password: psql -c \"ALTER ROLE forgejo WITH PASSWORD '<password>';\""
echo "  5. ExternalSecret in forgejo namespace will pick up the password"
