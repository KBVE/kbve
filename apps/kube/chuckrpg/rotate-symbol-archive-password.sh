#!/usr/bin/env bash
# rotate-symbol-archive-password.sh — Rotate SYMBOL_ARCHIVE_PASSWORD, the key that
# encrypts the Unreal debug-symbol artifacts (PDB / dSYM) produced by
# .github/workflows/ci-unreal-build.yml when engine.debug_symbols="1".
#
# The password is stored in TWO places:
#   1. GitHub repo secret SYMBOL_ARCHIVE_PASSWORD — what CI reads at build time.
#   2. SealedSecret chuck-symbol-archive (namespace chuckrpg) — the durable
#      encrypted store in git, so the password survives losing the GitHub secret
#      (which is write-only and cannot be read back).
#
# Rotation is NOT retroactive: symbol archives already uploaded stay encrypted
# with the password that was current when they were built. Record the outgoing
# value (this script prints it when the cluster still holds it) before rotating.
#
# Usage:
#   ./apps/kube/chuckrpg/rotate-symbol-archive-password.sh              # generate + seal + gh secret set
#   SYMBOL_ARCHIVE_PASSWORD=<value> ./…/rotate-symbol-archive-password.sh
#   ./…/rotate-symbol-archive-password.sh --show-current               # print the live password, rotate nothing
#   ./…/rotate-symbol-archive-password.sh --no-github                  # seal only
#   ./…/rotate-symbol-archive-password.sh --no-seal                    # gh secret only
#   ./…/rotate-symbol-archive-password.sh --apply                      # also kubectl apply the SealedSecret
#
# Prerequisites: kubectl (cluster access), kubeseal, gh (authenticated), openssl.
#
# Decrypt a symbol archive with the password:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
#     -pass env:SYMBOL_ARCHIVE_PASSWORD -in <app>-symbols.zip.enc -out symbols.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/chuck-symbol-archive-sealedsecret.yaml"
TARGET_NS="chuckrpg"
SECRET_NAME="chuck-symbol-archive"
SECRET_KEY="SYMBOL_ARCHIVE_PASSWORD"
GH_REPO="${GH_REPO:-KBVE/kbve}"

DO_SEAL=1
DO_GITHUB=1
DO_APPLY=0
SHOW_CURRENT_ONLY=0

while [ $# -gt 0 ]; do
    case "$1" in
        --no-seal) DO_SEAL=0 ;;
        --no-github) DO_GITHUB=0 ;;
        --apply) DO_APPLY=1 ;;
        --show-current) SHOW_CURRENT_ONLY=1 ;;
        --repo) GH_REPO="$2"; shift ;;
        -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Error: unknown argument $1" >&2; exit 1 ;;
    esac
    shift
done

need() { command -v "$1" &>/dev/null || { echo "Error: $1 not in PATH" >&2; exit 1; }; }

need kubectl
need openssl
if [ "${DO_SEAL}" -eq 1 ]; then need kubeseal; fi
if [ "${DO_GITHUB}" -eq 1 ]; then need gh; fi

if ! kubectl cluster-info &>/dev/null; then
    echo "Error: cannot reach the Kubernetes cluster" >&2
    exit 1
fi

if [ "${DO_SEAL}" -eq 1 ] && ! kubectl get deployment sealed-secrets-controller -n kube-system &>/dev/null; then
    echo "Error: sealed-secrets-controller not found in kube-system" >&2
    exit 1
fi

current_password() {
    kubectl get secret "${SECRET_NAME}" -n "${TARGET_NS}" \
        -o "jsonpath={.data.${SECRET_KEY}}" 2>/dev/null \
    | { read -r b64 || true; [ -n "${b64:-}" ] && printf '%s' "${b64}" | base64 -d; }
}

CURRENT="$(current_password || true)"

if [ "${SHOW_CURRENT_ONLY}" -eq 1 ]; then
    if [ -z "${CURRENT}" ]; then
        echo "No live ${SECRET_NAME} secret in namespace ${TARGET_NS}." >&2
        echo "Apply the sealed manifest first: kubectl apply -f ${OUTPUT_FILE}" >&2
        exit 1
    fi
    printf '%s\n' "${CURRENT}"
    exit 0
fi

if [ -n "${CURRENT}" ]; then
    echo "Outgoing password (decrypts every symbol archive built before this rotation):"
    printf '  %s\n\n' "${CURRENT}"
else
    echo "No live ${SECRET_NAME} secret found — treating this as the first issue, not a rotation."
    echo "Symbol archives built with an earlier password can only be opened with a copy you kept."
    echo
fi

if [ -z "${SYMBOL_ARCHIVE_PASSWORD:-}" ]; then
    SYMBOL_ARCHIVE_PASSWORD="$(openssl rand -hex 32)"
    GENERATED=1
else
    GENERATED=0
fi

if [ ${#SYMBOL_ARCHIVE_PASSWORD} -lt 24 ]; then
    echo "Error: password must be at least 24 characters" >&2
    exit 1
fi

if [ "${DO_SEAL}" -eq 1 ]; then
    printf '%s' "${SYMBOL_ARCHIVE_PASSWORD}" \
    | kubectl create secret generic "${SECRET_NAME}" \
        --namespace="${TARGET_NS}" \
        --from-file="${SECRET_KEY}=/dev/stdin" \
        --dry-run=client -o yaml \
    | kubeseal \
        --controller-name=sealed-secrets-controller \
        --controller-namespace=kube-system \
        --format=yaml \
    > "${OUTPUT_FILE}"
    echo "Sealed secret written to: ${OUTPUT_FILE}"

    if [ "${DO_APPLY}" -eq 1 ]; then
        kubectl apply -f "${OUTPUT_FILE}"
        echo "Applied — read it back with: $0 --show-current"
    fi
fi

if [ "${DO_GITHUB}" -eq 1 ]; then
    printf '%s' "${SYMBOL_ARCHIVE_PASSWORD}" \
    | gh secret set "${SECRET_KEY}" --repo "${GH_REPO}"
    echo "GitHub repo secret ${SECRET_KEY} updated on ${GH_REPO}"
fi

echo
if [ "${GENERATED}" -eq 1 ]; then
    echo "New password (store it in your password manager — GitHub cannot read it back):"
    printf '  %s\n' "${SYMBOL_ARCHIVE_PASSWORD}"
fi
echo
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Commit and push — the SealedSecret is the recoverable copy"
echo "  3. Builds started from now on encrypt their symbol archive with the new password"
