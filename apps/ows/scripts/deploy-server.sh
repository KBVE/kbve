#!/usr/bin/env bash
set -euo pipefail

# OWS Dedicated Server — Build & Deploy to PVC
# Usage: ./deploy-server.sh [version] [--skip-build] [--skip-deploy] [--project chuck|hubworld] [--shipping]
#
# Builds a UE5 Linux dedicated server in Docker,
# then uploads to the ows-server-build PVC in arc-runners namespace.
#
# Projects:
#   chuck    — Chuck/Chuck.uproject with ChuckServer target (default)
#   hubworld — HubWorldMMO/OWSHubWorldMMO.uproject with OWSHubWorldMMOServer target
#
# Requirements:
#   - Docker Desktop running
#   - kubectl configured with cluster access
#   - UE_IMAGE pulled locally

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CHUCK_DIR="${CHUCK_DIR:-$(cd "${REPO_ROOT}/../chuck" 2>/dev/null && pwd)}"
VERSION="${1:-dev-$(date +%Y%m%d-%H%M%S)}"
UE_IMAGE="${UE_IMAGE:-ghcr.io/epicgames/unreal-engine:dev-5.7.4}"
OUTPUT_DIR="/tmp/ows-server-output"
PVC_NAMESPACE="arc-runners"
PVC_POD="ows-server-sync"

SKIP_BUILD=false
SKIP_DEPLOY=false
PROJECT="chuck"
SERVER_CONFIG="Development"

for arg in "$@"; do
    case "$arg" in
        --skip-build)  SKIP_BUILD=true ;;
        --skip-deploy) SKIP_DEPLOY=true ;;
        --shipping)    SERVER_CONFIG="Shipping" ;;
        --project=*)   PROJECT="${arg#--project=}" ;;
        chuck)         PROJECT="chuck" ;;
        hubworld)      PROJECT="hubworld" ;;
    esac
done

# Project configuration
case "$PROJECT" in
    chuck)
        UPROJECT_PATH="Chuck/Chuck.uproject"
        SERVER_TARGET="ChuckServer"
        SERVER_BIN_NAME="ChuckServer"
        ;;
    hubworld)
        UPROJECT_PATH="HubWorldMMO/OWSHubWorldMMO.uproject"
        SERVER_TARGET="OWSHubWorldMMOServer"
        SERVER_BIN_NAME="OWSHubWorldMMOServer"
        ;;
    ri)
        UPROJECT_PATH="RI/RI.uproject"
        SERVER_TARGET="RIServer"
        SERVER_BIN_NAME="RIServer"
        ;;
    *)
        echo "ERROR: Unknown project '${PROJECT}'. Use: chuck, hubworld, or ri"
        exit 1
        ;;
esac

echo "=== OWS Dedicated Server Deploy ==="
echo "  Project: ${PROJECT} (${SERVER_TARGET})"
echo "  Config:  ${SERVER_CONFIG}"
echo "  Version: ${VERSION}"
echo "  Chuck:   ${CHUCK_DIR}"
echo "  UE Image: ${UE_IMAGE}"
echo "  Output:  ${OUTPUT_DIR}"
echo ""

# ── Validate ──────────────────────────────────────────────
if [ ! -f "${CHUCK_DIR}/${UPROJECT_PATH}" ]; then
    echo "ERROR: Project not found at ${CHUCK_DIR}/${UPROJECT_PATH}"
    echo "Set CHUCK_DIR to the path of the chuck repo."
    exit 1
fi

# ── Build ─────────────────────────────────────────────────
if [ "${SKIP_BUILD}" = false ]; then
    echo ">>> Building ${PROJECT} Linux dedicated server in Docker..."
    mkdir -p "${OUTPUT_DIR}"
    rm -rf "${OUTPUT_DIR:?}"/*

    # Persistent cache for UE build artifacts (Intermediate, DerivedDataCache, Saved)
    UE_CACHE_DIR="${HOME}/.cache/kbve-ue-build/${PROJECT}"
    mkdir -p "${UE_CACHE_DIR}/Intermediate" "${UE_CACHE_DIR}/DerivedDataCache" "${UE_CACHE_DIR}/Saved"

    PROJECT_DIR="${UPROJECT_PATH%/*}"

    # Mount source as read-only, copy to writable location inside container.
    # UE5 BuildCookRun writes to the project's Intermediate/ directory.
    docker run --rm -t \
        --platform linux/amd64 \
        -v "${CHUCK_DIR}:/tmp/chuck-src:ro" \
        -v "${OUTPUT_DIR}:/tmp/ows-server-output" \
        -v "${UE_CACHE_DIR}/Intermediate:/tmp/ue-cache/Intermediate" \
        -v "${UE_CACHE_DIR}/DerivedDataCache:/tmp/ue-cache/DerivedDataCache" \
        -v "${UE_CACHE_DIR}/Saved:/tmp/ue-cache/Saved" \
        "${UE_IMAGE}" \
        bash -c "
            cp -r /tmp/chuck-src /tmp/chuck && \
            ln -sf /tmp/ue-cache/Intermediate /tmp/chuck/${PROJECT_DIR}/Intermediate && \
            ln -sf /tmp/ue-cache/DerivedDataCache /tmp/chuck/${PROJECT_DIR}/DerivedDataCache && \
            ln -sf /tmp/ue-cache/Saved /tmp/chuck/${PROJECT_DIR}/Saved && \
            /home/ue4/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
                -project=/tmp/chuck/${UPROJECT_PATH} \
                -targetplatform=Linux \
                -target=${SERVER_TARGET} \
                -server \
                -serverconfig=${SERVER_CONFIG} \
                -cook \
                -allmaps \
                -build \
                -stage \
                -pak \
                -archive \
                -archivedirectory=/tmp/ows-server-output \
                -unattended \
                -utf8output \
                -NoP4 || \
            (echo '=== COOK LOG ===' && cat /home/ue4/Library/Logs/Unreal\ Engine/LocalBuildLogs/Log.txt 2>/dev/null | tail -100 && exit 1)
        "

    if [ ! -d "${OUTPUT_DIR}/LinuxServer" ]; then
        echo "ERROR: Build succeeded but LinuxServer output not found."
        find "${OUTPUT_DIR}" -maxdepth 2 -type d
        exit 1
    fi

    # Ensure binary is executable
    find "${OUTPUT_DIR}/LinuxServer" -name "*.sh" -exec chmod 755 {} \;
    find "${OUTPUT_DIR}/LinuxServer" -name "${SERVER_BIN_NAME}" -exec chmod 755 {} \;

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
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
  containers:
    - name: sync
      image: busybox:1.37
      command: ["sleep", "600"]
      securityContext:
        allowPrivilegeEscalation: false
      resources:
        requests:
          memory: "512Mi"
        limits:
          memory: "2Gi"
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
    # Exclude macOS resource forks (._* files) that break server binary detection
    COPYFILE_DISABLE=1 tar cf - --exclude='._*' --exclude='.DS_Store' LinuxServer | kubectl exec -i "${PVC_POD}" -n "${PVC_NAMESPACE}" -- tar xf - -C "/mnt/ows-server/${VERSION}/"

    # Ensure permissions
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- chmod -R 755 "/mnt/ows-server/${VERSION}/"

    # Update latest symlink (use relative path so it works regardless of mount point)
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- \
        ln -sfn "${VERSION}" /mnt/ows-server/latest

    # Show result
    echo ""
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c \
        "echo '=== PVC Contents ===' && ls -la /mnt/ows-server/ && echo '' && du -sh /mnt/ows-server/${VERSION}/"

    # Cleanup temp pod
    kubectl delete pod "${PVC_POD}" -n "${PVC_NAMESPACE}" --grace-period=0

    echo ""
    echo ">>> Server v${VERSION} (${PROJECT}) deployed."
    echo ">>> Agones Fleet will use /server/${VERSION}/LinuxServer/${SERVER_BIN_NAME}.sh"
else
    echo ">>> Skipping deploy (--skip-deploy)"
fi

echo ""
echo "=== Done ==="
