#!/bin/bash

# Talos Cluster NUC Worker Verification Script
# This script verifies that Intel NUC worker nodes are properly joined to the Talos cluster
# Usage: ./verify-nuc-workers.sh [CONTROL_PLANE_WG_IP]

set -euo pipefail

# Configuration
CONTROL_PLANE_WG_IP="${1:-10.0.0.1}"
WG_NETWORK_BASE="${2:-10.0.0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Check dependencies
check_dependencies() {
    local deps=("kubectl" "talosctl" "wg")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Required dependency '$dep' is not installed"
            exit 1
        fi
    done
    
    log_info "All dependencies are available"
}

# Verify cluster connectivity
verify_cluster_connectivity() {
    log_info "Checking cluster connectivity..."
    
    if kubectl cluster-info &>/dev/null; then
        log_info "✓ kubectl can connect to cluster"
        kubectl cluster-info
    else
        log_error "✗ kubectl cannot connect to cluster"
        return 1
    fi
}

# List cluster nodes
list_cluster_nodes() {
    log_info "Listing cluster nodes..."
    
    echo
    log_debug "All cluster nodes:"
    kubectl get nodes -o wide
    
    echo
    log_debug "NUC worker nodes:"
    kubectl get nodes -l node.kbve.com/type=intel-nuc -o wide || log_warn "No NUC nodes found with label 'node.kbve.com/type=intel-nuc'"
}

# Check WireGuard connectivity
check_wireguard_status() {
    log_info "Checking WireGuard status..."
    
    if command -v wg &>/dev/null; then
        echo
        log_debug "WireGuard interface status:"
        sudo wg show || log_warn "WireGuard not configured on this machine"
    else
        log_warn "WireGuard tools not available on this machine"
    fi
}

# Verify node health
verify_node_health() {
    log_info "Checking node health..."
    
    echo
    log_debug "Node conditions:"
    kubectl get nodes -o custom-columns="NAME:.metadata.name,STATUS:.status.conditions[?(@.type=='Ready')].status,REASON:.status.conditions[?(@.type=='Ready')].reason"
    
    echo
    log_debug "Nodes not ready:"
    kubectl get nodes --field-selector=spec.unschedulable!=true -o custom-columns="NAME:.metadata.name,STATUS:.status.conditions[?(@.type=='Ready')].status" | grep -v True || log_info "All nodes are ready"
}

# Check system pods
check_system_pods() {
    log_info "Checking system pods distribution..."
    
    echo
    log_debug "Pods in kube-system namespace by node:"
    kubectl get pods -n kube-system -o wide | awk 'NR==1 {print} NR>1 {print | "sort -k7"}'
    
    echo
    log_debug "Pod status summary:"
    kubectl get pods -n kube-system --field-selector=status.phase!=Running,status.phase!=Succeeded | grep -v "No resources found" || log_info "All system pods are running"
}

# Test pod scheduling on NUC nodes
test_pod_scheduling() {
    log_info "Testing pod scheduling on NUC nodes..."
    
    # Create a test pod with node selector for NUC
    local test_pod_yaml=$(cat <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: nuc-test-pod
  namespace: default
spec:
  nodeSelector:
    node.kbve.com/type: intel-nuc
  containers:
  - name: test-container
    image: busybox:1.35
    command: ['sh', '-c', 'echo "Hello from NUC worker!" && sleep 30']
  restartPolicy: Never
EOF
)

    echo "$test_pod_yaml" | kubectl apply -f - 2>/dev/null || log_warn "Test pod already exists or failed to create"
    
    # Wait for pod to be scheduled
    log_info "Waiting for test pod to be scheduled..."
    
    local timeout=60
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        local status=$(kubectl get pod nuc-test-pod -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")
        
        if [[ "$status" == "Running" ]] || [[ "$status" == "Succeeded" ]]; then
            log_info "✓ Test pod scheduled successfully on NUC worker"
            kubectl get pod nuc-test-pod -o wide
            
            # Show logs
            echo
            log_debug "Test pod logs:"
            kubectl logs nuc-test-pod 2>/dev/null || log_warn "No logs available yet"
            
            # Clean up
            kubectl delete pod nuc-test-pod --grace-period=0 2>/dev/null || true
            return 0
        elif [[ "$status" == "Failed" ]]; then
            log_error "✗ Test pod failed to schedule"
            kubectl describe pod nuc-test-pod
            kubectl delete pod nuc-test-pod --grace-period=0 2>/dev/null || true
            return 1
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    log_error "✗ Test pod scheduling timed out"
    kubectl describe pod nuc-test-pod 2>/dev/null || true
    kubectl delete pod nuc-test-pod --grace-period=0 2>/dev/null || true
    return 1
}

# Check resource usage
check_resource_usage() {
    log_info "Checking cluster resource usage..."
    
    echo
    log_debug "Node resource usage:"
    kubectl top nodes 2>/dev/null || log_warn "Metrics server not available - cannot show resource usage"
    
    echo
    log_debug "CPU and Memory requests vs capacity:"
    kubectl describe nodes | grep -E "(Name:|  cpu|  memory)" | grep -A2 "Name:" || log_warn "Cannot retrieve node capacity information"
}

# Check Talos specific information
check_talos_info() {
    log_info "Checking Talos specific information..."
    
    # Try to get Talos version from control plane
    if talosctl version --nodes "$CONTROL_PLANE_WG_IP" &>/dev/null; then
        echo
        log_debug "Talos version information:"
        talosctl version --nodes "$CONTROL_PLANE_WG_IP"
    else
        log_warn "Cannot connect to Talos control plane at $CONTROL_PLANE_WG_IP"
    fi
    
    # Check for NUC worker nodes via Talos
    echo
    log_debug "Checking NUC worker nodes via Talos API..."
    for i in {10..15}; do
        local nuc_ip="$WG_NETWORK_BASE.$i"
        if talosctl --talosconfig=/dev/null time --nodes "$nuc_ip" &>/dev/null; then
            log_info "✓ NUC worker accessible at $nuc_ip"
            talosctl version --nodes "$nuc_ip" 2>/dev/null | head -3 || true
        fi
    done
}

# Network connectivity tests
test_network_connectivity() {
    log_info "Testing network connectivity..."
    
    echo
    log_debug "Testing connectivity to control plane:"
    if ping -c 3 "$CONTROL_PLANE_WG_IP" &>/dev/null; then
        log_info "✓ Control plane reachable at $CONTROL_PLANE_WG_IP"
    else
        log_error "✗ Control plane not reachable at $CONTROL_PLANE_WG_IP"
    fi
    
    echo
    log_debug "Testing service connectivity:"
    # Test kubernetes service
    local k8s_service_ip=$(kubectl get svc kubernetes -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "")
    if [[ -n "$k8s_service_ip" ]]; then
        if timeout 5 bash -c "</dev/tcp/$k8s_service_ip/443" &>/dev/null; then
            log_info "✓ Kubernetes API service reachable"
        else
            log_warn "✗ Kubernetes API service not reachable"
        fi
    fi
}

# Generate summary report
generate_summary() {
    echo
    echo "=================================="
    log_info "VERIFICATION SUMMARY"
    echo "=================================="
    
    local total_nodes=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    local ready_nodes=$(kubectl get nodes --no-headers --field-selector=spec.unschedulable!=true 2>/dev/null | grep " Ready " | wc -l)
    local nuc_nodes=$(kubectl get nodes -l node.kbve.com/type=intel-nuc --no-headers 2>/dev/null | wc -l)
    
    echo "Total Nodes: $total_nodes"
    echo "Ready Nodes: $ready_nodes"
    echo "NUC Workers: $nuc_nodes"
    echo "Control Plane WG IP: $CONTROL_PLANE_WG_IP"
    
    if [[ $ready_nodes -eq $total_nodes ]] && [[ $total_nodes -gt 0 ]]; then
        log_info "✓ Cluster is healthy"
    else
        log_warn "⚠ Some nodes may have issues"
    fi
    
    if [[ $nuc_nodes -gt 0 ]]; then
        log_info "✓ NUC worker nodes are present"
    else
        log_warn "⚠ No NUC worker nodes found"
    fi
}

# Main execution
main() {
    echo "=========================================="
    log_info "Talos Cluster NUC Worker Verification"
    echo "=========================================="
    echo "Control Plane WG IP: $CONTROL_PLANE_WG_IP"
    echo "WireGuard Network Base: $WG_NETWORK_BASE"
    echo
    
    check_dependencies
    
    echo
    verify_cluster_connectivity
    
    echo
    list_cluster_nodes
    
    echo
    verify_node_health
    
    echo
    check_system_pods
    
    echo
    check_wireguard_status
    
    echo
    test_pod_scheduling
    
    echo
    check_resource_usage
    
    echo
    check_talos_info
    
    echo
    test_network_connectivity
    
    generate_summary
}

# Execute main function
main "$@"