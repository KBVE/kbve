#!/usr/bin/env bash
# Delete old server version dirs under <PVC_ROOT>/<TARGET>, keeping:
#   - the newest KEEP versions (semver order; KEEP=1 = the just-published one)
#   - the target of the `latest` symlink
#   - every version listed in PROTECTED_FILE (git pins + live cluster labels)
#   - any dir holding an NFS silly-rename (.nfs*), i.e. a file some process
#     still has open on the RWX Longhorn/NFS mount
# PROTECTED_FILE must exist (may be empty). Never runs without it.
#
# Retention policy: one running version + the new one. KEEP=1 covers the new
# version; PROTECTED_FILE covers whatever is still running. When the fleets
# finish rolling onto the new version the old one stops appearing in the live
# label set, and the next prune deletes it.
#
# That policy only works if PROTECTED_FILE can actually see what is running.
# With an aggressive KEEP and an empty protected set, prune would delete the
# version the fleets are serving from. See the KEEP_FLOOR guard below.
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
KEEP="${KEEP:-1}"
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

# An empty protected set means no Fleet or GameServer carries
# ows.kbve.com/server-version and no fleet.yaml carries an OWS_SERVER_VERSION
# pin — i.e. we have NO evidence of which version is live. `latest` does not
# count: it is where new pods go, not where running ones are. At KEEP >= 3 the
# newest-N window is a wide enough accident to be tolerable; at KEEP=1 it is
# not, and pruning would delete the version the fleets are serving.
KEEP_FLOOR="${KEEP_FLOOR:-3}"
if [ "${#PROTECTED[@]}" -eq 0 ] || [ -z "${PROTECTED[0]:-}" ]; then
    if [ "${KEEP}" -lt "${KEEP_FLOOR}" ]; then
        echo "::error::protected set is empty (no OWS_SERVER_VERSION pins, no ows.kbve.com/server-version labels) and KEEP=${KEEP} < ${KEEP_FLOOR}. Cannot tell which version is live; refusing to prune version dirs. Land the pin/label PR, or raise KEEP."
        SWEEP_ONLY=true
    fi
fi
SWEEP_ONLY="${SWEEP_ONLY:-false}"

# Sweep deploy leftovers: .stage-* from a hard-killed runner (the EXIT trap
# never fired) and .old-* the atomic swap could not unlink because a pod still
# held files open. Both are invisible to the gate, the launchers and the
# version glob below, so nothing but disk depends on them. Age-bounded so a
# publish running right now is never touched.
find . -mindepth 1 -maxdepth 1 -type d \( -name '.stage-*' -o -name '.old-*' \) -mtime +1 \
    -print -exec rm -rf {} + 2>/dev/null || true

if [ "${SWEEP_ONLY}" = "true" ]; then
    echo "  Swept staging leftovers only; no version dirs considered."
    exit 0
fi

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
