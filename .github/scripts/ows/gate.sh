#!/usr/bin/env bash
# Decide whether the server build for TARGET/VERSION must run.
# A version counts as deployed when its flat dir holds the UBT launch script
# (PVC layout: <PVC_ROOT>/<TARGET>/<VERSION>/<target>.sh — no LinuxServer/ level).
# The predicate itself lives in lib.sh so deploy.sh cannot drift from it.
#
# FORCE_REPUBLISH=true forces a build even when the version is already deployed.
# Without this the escape hatch is unreachable: server_build is gated on
# should_build, so a republish request for a deployed version would skip the
# build, never reach deploy.sh (the only consumer of FORCE_REPUBLISH), and
# report green having done nothing.
#
# Prints exactly one line: should_build=true|false
set -euo pipefail

# shellcheck source=.github/scripts/ows/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
VERSION="${VERSION:-}"
FORCE_REPUBLISH="${FORCE_REPUBLISH:-false}"
[ -n "${TARGET}" ]  || { echo "::error::TARGET is required" >&2; exit 1; }
[ -n "${VERSION}" ] || { echo "::error::VERSION is required" >&2; exit 1; }

DEST="${PVC_ROOT}/${TARGET}/${VERSION}"

if ows_is_deployed "${DEST}" "${TARGET}"; then
    if [ "${FORCE_REPUBLISH}" = "true" ]; then
        echo "::warning::v${VERSION} already deployed at ${DEST}, but force_republish=true. Rebuilding and overwriting." >&2
        echo "should_build=true"
    else
        echo "::notice::v${VERSION} already deployed at ${DEST}. Skipping build." >&2
        echo "should_build=false"
    fi
else
    echo "::notice::v${VERSION} not deployed at ${DEST}. Will build." >&2
    echo "should_build=true"
fi
