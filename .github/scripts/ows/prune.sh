#!/usr/bin/env bash
# Delete old server version dirs under <PVC_ROOT>/<TARGET>, keeping:
#   - the newest KEEP versions (semver order)
#   - the target of the `latest` symlink
#   - every version listed in PROTECTED_FILE (git pins + live cluster labels)
#   - any dir holding an NFS silly-rename (.nfs*), i.e. a file some process
#     still has open on the RWX Longhorn/NFS mount
# PROTECTED_FILE must exist (may be empty). Never runs without it.
#
# The .nfs* check is a weak, last-resort guard, kept because the label-based
# protection above is inert until every Fleet/GameServer carries
# ows.kbve.com/server-version. Do not over-trust it: silly-renames only appear
# AFTER an unlink races a file some process holds open, so a running-but-
# untouched version dir carries no marker and this check will not save it on
# the first pass — it only stops the second pass from finishing the job. Real
# protection is the label set; land the pin PR.
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
KEEP="${KEEP:-3}"
PROTECTED_FILE="${PROTECTED_FILE:-}"

[ -n "${TARGET}" ]         || { echo "::error::TARGET is required" >&2; exit 1; }
[ -n "${PROTECTED_FILE}" ] || { echo "::error::PROTECTED_FILE is required" >&2; exit 1; }

if [ ! -f "${PROTECTED_FILE}" ]; then
    echo "::error::PROTECTED_FILE not found: ${PROTECTED_FILE} — refusing to prune"
    exit 1
fi

PVC_DIR="${PVC_ROOT}/${TARGET}"
[ -d "${PVC_DIR}" ] || { echo "Nothing to prune: ${PVC_DIR} does not exist"; exit 0; }
cd "${PVC_DIR}"

LATEST_TARGET=$(readlink latest 2>/dev/null || echo "")
mapfile -t PROTECTED < <(grep -v '^$' "${PROTECTED_FILE}" || true)

is_protected() {
    local v="$1" p
    [ "${v}" = "${LATEST_TARGET}" ] && return 0
    for p in "${PROTECTED[@]:-}"; do [ "${v}" = "${p}" ] && return 0; done
    return 1
}

# A running server holds its binaries open; deleting them on the NFS-backed RWX
# mount leaves .nfs* silly-renames behind. Their presence means someone still
# has a file open in that version dir.
is_in_use() {
    find "./$1" -name '.nfs*' -print -quit 2>/dev/null | grep -q .
}

echo "Pruning ${PVC_DIR}: keep newest ${KEEP}; latest -> '${LATEST_TARGET:-none}'; protected: ${PROTECTED[*]:-none}"

# Sweep deploy leftovers: .stage-* from a hard-killed runner (the EXIT trap
# never fired) and .old-* the atomic swap could not unlink because a pod still
# held files open. Both are invisible to the gate, the launchers and the
# version glob below, so nothing but disk depends on them. Age-bounded so a
# publish running right now is never touched.
find . -mindepth 1 -maxdepth 1 -type d \( -name '.stage-*' -o -name '.old-*' \) -mtime +1 \
    -print -exec rm -rf {} + 2>/dev/null || true

mapfile -t CANDIDATES < <(find . -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' -printf '%f\n' | sort -V -r | tail -n +$((KEEP + 1)))

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    echo "  Nothing to prune."
    exit 0
fi

for DIR in "${CANDIDATES[@]}"; do
    if is_protected "${DIR}"; then
        echo "  Skipping ${DIR} (protected)"
    elif is_in_use "${DIR}"; then
        echo "  Skipping ${DIR} (in use: NFS silly-rename present)"
    else
        echo "  Removing ${DIR}"
        rm -rf -- "./${DIR}"
    fi
done
