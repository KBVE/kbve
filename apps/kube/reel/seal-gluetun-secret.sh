#!/usr/bin/env bash
# seal-gluetun-secret.sh — Seal reel-scoped Gluetun provider + port-forwarding config
#
# Creates a SealedSecret (reel-gluetun, namespace reel) that overrides the shared
# vpn-wireguard secret's provider FOR REEL'S GLUETUN ONLY (listed last in envFrom
# so it wins). This turns on NAT-PMP port forwarding for reel without touching the
# shared vpn-wireguard secret (which kasm/firecracker also consume).
#
# The VPN provider name is intentionally NOT hardcoded here — pass it at seal time
# so it never lands in the repo (only inside the encrypted SealedSecret):
#   VPN_SERVICE_PROVIDER=<provider> ./seal-gluetun-secret.sh
# If unset, the script prompts for it.
#
# The WireGuard private key stays in the shared vpn-wireguard secret; only the
# non-sensitive provider/PF flags live here.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   VPN_SERVICE_PROVIDER=<provider> ./seal-gluetun-secret.sh
#   # Output: apps/kube/reel/manifest/sealed-reel-gluetun.yaml
#   git add manifest/sealed-reel-gluetun.yaml && commit — ArgoCD syncs it,
#   reloader rolls the reel pod, port forwarding activates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/manifest/sealed-reel-gluetun.yaml"
TARGET_NS="reel"

if [[ -z "${VPN_SERVICE_PROVIDER:-}" ]]; then
    echo -n "Enter VPN service provider (gluetun VPN_SERVICE_PROVIDER): "
    read -r VPN_SERVICE_PROVIDER
fi
VPN_PORT_FORWARDING="${VPN_PORT_FORWARDING:-on}"
VPN_PORT_FORWARDING_STATUS_FILE="${VPN_PORT_FORWARDING_STATUS_FILE:-/tmp/gluetun/forwarded_port}"
PORT_FORWARD_ONLY="${PORT_FORWARD_ONLY:-on}"

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

echo "Sealing reel-gluetun (VPN port forwarding) for namespace ${TARGET_NS}..."

kubectl create secret generic reel-gluetun \
    --namespace="${TARGET_NS}" \
    --from-literal=VPN_SERVICE_PROVIDER="${VPN_SERVICE_PROVIDER}" \
    --from-literal=VPN_PORT_FORWARDING="${VPN_PORT_FORWARDING}" \
    --from-literal=VPN_PORT_FORWARDING_STATUS_FILE="${VPN_PORT_FORWARDING_STATUS_FILE}" \
    --from-literal=PORT_FORWARD_ONLY="${PORT_FORWARD_ONLY}" \
    --dry-run=client \
    -o yaml \
| kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format=yaml \
> "${OUTPUT_FILE}"

echo ""
echo "Sealed secret written to: ${OUTPUT_FILE}"
echo "Next steps:"
echo "  git add ${OUTPUT_FILE}"
echo "  commit and push — ArgoCD syncs it, reloader rolls the reel pod, PF activates"
