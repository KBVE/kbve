#!/usr/bin/env bash
# Delete old server version dirs under <PVC_ROOT>/<TARGET>, keeping:
#   - the newest KEEP versions (semver order)
#   - the target of the `latest` symlink
#   - every version listed in PROTECTED_FILE (git pins + live cluster labels)
# PROTECTED_FILE must exist (may be empty). Never runs without it.
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

echo "Pruning ${PVC_DIR}: keep newest ${KEEP}; latest -> '${LATEST_TARGET:-none}'; protected: ${PROTECTED[*]:-none}"

mapfile -t CANDIDATES < <(find . -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' -printf '%f\n' | sort -V -r | tail -n +$((KEEP + 1)))

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    echo "  Nothing to prune."
    exit 0
fi

for DIR in "${CANDIDATES[@]}"; do
    if is_protected "${DIR}"; then
        echo "  Skipping ${DIR} (protected)"
    else
        echo "  Removing ${DIR}"
        rm -rf -- "./${DIR}"
    fi
done
