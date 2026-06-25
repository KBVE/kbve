#!/usr/bin/env bash
# seal-apple-signing.sh — Seal Apple Developer ID notarization creds for the
# chuck-launcher Tauri macOS build into Secret chuck-launcher-signing.
#
# This is the durable encrypted store. It is NOT directly consumable by a
# GitHub-hosted macOS runner (no k8s access); CI consumption (gh secret set,
# or a future in-cluster build) is wired separately.
#
# Inputs via env (export before running; values never touch git):
#   APPLE_P12_PATH              path to the exported Developer ID Application .p12
#   APPLE_CERTIFICATE_PASSWORD  the .p12 export password
#   APPLE_SIGNING_IDENTITY      "Developer ID Application: <Name> (<TEAMID>)"
#   APPLE_ID                    apple id email
#   APPLE_PASSWORD              app-specific password (appleid.apple.com)
#   APPLE_TEAM_ID               10-char team id
#
# Usage:
#   APPLE_P12_PATH=~/DeveloperID.p12 APPLE_CERTIFICATE_PASSWORD=... \
#   APPLE_SIGNING_IDENTITY="Developer ID Application: KBVE (XXXXXXXXXX)" \
#   APPLE_ID=you@apple.id APPLE_PASSWORD=abcd-efgh-ijkl-mnop APPLE_TEAM_ID=XXXXXXXXXX \
#   ./apps/kube/chuckrpg/seal-apple-signing.sh
#   # Output: apps/kube/chuckrpg/manifest/chuck-launcher-signing-sealedsecret.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/chuck-launcher-signing-sealedsecret.yaml"
ENV_FILE="${REPO_ROOT}/.env"

for cmd in kubectl kubeseal base64; do
    command -v "$cmd" &>/dev/null || { echo "Error: $cmd not in PATH" >&2; exit 1; }
done

# Pull a key from .env WITHOUT shell expansion (line-parse, strip one layer of
# surrounding quotes), so values containing $ / spaces / parens stay literal.
env_get() {
    local key="$1" line val
    [ -f "${ENV_FILE}" ] || return 1
    line="$(grep -m1 -E "^${key}=" "${ENV_FILE}" || true)"
    [ -n "${line}" ] || return 1
    val="${line#*=}"
    case "${val}" in
        \"*\") val="${val#\"}"; val="${val%\"}" ;;
        \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    printf '%s' "${val}"
}

# Fill from env first, else .env. APPLE_ID falls back to APPLE_DEVELOPER_ID.
: "${APPLE_P12_PATH:=${HOME}/DeveloperID.p12}"
: "${APPLE_CERTIFICATE_PASSWORD:=$(env_get APPLE_CERTIFICATE_PASSWORD || true)}"
: "${APPLE_SIGNING_IDENTITY:=$(env_get APPLE_SIGNING_IDENTITY || true)}"
: "${APPLE_ID:=$(env_get APPLE_ID || env_get APPLE_DEVELOPER_ID || true)}"
: "${APPLE_PASSWORD:=$(env_get APPLE_PASSWORD || true)}"
: "${APPLE_TEAM_ID:=$(env_get APPLE_TEAM_ID || true)}"

: "${APPLE_P12_PATH:?set APPLE_P12_PATH}"
: "${APPLE_CERTIFICATE_PASSWORD:?set APPLE_CERTIFICATE_PASSWORD}"
: "${APPLE_SIGNING_IDENTITY:?set APPLE_SIGNING_IDENTITY}"
: "${APPLE_ID:?set APPLE_ID}"
: "${APPLE_PASSWORD:?set APPLE_PASSWORD}"
: "${APPLE_TEAM_ID:?set APPLE_TEAM_ID}"
[ -f "${APPLE_P12_PATH}" ] || { echo "Error: p12 not found at ${APPLE_P12_PATH}" >&2; exit 1; }

APPLE_CERTIFICATE_B64="$(base64 -i "${APPLE_P12_PATH}" | tr -d '\n')"

kubectl create secret generic chuck-launcher-signing \
    --namespace=chuckrpg \
    --from-literal=APPLE_CERTIFICATE="${APPLE_CERTIFICATE_B64}" \
    --from-literal=APPLE_CERTIFICATE_PASSWORD="${APPLE_CERTIFICATE_PASSWORD}" \
    --from-literal=APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY}" \
    --from-literal=APPLE_ID="${APPLE_ID}" \
    --from-literal=APPLE_PASSWORD="${APPLE_PASSWORD}" \
    --from-literal=APPLE_TEAM_ID="${APPLE_TEAM_ID}" \
    --dry-run=client -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo "Sealed secret written to: ${OUTPUT_FILE}"
