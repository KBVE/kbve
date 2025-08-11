#!/bin/bash

# Intel NUC Talos Worker Node Preparation Script
# This script prepares an Intel NUC for joining a Talos Linux cluster
# Usage: ./prepare-nuc.sh [NUC_NUMBER] [CONTROL_PLANE_IP] [WG_NETWORK_BASE]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NUC_NUMBER="${1:-1}"
CONTROL_PLANE_IP="${2:-}"
WG_NETWORK_BASE="${3:-10.0.0}"
TALOS_VERSION="${TALOS_VERSION:-v1.8.0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validation functions
validate_inputs() {
    if [[ -z "$CONTROL_PLANE_IP" ]]; then
        log_error "Control plane IP is required"
        echo "Usage: $0 [NUC_NUMBER] [CONTROL_PLANE_IP] [WG_NETWORK_BASE]"
        exit 1
    fi

    if ! [[ "$NUC_NUMBER" =~ ^[0-9]+$ ]] || [[ "$NUC_NUMBER" -lt 1 ]] || [[ "$NUC_NUMBER" -gt 253 ]]; then
        log_error "NUC_NUMBER must be a number between 1 and 253"
        exit 1
    fi

    if ! [[ "$CONTROL_PLANE_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        log_error "Invalid control plane IP format"
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "wg" "talosctl")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Required dependency '$dep' is not installed"
            exit 1
        fi
    done
    
    log_info "All dependencies are available"
}

# Generate WireGuard keys
generate_wireguard_keys() {
    local nuc_id=$(printf "%02d" "$NUC_NUMBER")
    local key_dir="$SCRIPT_DIR/keys"
    
    mkdir -p "$key_dir"
    
    if [[ ! -f "$key_dir/nuc-$nuc_id-private.key" ]]; then
        log_info "Generating WireGuard keys for NUC-$nuc_id"
        wg genkey | tee "$key_dir/nuc-$nuc_id-private.key" | wg pubkey > "$key_dir/nuc-$nuc_id-public.key"
        chmod 600 "$key_dir/nuc-$nuc_id-private.key"
        chmod 644 "$key_dir/nuc-$nuc_id-public.key"
    else
        log_info "WireGuard keys already exist for NUC-$nuc_id"
    fi
    
    echo "$key_dir/nuc-$nuc_id-private.key"
}

# Generate worker configuration
generate_worker_config() {
    local nuc_id=$(printf "%02d" "$NUC_NUMBER")
    local private_key_file="$1"
    local config_dir="$SCRIPT_DIR/configs"
    local config_file="$config_dir/worker-nuc-$nuc_id.yaml"
    local wg_ip="$WG_NETWORK_BASE.$((9 + NUC_NUMBER))"
    
    mkdir -p "$config_dir"
    
    local private_key=$(cat "$private_key_file")
    
    log_info "Generating worker configuration for NUC-$nuc_id at WireGuard IP $wg_ip"
    
    # Use the template and substitute values
    local template_file="$SCRIPT_DIR/../talos-worker.yaml"
    if [[ ! -f "$template_file" ]]; then
        log_error "Worker template not found at $template_file"
        exit 1
    fi
    
    # Create worker config with substitutions
    cat "$template_file" | \
        sed "s|hostname: \"\"|hostname: \"nuc-$nuc_id\"|g" | \
        sed "s|privateKey: \"\"|privateKey: \"$private_key\"|g" | \
        sed "s|endpoint: \"\"|endpoint: \"$CONTROL_PLANE_IP:51820\"|g" | \
        sed "s|10\.0\.0\.0/32|$wg_ip/32|g" | \
        sed "s|gateway: 10\.0\.0\.1|gateway: $WG_NETWORK_BASE.1|g" | \
        sed "s|endpoint: udp://10\.0\.0\.1:514|endpoint: udp://$WG_NETWORK_BASE.1:514|g" | \
        sed "s|endpoint: https://10\.0\.0\.1:6443|endpoint: https://$WG_NETWORK_BASE.1:6443|g" \
        > "$config_file"
    
    log_info "Worker configuration saved to $config_file"
    echo "$config_file"
}

# Wait for NUC to be accessible
wait_for_nuc() {
    local nuc_ip="$1"
    local timeout=300
    local elapsed=0
    
    log_info "Waiting for NUC at $nuc_ip to be accessible..."
    
    while [[ $elapsed -lt $timeout ]]; do
        if talosctl --talosconfig=/dev/null time --nodes "$nuc_ip" &>/dev/null; then
            log_info "NUC at $nuc_ip is accessible"
            return 0
        fi
        
        sleep 10
        elapsed=$((elapsed + 10))
        echo -n "."
    done
    
    log_error "NUC at $nuc_ip is not accessible after ${timeout}s"
    return 1
}

# Apply configuration to NUC
apply_config_to_nuc() {
    local nuc_ip="$1"
    local config_file="$2"
    
    log_info "Applying configuration to NUC at $nuc_ip"
    
    if talosctl apply-config --insecure --nodes "$nuc_ip" --file "$config_file"; then
        log_info "Configuration applied successfully"
        return 0
    else
        log_error "Failed to apply configuration"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting Intel NUC Talos worker preparation"
    log_info "NUC Number: $NUC_NUMBER"
    log_info "Control Plane IP: $CONTROL_PLANE_IP"
    log_info "WireGuard Network Base: $WG_NETWORK_BASE"
    
    validate_inputs
    check_dependencies
    
    # Generate WireGuard keys
    local private_key_file
    private_key_file=$(generate_wireguard_keys)
    
    # Generate worker configuration
    local config_file
    config_file=$(generate_worker_config "$private_key_file")
    
    # Print public key for control plane configuration
    local nuc_id=$(printf "%02d" "$NUC_NUMBER")
    local public_key_file="$(dirname "$private_key_file")/nuc-$nuc_id-public.key"
    local public_key=$(cat "$public_key_file")
    
    echo
    log_info "=== NUC-$nuc_id Setup Complete ==="
    echo "Public Key: $public_key"
    echo "WireGuard IP: $WG_NETWORK_BASE.$((9 + NUC_NUMBER))"
    echo "Config File: $config_file"
    echo
    log_warn "Add this public key to the control plane's WireGuard configuration!"
    echo
    
    # Ask for NUC IP to apply configuration
    read -p "Enter the NUC's current IP address (press Enter to skip config application): " nuc_ip
    
    if [[ -n "$nuc_ip" ]]; then
        wait_for_nuc "$nuc_ip"
        apply_config_to_nuc "$nuc_ip" "$config_file"
        
        log_info "Configuration applied. The NUC will reboot and join the cluster."
        log_info "Monitor progress with: kubectl get nodes -w"
    else
        log_info "Skipping configuration application. Apply manually with:"
        echo "talosctl apply-config --insecure --nodes [NUC_IP] --file $config_file"
    fi
}

# Execute main function
main "$@"