#!/usr/bin/env bash
# seal-vpn-secret.sh — Seal a per-consumer WireGuard VPN secret (kasm vault)
#
# One vault namespace (kasm), one secret PER consumer — concurrent tunnels
# sharing one WireGuard identity collide (the VPN server keeps a single peer
# endpoint per key, so two pods keep stealing return traffic from each other,
# and NAT-PMP port mappings never survive a renewal). Per the provider's
# multi-tunnel guidance each consumer uses the same key but a distinct
# tunnel address (10.2.0.2/32, 10.3.0.2/32, 10.4.0.2/32, ...).
#
#   APP=""            -> vpn-wireguard             (reel via ESO), 10.2.0.2/32
#   APP=kasm          -> vpn-wireguard-kasm        (kasm direct),  10.3.0.2/32
#   APP=firecracker   -> vpn-wireguard-firecracker (ESO),          10.4.0.2/32
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
#   VPN_SERVICE_PROVIDER=<provider> WG_ADDRESS=10.3.0.2/32 APP=kasm ./seal-vpn-secret.sh
#   # Output: apps/kube/kasm/manifest/sealed-vpn-wireguard[-<app>].yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-}"
SECRET_NAME="vpn-wireguard${APP:+-${APP}}"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-${SECRET_NAME}.yaml"
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

echo "Sealing ${SECRET_NAME} into the ${TARGET_NS} vault..."

kubectl create secret generic "${SECRET_NAME}" \
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
