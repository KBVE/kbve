#!/usr/bin/env bash
# vm-rdp.sh — Enable/disable RDP access to KubeVirt VMs
# Creates a LoadBalancer Service + CiliumNetworkPolicy locked to your current IP.
#
# Usage:
#   ./scripts/vm-rdp.sh on [vm-name]    # Enable RDP (default: windows-builder)
#   ./scripts/vm-rdp.sh off [vm-name]   # Disable RDP
#   ./scripts/vm-rdp.sh status          # Show current state

set -euo pipefail

ACTION="${1:-status}"
VM_NAME="${2:-windows-builder}"
NAMESPACE="angelscript"
SVC_NAME="${VM_NAME}-rdp"
POLICY_NAME="${VM_NAME}-rdp-policy"

case "${ACTION}" in
    on)
        # Get current public IP
        MY_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org)
        if [ -z "${MY_IP}" ]; then
            echo "ERROR: Could not determine your public IP."
            exit 1
        fi
        echo "Your IP: ${MY_IP}"

        # Create LoadBalancer Service
        echo "Creating LoadBalancer Service ${SVC_NAME}..."
        kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
    name: ${SVC_NAME}
    namespace: ${NAMESPACE}
    labels:
        kubevirt.io/vm: ${VM_NAME}
        kbve.com/managed-by: vm-rdp-script
spec:
    externalTrafficPolicy: Local
    ports:
        - name: rdp
          port: 3389
          protocol: TCP
          targetPort: 3389
    selector:
        kubevirt.io/vm: ${VM_NAME}
    type: LoadBalancer
EOF

        # Create CiliumNetworkPolicy — allow only your IP
        echo "Creating CiliumNetworkPolicy ${POLICY_NAME} (allow ${MY_IP}/32 only)..."
        kubectl apply -f - <<EOF
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
    name: ${POLICY_NAME}
    namespace: ${NAMESPACE}
    labels:
        kbve.com/managed-by: vm-rdp-script
spec:
    endpointSelector:
        matchLabels:
            kubevirt.io/vm: ${VM_NAME}
    ingress:
        - fromCIDR:
              - ${MY_IP}/32
          toPorts:
              - ports:
                    - port: "3389"
                      protocol: TCP
EOF

        # Wait for external IP
        echo "Waiting for LoadBalancer IP..."
        for i in $(seq 1 30); do
            LB_IP=$(kubectl get svc "${SVC_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
            if [ -n "${LB_IP}" ]; then
                echo ""
                echo "=== RDP ENABLED ==="
                echo "  Host: ${LB_IP}"
                echo "  Port: 3389"
                echo "  Allowed IP: ${MY_IP}/32"
                echo ""
                echo "Connect: open rdp://${LB_IP}"
                echo "Disable: ./scripts/vm-rdp.sh off ${VM_NAME}"
                exit 0
            fi
            printf "."
            sleep 2
        done
        echo ""
        echo "WARNING: No external IP assigned yet. Check: kubectl get svc ${SVC_NAME} -n ${NAMESPACE}"
        ;;

    off)
        echo "Removing RDP access for ${VM_NAME}..."
        kubectl delete svc "${SVC_NAME}" -n "${NAMESPACE}" --ignore-not-found
        kubectl delete ciliumnetworkpolicy "${POLICY_NAME}" -n "${NAMESPACE}" --ignore-not-found
        echo "=== RDP DISABLED ==="
        ;;

    status)
        echo "=== RDP Status ==="
        SVC_EXISTS=$(kubectl get svc "${SVC_NAME}" -n "${NAMESPACE}" -o jsonpath='{.metadata.name}' 2>/dev/null || echo "")
        if [ -n "${SVC_EXISTS}" ]; then
            LB_IP=$(kubectl get svc "${SVC_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
            ALLOWED_IP=$(kubectl get ciliumnetworkpolicy "${POLICY_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.ingress[0].fromCIDR[0]}' 2>/dev/null || echo "none")
            echo "  VM: ${VM_NAME}"
            echo "  RDP: ENABLED"
            echo "  Host: ${LB_IP}"
            echo "  Allowed: ${ALLOWED_IP}"
        else
            echo "  VM: ${VM_NAME}"
            echo "  RDP: DISABLED"
        fi
        ;;

    *)
        echo "Usage: $0 {on|off|status} [vm-name]"
        exit 1
        ;;
esac
