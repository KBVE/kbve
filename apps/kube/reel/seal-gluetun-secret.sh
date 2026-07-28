#!/usr/bin/env bash
# seal-gluetun-secret.sh — Seal reel-scoped Gluetun provider + port-forwarding config
#
# Creates a SealedSecret (reel-gluetun) in the kasm VAULT namespace, alongside the
# shared vpn-wireguard secret. reel pulls it into its own namespace via ESO
# (see apps/kube/reel/manifest/external-secrets.yaml) and layers it LAST in the
# gluetun envFrom so it overrides the shared vpn-wireguard values FOR REEL ONLY —
# kasm/firecracker/angelscript keep the untouched custom config.
#
# Everything reel's gluetun consumes now flows through ESO from the single kasm
# vault (no reel-local SealedSecret to drift out of sync).
#
# Why the endpoint keys are nulled:
#   The shared vpn-wireguard secret is a CUSTOM-provider WireGuard config —
#   it pins WIREGUARD_ENDPOINT_IP / WIREGUARD_ENDPOINT_PORT / WIREGUARD_PUBLIC_KEY
#   to one server. A real provider (with NAT-PMP port forwarding) selects its own
#   server, and gluetun REJECTS a pinned endpoint under provider server-selection
#   ("Wireguard server selection settings: endpoint port is set" -> gluetun exits).
#   So we blank those three; WIREGUARD_ADDRESSES + WIREGUARD_PRIVATE_KEY stay
#   inherited from the shared secret (the provider's wireguard still needs them).
#
# The VPN provider name is intentionally NOT hardcoded here — pass it at seal time
# so it never lands in the repo (only inside the encrypted SealedSecret):
#   VPN_SERVICE_PROVIDER=<provider> ./seal-gluetun-secret.sh
# If unset, the script prompts for it.
#
# Prerequisites:
#   - kubectl configured with cluster access
#   - kubeseal installed (brew install kubeseal)
#   - sealed-secrets-controller running in kube-system
#
# Usage:
#   VPN_SERVICE_PROVIDER=<provider> ./seal-gluetun-secret.sh
#   # Output: apps/kube/kasm/manifest/sealed-reel-gluetun.yaml
#   git add ../kasm/manifest/sealed-reel-gluetun.yaml && commit — ArgoCD syncs it
#   into the kasm vault, reel's ExternalSecret materializes it, the reel pod rolls,
#   port forwarding activates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$(cd "${SCRIPT_DIR}/../kasm/manifest" && pwd)/sealed-reel-gluetun.yaml"
TARGET_NS="kasm"

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

echo "Sealing reel-gluetun (VPN provider + port forwarding) into the ${TARGET_NS} vault..."

kubectl create secret generic reel-gluetun \
    --namespace="${TARGET_NS}" \
    --from-literal=VPN_SERVICE_PROVIDER="${VPN_SERVICE_PROVIDER}" \
    --from-literal=VPN_PORT_FORWARDING="${VPN_PORT_FORWARDING}" \
    --from-literal=VPN_PORT_FORWARDING_STATUS_FILE="${VPN_PORT_FORWARDING_STATUS_FILE}" \
    --from-literal=PORT_FORWARD_ONLY="${PORT_FORWARD_ONLY}" \
    --from-literal=WIREGUARD_ENDPOINT_IP="" \
    --from-literal=WIREGUARD_ENDPOINT_PORT="" \
    --from-literal=WIREGUARD_PUBLIC_KEY="" \
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
