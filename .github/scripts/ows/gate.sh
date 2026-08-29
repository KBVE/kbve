#!/usr/bin/env bash
# Decide whether the server build for TARGET/VERSION must run.
# A version counts as deployed when its flat dir holds ${TARGET}.sh or any *Server.sh
# (PVC layout: <PVC_ROOT>/<TARGET>/<VERSION>/<target>.sh — no LinuxServer/ level).
# UBT names the launch script after -target (e.g. target chuckServerDev -> chuckServerDev.sh,
# which happens to also match *Server.sh, but a future target without that suffix would not —
# hence the explicit ${TARGET}.sh check alongside the *Server.sh glob).
# Prints exactly one line: should_build=true|false
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
VERSION="${VERSION:-}"
[ -n "${TARGET}" ]  || { echo "::error::TARGET is required" >&2; exit 1; }
[ -n "${VERSION}" ] || { echo "::error::VERSION is required" >&2; exit 1; }

DEST="${PVC_ROOT}/${TARGET}/${VERSION}"

if [ -d "${DEST}" ] && { [ -f "${DEST}/${TARGET}.sh" ] || find "${DEST}" -maxdepth 1 -name '*Server.sh' -type f -print -quit 2>/dev/null | grep -q .; }; then
    echo "::notice::v${VERSION} already deployed at ${DEST}. Skipping build." >&2
    echo "should_build=false"
else
    echo "::notice::v${VERSION} not deployed at ${DEST}. Will build." >&2
    echo "should_build=true"
fi
