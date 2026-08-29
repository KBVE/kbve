#!/usr/bin/env bash
# Publish a built UE LinuxServer dir to the shared PVC as an immutable, flat version dir.
#   <PVC_ROOT>/<TARGET>/<VERSION>/chuckServer.sh   (contents of SERVER_DIR; no LinuxServer/ level)
#   <PVC_ROOT>/<TARGET>/latest -> <VERSION>
# Refuses to overwrite a version dir that is already non-empty, unless FORCE_REPUBLISH=true.
# Target-agnostic on purpose: the launch script name follows the UBT -target (e.g.
# chuckServerDev.sh), so matching on a "*Server.sh" name would miss some targets and
# risk cp -r'ing over a version directory a live pod is executing from.
# Exit codes: 1 bad input, 3 refused (already deployed).
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
VERSION="${VERSION:-}"
SERVER_DIR="${SERVER_DIR:-}"
FORCE_REPUBLISH="${FORCE_REPUBLISH:-false}"

[ -n "${TARGET}" ]     || { echo "::error::TARGET is required" >&2; exit 1; }
[ -n "${VERSION}" ]    || { echo "::error::VERSION is required" >&2; exit 1; }
[ -n "${SERVER_DIR}" ] || { echo "::error::SERVER_DIR is required" >&2; exit 1; }

if [ ! -d "${SERVER_DIR}" ]; then
    echo "::error::SERVER_DIR does not exist: ${SERVER_DIR}" >&2
    exit 1
fi

DEST="${PVC_ROOT}/${TARGET}/${VERSION}"

if [ -d "${DEST}" ] && [ -n "$(find "${DEST}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    if [ "${FORCE_REPUBLISH}" = "true" ]; then
        echo "::warning::FORCE_REPUBLISH=true — replacing already-deployed ${TARGET} v${VERSION} at ${DEST}. A pod may be running from it."
        rm -rf "${DEST}"
    else
        echo "::error::${TARGET} v${VERSION} already has a non-empty version dir at ${DEST}. Versions are immutable: bump the version, or re-run with force_republish=true." >&2
        exit 3
    fi
fi

mkdir -p "${DEST}"
cp -r "${SERVER_DIR}/." "${DEST}/"
chmod -R 755 "${DEST}"

ln -sfn "${VERSION}" "${PVC_ROOT}/${TARGET}/latest"

echo "::notice::${TARGET} v${VERSION} deployed to ${DEST} ($(du -sh "${DEST}" | cut -f1))"
ls -la "${DEST}/" | head -10
[ -f "${DEST}/BUILD_INFO" ] && cat "${DEST}/BUILD_INFO" || true
