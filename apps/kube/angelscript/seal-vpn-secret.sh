#!/usr/bin/env bash
# seal-vpn-secret.sh — Seal WireGuard VPN credentials for the angelscript
# namespace (gluetun-builder-egress proxy pod). SealedSecret is namespace-
# scoped, so the KASM-namespace sealed secret cannot be reused as-is — this
# script re-seals the same credentials against the `angelscript` namespace.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./apps/kube/angelscript/seal-vpn-secret.sh
#   # Output: apps/kube/angelscript/manifest/sealed-vpn-wireguard.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-vpn-wireguard.yaml"
TARGET_NS="angelscript"

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

if [[ -z "${WG_PRIVATE_KEY:-}" ]]; then
    echo -n "Enter WireGuard PrivateKey: "
    read -rs WG_PRIVATE_KEY
    echo
fi

WG_ADDRESS="${WG_ADDRESS:-10.2.0.2/32}"
WG_PUBLIC_KEY="${WG_PUBLIC_KEY:-}"
WG_ENDPOINT_IP="${WG_ENDPOINT_IP:-}"
WG_ENDPOINT_PORT="${WG_ENDPOINT_PORT:-51820}"
VPN_PROVIDER="${VPN_PROVIDER:-custom}"

if [[ -z "${WG_PUBLIC_KEY}" ]]; then
    echo -n "Enter WireGuard peer PublicKey: "
    read -r WG_PUBLIC_KEY
fi

if [[ -z "${WG_ENDPOINT_IP}" ]]; then
    echo -n "Enter WireGuard Endpoint IP: "
    read -r WG_ENDPOINT_IP
fi

echo "Sealing WireGuard VPN credentials into namespace '${TARGET_NS}'..."

kubectl create secret generic vpn-wireguard \
    --namespace="${TARGET_NS}" \
    --from-literal=VPN_SERVICE_PROVIDER="${VPN_PROVIDER}" \
    --from-literal=VPN_TYPE="wireguard" \
    --from-literal=WIREGUARD_PRIVATE_KEY="${WG_PRIVATE_KEY}" \
    --from-literal=WIREGUARD_ADDRESSES="${WG_ADDRESS}" \
    --from-literal=WIREGUARD_PUBLIC_KEY="${WG_PUBLIC_KEY}" \
    --from-literal=WIREGUARD_ENDPOINT_IP="${WG_ENDPOINT_IP}" \
    --from-literal=WIREGUARD_ENDPOINT_PORT="${WG_ENDPOINT_PORT}" \
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
echo "  2. Commit and push — ArgoCD will sync the SealedSecret into ${TARGET_NS}"
echo "  3. Confirm proxy: kubectl get deploy gluetun-builder-egress -n ${TARGET_NS}"
