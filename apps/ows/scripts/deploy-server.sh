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

    # Delete stale sync pod from previous run (Completed pods can't restart)
    kubectl delete pod "${PVC_POD}" -n "${PVC_NAMESPACE}" --ignore-not-found --grace-period=0 2>/dev/null
    sleep 2

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
          memory: "128Mi"
        limits:
          memory: "512Mi"
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

    # Clean destination and create fresh directory
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- rm -rf "/mnt/ows-server/${VERSION}"
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- mkdir -p "/mnt/ows-server/${VERSION}"

    echo ">>> Uploading server files..."
    cd "${OUTPUT_DIR}"

    # Strip macOS resource forks before upload
    find LinuxServer -name '._*' -delete 2>/dev/null || true
    find LinuxServer -name '.DS_Store' -delete 2>/dev/null || true

    TOTAL_SIZE=$(du -sh LinuxServer | cut -f1)
    # macOS uses -k (1024-byte blocks), multiply to get bytes
    TOTAL_BYTES=$(du -sk LinuxServer | awk '{print $1 * 1024}')
    TOTAL_FILES=$(find LinuxServer -type f | wc -l | tr -d ' ')
    echo "    Size: ${TOTAL_SIZE}, Files: ${TOTAL_FILES}"
    # Compress locally first — 920MB binary compresses to ~300MB, 3x faster transfer
    echo "    Compressing..."
    COMPRESS_START=$(date +%s)
    COPYFILE_DISABLE=1 tar czf /tmp/ows-server-upload.tar.gz -C "${OUTPUT_DIR}" LinuxServer
    COMPRESSED_SIZE=$(du -sh /tmp/ows-server-upload.tar.gz | cut -f1)
    COMPRESS_DURATION=$(( $(date +%s) - COMPRESS_START ))
    echo "    Compressed: ${TOTAL_SIZE} → ${COMPRESSED_SIZE} in ${COMPRESS_DURATION}s"

    echo "    Uploading..."
    UPLOAD_START=$(date +%s)

    # Stream compressed tar through kubectl exec — busybox decompresses to disk
    # Memory usage is minimal (streaming, not buffering)
    kubectl exec -i "${PVC_POD}" -n "${PVC_NAMESPACE}" -- \
        tar xzf - -C "/mnt/ows-server/${VERSION}/" < /tmp/ows-server-upload.tar.gz &
    CP_PID=$!

    # Poll PVC every 5s for progress
    while kill -0 "${CP_PID}" 2>/dev/null; do
        REMOTE_BYTES=$(kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c \
            "du -sb /mnt/ows-server/${VERSION}/LinuxServer 2>/dev/null | cut -f1" 2>/dev/null || echo "0")
        REMOTE_BYTES="${REMOTE_BYTES:-0}"
        if [ "${TOTAL_BYTES}" -gt 0 ] 2>/dev/null; then
            PCT=$((REMOTE_BYTES * 100 / TOTAL_BYTES))
            [ "${PCT}" -gt 100 ] && PCT=100
            REMOTE_MB=$((REMOTE_BYTES / 1048576))
            TOTAL_MB=$((TOTAL_BYTES / 1048576))
            ELAPSED=$(( $(date +%s) - UPLOAD_START ))
            printf "\r    Progress: %dMB / %dMB (%d%%) — %ds elapsed" "${REMOTE_MB}" "${TOTAL_MB}" "${PCT}" "${ELAPSED}"
        fi
        sleep 5
    done

    # Wait and capture exit code
    wait "${CP_PID}"
    CP_EXIT=$?

    UPLOAD_END=$(date +%s)
    UPLOAD_DURATION=$((UPLOAD_END - UPLOAD_START))
    rm -f /tmp/ows-server-upload.tar.gz
    echo ""

    if [ "${CP_EXIT}" -ne 0 ]; then
        echo "    ERROR: upload failed (exit ${CP_EXIT})"
        exit 1
    fi

    echo "    Upload complete: ${COMPRESSED_SIZE} transferred in ${UPLOAD_DURATION}s"

    # Verify upload landed
    REMOTE_FILES=$(kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c "find /mnt/ows-server/${VERSION}/LinuxServer -type f 2>/dev/null | wc -l" | tr -d ' ')
    if [ "${REMOTE_FILES}" -eq "${TOTAL_FILES}" ]; then
        echo "    Verified: ${REMOTE_FILES}/${TOTAL_FILES} files on PVC"
    else
        echo "    WARNING: Expected ${TOTAL_FILES} files, found ${REMOTE_FILES} on PVC"
    fi

    # Ensure permissions
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- chmod -R 755 "/mnt/ows-server/${VERSION}/"

    # Update latest symlink (use relative path so it works regardless of mount point)
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- \
        ln -sfn "${VERSION}" /mnt/ows-server/latest

    # Prune old versions (keep latest 3, skip busy ones)
    echo ">>> Pruning old versions (keeping latest 3)..."
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c '
        cd /mnt/ows-server
        KEEP=3
        DIRS=$(ls -dt [0-9]* 2>/dev/null | tail -n +$((KEEP+1)))
        if [ -n "$DIRS" ]; then
            for DIR in $DIRS; do
                # Check for NFS lock files (active game server mounts)
                if find "$DIR" -name ".nfs*" -print -quit 2>/dev/null | grep -q .; then
                    echo "  Skipping $DIR (in use by running server)"
                else
                    echo "  Removing $DIR"
                    rm -rf "$DIR"
                fi
            done
        else
            echo "  Nothing to prune."
        fi
    '

    # Show result
    echo ""
    kubectl exec "${PVC_POD}" -n "${PVC_NAMESPACE}" -- sh -c \
        "echo '=== PVC Contents ===' && ls -la /mnt/ows-server/ && echo '' && du -sh /mnt/ows-server/${VERSION}/ && echo '' && df -h /mnt/ows-server/"

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
