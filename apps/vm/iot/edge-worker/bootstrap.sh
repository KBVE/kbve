#!/bin/sh
# ============================================================================
# KBVE IoT Edge Worker — bootstrap helper
#
# Generates a per-laptop cloud-init YAML from cloud-init.yaml.tmpl by
# substituting placeholders. Meant to run on the operator's workstation
# before deploying the VM to OrbStack / Lima / UTM.
#
# Subcommands:
#   keygen                 — generate a wireguard keypair (stdout: pubkey)
#   render [args]          — render cloud-init from the template
#
# Example workflow (operator):
#   1. ./bootstrap.sh keygen > wg0.key          # stores private key locally
#   2. wg pubkey < wg0.key                      # get public key
#   3. (out-of-band) add peer to Talos server wg config
#   4. (out-of-band) kubeadm token create --print-join-command  # get token + ca-hash
#   5. ./bootstrap.sh render \
#          --name edge-laptop-01 \
#          --wg-address 10.88.0.12/32 \
#          --wg-peer-pubkey <talos-wg-pubkey> \
#          --wg-endpoint 10.0.0.1:51820 \
#          --wg-allowed-ips 10.96.0.0/12,10.244.0.0/16 \
#          --apiserver https://10.88.0.1:6443 \
#          --token abcdef.1234567890abcdef \
#          --ca-hash sha256:abc123... \
#          --k8s-version 1.33 \
#          --wg-private-key "$(cat wg0.key)" \
#          > edge-laptop-01.cloud-init.yaml
#   6. orbctl create alpine edge-laptop-01 --cloud-init=edge-laptop-01.cloud-init.yaml
# ============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/cloud-init.yaml.tmpl"

usage() {
    cat <<EOF
usage: $0 <subcommand> [args]

subcommands:
  keygen                         generate a wireguard private key (stdout)
  render [flags]                 render cloud-init.yaml from template

render flags (all required):
  --name <hostname>              node name / hostname
  --wg-private-key <key>         wireguard private key (from keygen)
  --wg-address <cidr>            tunnel IP with prefix (e.g. 10.88.0.12/32)
  --wg-peer-pubkey <key>         server-side wireguard public key
  --wg-endpoint <host:port>      server-side wireguard endpoint
  --wg-allowed-ips <csv>         cluster CIDRs (e.g. 10.96.0.0/12,10.244.0.0/16)
  --apiserver <url>              kube-apiserver URL (https://...)
  --token <token>                kubeadm bootstrap token
  --ca-hash <sha256:...>         discovery-token-ca-cert-hash
  --k8s-version <x.y>            cluster minor version (e.g. 1.33)
EOF
    exit 1
}

cmd_keygen() {
    if command -v wg >/dev/null 2>&1; then
        wg genkey
    elif command -v docker >/dev/null 2>&1; then
        docker run --rm alpine:3.21 sh -c 'apk add --no-cache wireguard-tools >/dev/null && wg genkey'
    else
        echo "error: need either 'wg' (wireguard-tools) or 'docker' installed" >&2
        exit 1
    fi
}

cmd_render() {
    NODE_NAME=""
    WG_PRIVATE_KEY=""
    WG_ADDRESS=""
    WG_PEER_PUBKEY=""
    WG_ENDPOINT=""
    WG_ALLOWED_IPS=""
    APISERVER_ENDPOINT=""
    BOOTSTRAP_TOKEN=""
    CA_CERT_HASH=""
    K8S_VERSION=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --name) NODE_NAME="$2"; shift 2 ;;
            --wg-private-key) WG_PRIVATE_KEY="$2"; shift 2 ;;
            --wg-address) WG_ADDRESS="$2"; shift 2 ;;
            --wg-peer-pubkey) WG_PEER_PUBKEY="$2"; shift 2 ;;
            --wg-endpoint) WG_ENDPOINT="$2"; shift 2 ;;
            --wg-allowed-ips) WG_ALLOWED_IPS="$2"; shift 2 ;;
            --apiserver) APISERVER_ENDPOINT="$2"; shift 2 ;;
            --token) BOOTSTRAP_TOKEN="$2"; shift 2 ;;
            --ca-hash) CA_CERT_HASH="$2"; shift 2 ;;
            --k8s-version) K8S_VERSION="$2"; shift 2 ;;
            *) echo "unknown flag: $1" >&2; usage ;;
        esac
    done

    for var in NODE_NAME WG_PRIVATE_KEY WG_ADDRESS WG_PEER_PUBKEY WG_ENDPOINT \
               WG_ALLOWED_IPS APISERVER_ENDPOINT BOOTSTRAP_TOKEN CA_CERT_HASH \
               K8S_VERSION; do
        eval "val=\$$var"
        if [ -z "$val" ]; then
            echo "error: --${var} is required" >&2
            usage
        fi
    done

    if [ ! -f "$TEMPLATE" ]; then
        echo "error: template not found at $TEMPLATE" >&2
        exit 1
    fi

    sed \
        -e "s|__NODE_NAME__|${NODE_NAME}|g" \
        -e "s|__WG_PRIVATE_KEY__|${WG_PRIVATE_KEY}|g" \
        -e "s|__WG_ADDRESS__|${WG_ADDRESS}|g" \
        -e "s|__WG_PEER_PUBKEY__|${WG_PEER_PUBKEY}|g" \
        -e "s|__WG_ENDPOINT__|${WG_ENDPOINT}|g" \
        -e "s|__WG_ALLOWED_IPS__|${WG_ALLOWED_IPS}|g" \
        -e "s|__APISERVER_ENDPOINT__|${APISERVER_ENDPOINT}|g" \
        -e "s|__BOOTSTRAP_TOKEN__|${BOOTSTRAP_TOKEN}|g" \
        -e "s|__CA_CERT_HASH__|${CA_CERT_HASH}|g" \
        -e "s|__K8S_VERSION__|${K8S_VERSION}|g" \
        "$TEMPLATE"
}

case "${1:-}" in
    keygen) shift; cmd_keygen "$@" ;;
    render) shift; cmd_render "$@" ;;
    -h|--help|help|"") usage ;;
    *) echo "unknown subcommand: $1" >&2; usage ;;
esac
