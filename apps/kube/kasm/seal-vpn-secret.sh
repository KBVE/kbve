#!/usr/bin/env bash
# seal-vpn-secret.sh — Seal the SINGLE shared WireGuard VPN secret (kasm vault)
#
# Creates the canonical vpn-wireguard SealedSecret in the kasm namespace.
# Every VPN consumer flows from this one secret:
#   - kasm: mounts it directly (deployment.yaml)
#   - reel / angelscript / firecracker: pull it via ESO from the kasm vault
#
# Provider server-selection mode: gluetun picks the server itself, so the
# secret carries ONLY the account key + addresses (+ optional country filter).
# Do NOT add WIREGUARD_ENDPOINT_IP / WIREGUARD_ENDPOINT_PORT /
# WIREGUARD_PUBLIC_KEY — gluetun REJECTS pinned endpoints under provider
# server selection ("Wireguard server selection settings: endpoint port is
# set" -> gluetun exits).
#
# The VPN provider name is intentionally NOT hardcoded here — pass it at seal
# time so it never lands in the repo (only inside the encrypted SealedSecret):
#   VPN_SERVICE_PROVIDER=<provider> ./seal-vpn-secret.sh
# If unset, the script prompts for it.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   VPN_SERVICE_PROVIDER=<provider> ./seal-vpn-secret.sh
#   # Output: apps/kube/kasm/manifest/sealed-vpn-wireguard.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-vpn-wireguard.yaml"
TARGET_NS="kasm"

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

# --- Get credentials (env vars or interactive prompt) ---

if [[ -z "${VPN_SERVICE_PROVIDER:-}" ]]; then
    echo -n "Enter VPN service provider (gluetun VPN_SERVICE_PROVIDER): "
    read -r VPN_SERVICE_PROVIDER
fi

if [[ -z "${WG_PRIVATE_KEY:-}" ]]; then
    echo -n "Enter WireGuard PrivateKey: "
    read -rs WG_PRIVATE_KEY
    echo
fi

WG_ADDRESS="${WG_ADDRESS:-10.2.0.2/32}"
SERVER_COUNTRIES="${SERVER_COUNTRIES:-Germany}"

# --- Seal the credentials ---

echo "Sealing the shared WireGuard VPN secret into the ${TARGET_NS} vault..."

kubectl create secret generic vpn-wireguard \
    --namespace="${TARGET_NS}" \
    --from-literal=VPN_SERVICE_PROVIDER="${VPN_SERVICE_PROVIDER}" \
    --from-literal=VPN_TYPE="wireguard" \
    --from-literal=WIREGUARD_PRIVATE_KEY="${WG_PRIVATE_KEY}" \
    --from-literal=WIREGUARD_ADDRESSES="${WG_ADDRESS}" \
    --from-literal=SERVER_COUNTRIES="${SERVER_COUNTRIES}" \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Plaintext credentials were never written to disk."
echo ""
echo "Next steps:"
echo "  1. git add ${OUTPUT_FILE}"
echo "  2. Commit and push — ArgoCD syncs it; reloader rolls kasm/reel/angelscript/firecracker"
