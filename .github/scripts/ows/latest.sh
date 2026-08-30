#!/usr/bin/env bash
# Point <PVC_ROOT>/<TARGET>/latest at VERSION, forward-only.
#
# Forward-only: a force_republish (or a re-dispatch) of an older version must
# not silently roll back the tenants whose launcher reads /server/latest
# (chuckrpg-dev, chuckrpg-prod).
#
# Called from deploy.sh after a successful publish, and from the gate job when
# the build was skipped because the version is already on the PVC. Without the
# second caller, a dispatch of an already-deployed version reports green while
# `latest` stays on whatever it pointed at — a silent no-op that the old
# always-rebuilding gate used to mask.
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
VERSION="${VERSION:-}"
[ -n "${TARGET}" ]  || { echo "::error::TARGET is required" >&2; exit 1; }
[ -n "${VERSION}" ] || { echo "::error::VERSION is required" >&2; exit 1; }

LINK="${PVC_ROOT}/${TARGET}/latest"
CURRENT=$(readlink "${LINK}" 2>/dev/null || echo "")

if [ -z "${CURRENT}" ] || [ "${CURRENT}" = "${VERSION}" ] \
    || [ "$(printf '%s\n%s\n' "${CURRENT}" "${VERSION}" | sort -V | tail -1)" = "${VERSION}" ]; then
    # `ln -sfn` unlinks then re-creates: a pod resolving /server/latest in that
    # window sees nothing. Create-then-rename is atomic.
    ln -sfn "${VERSION}" "${LINK}.tmp.$$"
    mv -T "${LINK}.tmp.$$" "${LINK}"
    echo "::notice::${TARGET} latest -> ${VERSION}"
else
    echo "::warning::latest stays at ${CURRENT} (newer than ${VERSION}); not moving it backwards"
fi
