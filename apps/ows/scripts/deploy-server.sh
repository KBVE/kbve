#!/usr/bin/env bash
set -euo pipefail

# OWS Dedicated Server — Build & Deploy to PVC
# Usage: ./deploy-server.sh [version] [--skip-build] [--skip-deploy]
#
# Builds HubWorldMMO Linux dedicated server in Docker,
# then uploads to the ows-server-build PVC in arc-runners namespace.
#
# Requirements:
#   - Docker Desktop running
#   - kubectl configured with cluster access
#   - ghcr.io/epicgames/unreal-engine:dev-5.7.3 pulled locally

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CHUCK_DIR="${CHUCK_DIR:-$(cd "${REPO_ROOT}/../chuck" 2>/dev/null && pwd)}"
VERSION="${1:-dev-$(date +%Y%m%d-%H%M%S)}"
UE_IMAGE="${UE_IMAGE:-ghcr.io/epicgames/unreal-engine:dev-5.7.3}"
OUTPUT_DIR="/tmp/ows-server-output"
PVC_NAMESPACE="arc-runners"
PVC_POD="ows-server-sync"

SKIP_BUILD=false
SKIP_DEPLOY=false

for arg in "$@"; do
    case "$arg" in
        --skip-build)  SKIP_BUILD=true ;;
        --skip-deploy) SKIP_DEPLOY=true ;;
    esac
done

echo "=== OWS Dedicated Server Deploy ==="
echo "  Version:  ${VERSION}"
echo "  Chuck:    ${CHUCK_DIR}"
echo "  UE Image: ${UE_IMAGE}"
echo "  Output:   ${OUTPUT_DIR}"
echo ""

# ── Validate ──────────────────────────────────────────────
if [ ! -d "${CHUCK_DIR}/HubWorldMMO" ]; then
    echo "ERROR: HubWorldMMO not found at ${CHUCK_DIR}/HubWorldMMO"
    echo "Set CHUCK_DIR to the path of the chuck repo."
    exit 1
fi

# ── Build ─────────────────────────────────────────────────
if [ "${SKIP_BUILD}" = false ]; then
    echo ">>> Building Linux dedicated server in Docker..."
    mkdir -p "${OUTPUT_DIR}"
    rm -rf "${OUTPUT_DIR:?}"/*

    docker run --rm \
        -v "${CHUCK_DIR}:/tmp/chuck:ro" \
        -v "${OUTPUT_DIR}:/tmp/ows-server-output" \
        "${UE_IMAGE}" \
        /home/ue4/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
            -project=/tmp/chuck/HubWorldMMO/OWSHubWorldMMO.uproject \
            -targetplatform=Linux \
            -target=OWSHubWorldMMOServer \
            -server \
            -serverconfig=Development \
            -cook \
            -allmaps \
            -build \
            -stage \
            -pak \
            -archive \
            -archivedirectory=/tmp/ows-server-output \
            -unattended \
            -utf8output \
            -NoP4

    if [ ! -d "${OUTPUT_DIR}/LinuxServer" ]; then
        echo "ERROR: Build succeeded but LinuxServer output not found."
        find "${OUTPUT_DIR}" -maxdepth 2 -type d
        exit 1
    fi

    echo ">>> Build complete: $(du -sh "${OUTPUT_DIR}/LinuxServer" | cut -f1)"
else
    echo ">>> Skipping build (--skip-build)"
    if [ ! -d "${OUTPUT_DIR}/LinuxServer" ]; then
        echo "ERROR: No existing build at ${OUTPUT_DIR}/LinuxServer"
        exit 1
    fi
fi

# ── Deploy to PVC ─────────────────────────────────────────
if [ "${SKIP_DEPLOY}" = false ]; then
    echo ">>> Deploying to PVC (${PVC_NAMESPACE}/ows-server-build) as version ${VERSION}..."

    # Create temp pod
    kubectl apply -f - <<PODEOF
apiVersion: v1
kind: Pod
metadata:
  name: ${PVC_POD}
  namespace: ${PVC_NAMESPACE}
spec:
  containers:
    - name: sync
      image: busybox:1.37
      command: ["sleep", "600"]
      volumeMounts:
        - name: server-build
          mountPath: /mnt/ows-server
  volumes:
    - name: server-build
      persistentVolumeClaim:
        claimName: ows-server-build
  restartPolicy: Never
PODEOF

    kubectl wait --for=condition=Ready "pod/${PVC_POD}" -n "${PVC_NAMESPACE}" --timeout=120s

    # Create version directory and copy
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- mkdir -p "/mnt/ows-server/${VERSION}"

    echo ">>> Uploading server files (this may take a minute)..."
    cd "${OUTPUT_DIR}"
    tar cf - LinuxServer | kubectl exec -i "${PVC_POD}" -n "${PVC_NAMESPACE}" -- tar xf - -C "/mnt/ows-server/${VERSION}/"

    # Update latest symlink
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- \
        ln -sfn "/mnt/ows-server/${VERSION}" /mnt/ows-server/latest

    # Show result
    echo ""
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c \
        "echo '=== PVC Contents ===' && ls -la /mnt/ows-server/ && echo '' && du -sh /mnt/ows-server/${VERSION}/"

    # Cleanup temp pod
    kubectl delete pod "${PVC_POD}" -n "${PVC_NAMESPACE}" --grace-period=0

    echo ""
    echo ">>> Server v${VERSION} deployed. OWSInstanceLauncher will use /mnt/ows-server/latest/"
else
    echo ">>> Skipping deploy (--skip-deploy)"
fi

echo ""
echo "=== Done ==="
