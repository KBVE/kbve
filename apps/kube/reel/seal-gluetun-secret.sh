#!/usr/bin/env bash
# seal-gluetun-secret.sh — Seal reel-scoped Gluetun port-forwarding toggles
#
# Creates a SealedSecret (reel-gluetun) in the kasm VAULT namespace, alongside
# the shared vpn-wireguard secret. reel pulls it into its own namespace via ESO
# (see apps/kube/reel/manifest/external-secrets.yaml) and layers it LAST in the
# gluetun envFrom so it overrides the shared values FOR REEL ONLY.
#
# Since the shared vpn-wireguard secret moved to provider server-selection mode
# (no pinned endpoint), this overlay carries ONLY the port-forwarding toggles —
# no provider override and no endpoint null-outs. WireGuard connection data
# lives in exactly one place: the kasm vpn-wireguard secret.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   ./seal-gluetun-secret.sh
#   # Output: apps/kube/kasm/manifest/sealed-reel-gluetun.yaml
#   git add ../kasm/manifest/sealed-reel-gluetun.yaml && commit — ArgoCD syncs it
#   into the kasm vault, reel's ExternalSecret materializes it, the reel pod
#   rolls, port forwarding activates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$(cd "${SCRIPT_DIR}/../kasm/manifest" && pwd)/sealed-reel-gluetun.yaml"
TARGET_NS="kasm"

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

echo "Sealing reel-gluetun (port forwarding toggles) into the ${TARGET_NS} vault..."

kubectl create secret generic reel-gluetun \
    --namespace="${TARGET_NS}" \
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
echo "  commit and push — ArgoCD syncs it into the kasm vault, reel's ExternalSecret"
echo "  pulls it, the reel pod rolls, port forwarding activates"
