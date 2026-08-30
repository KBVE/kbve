#!/usr/bin/env bash
# Delete old server version dirs under <PVC_ROOT>/<TARGET>, keeping:
#   - the newest KEEP versions (semver order)
#   - the target of the `latest` symlink
#   - any dir holding an NFS silly-rename (.nfs*), i.e. a file some process
#     still has open on the RWX Longhorn/NFS mount
#
# No version pinning, and deliberately no live-cluster read. The fleet
# launchers resolve the build themselves at container start —
#   find /server -maxdepth 1 -type d -name '[0-9]*' | sort -V | tail -1
# — so a restarting pod always re-resolves to the NEWEST version. No pod ever
# depends on an older dir, which is why "which version is still in use" needs
# no Agones labels, no ServiceAccount, and no apiserver access to answer.
#
# KEEP=2 is "the running version plus the new one". It is also how rollback
# works without a pin: delete the bad newest version and the launcher falls
# back to the previous one on the next pod start.
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:-}"
KEEP="${KEEP:-2}"

[ -n "${TARGET}" ] || { echo "::error::TARGET is required" >&2; exit 1; }

PVC_DIR="${PVC_ROOT}/${TARGET}"
[ -d "${PVC_DIR}" ] || { echo "Nothing to prune: ${PVC_DIR} does not exist"; exit 0; }
cd "${PVC_DIR}"

LATEST_TARGET=$(readlink latest 2>/dev/null || echo "")

# A running server holds its binaries open; deleting them on the NFS-backed RWX
# mount leaves .nfs* silly-renames behind. Their presence means someone still
# has a file open in that version dir. Courtesy only — a pod that restarts gets
# the newest build regardless — but there is no reason to churn a live mount.
is_in_use() {
    find "./$1" -name '.nfs*' -print -quit 2>/dev/null | grep -q .
}

echo "Pruning ${PVC_DIR}: keep newest ${KEEP}; latest -> '${LATEST_TARGET:-none}'"

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
    if [ "${DIR}" = "${LATEST_TARGET}" ]; then
        echo "  Skipping ${DIR} (latest symlink target)"
    elif is_in_use "${DIR}"; then
        echo "  Skipping ${DIR} (in use: NFS silly-rename present)"
    else
        echo "  Removing ${DIR}"
        rm -rf -- "./${DIR}"
    fi
done
