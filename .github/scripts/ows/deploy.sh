#!/usr/bin/env bash
# Publish a built UE LinuxServer dir to the shared PVC as an immutable, flat version dir.
#   <PVC_ROOT>/<TARGET>/<VERSION>/chuckServer.sh   (contents of SERVER_DIR; no LinuxServer/ level)
#   <PVC_ROOT>/<TARGET>/latest -> <VERSION>
# Refuses to overwrite a version dir that is already a complete deploy, unless
# FORCE_REPUBLISH=true. A non-empty dir with no launch script is junk from the
# old non-atomic publish path — no fleet launcher can be executing it — so it is
# replaced rather than refused (gate.sh sends us here for exactly that case).
# Exit codes: 1 bad input, 3 refused (already deployed).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/ows/lib.sh
source "${HERE}/lib.sh"

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

if ows_is_deployed "${DEST}" "${TARGET}"; then
    if [ "${FORCE_REPUBLISH}" = "true" ]; then
        echo "::warning::FORCE_REPUBLISH=true — replacing already-deployed ${TARGET} v${VERSION} at ${DEST}. A pod may be running from it."
    else
        echo "::error::${TARGET} v${VERSION} already has a complete deploy at ${DEST}. Versions are immutable: bump the version, or re-run with force_republish=true." >&2
        exit 3
    fi
elif ows_is_nonempty "${DEST}"; then
    # Same predicate as the gate, so this is reachable only when the gate said
    # "build": a partial dir with no launch script. Nothing can boot from it.
    echo "::warning::${DEST} is non-empty but holds no launch script (partial publish from a killed runner). Replacing it."
fi

# Stage into a dot-prefixed sibling, then rename: `mv -T` is atomic within the
# filesystem, so a killed runner can never leave a partial dir that the gate
# treats as deployed or a GameServer boots. The dot prefix keeps the staging
# dir out of every `[0-9]*` glob (gate, prune, fleet launchers).
STAGE="${PVC_ROOT}/${TARGET}/.stage-${VERSION}.$$"
rm -rf "${STAGE}"
trap 'rm -rf "${STAGE}"' EXIT
mkdir -p "${STAGE}"
cp -r "${SERVER_DIR}/." "${STAGE}/"
chmod -R 755 "${STAGE}"
rm -rf "${DEST}"
mv -T "${STAGE}" "${DEST}"
trap - EXIT

PVC_ROOT="${PVC_ROOT}" TARGET="${TARGET}" VERSION="${VERSION}" bash "${HERE}/latest.sh"

echo "::notice::${TARGET} v${VERSION} deployed to ${DEST} ($(du -sh "${DEST}" | cut -f1))"
ls -la "${DEST}/" | head -10 || true
[ -f "${DEST}/BUILD_INFO" ] && cat "${DEST}/BUILD_INFO" || true
