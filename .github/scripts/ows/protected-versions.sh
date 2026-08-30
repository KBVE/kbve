#!/usr/bin/env bash
# Print the set of server versions that prune must never delete, one per line, sorted+unique:
#   - every OWS_SERVER_VERSION value in apps/kube/agones/rows-tenants/*/manifests/fleet.yaml under REPO_ROOT
#   - every ows.kbve.com/server-version label on Fleets in KUBE_NS
#   - every ows.kbve.com/server-version label on GameServers in state Ready|Allocated|Reserved in KUBE_NS
# Exit 2 if the live cluster read fails — the caller must then skip pruning (fail closed).
# Test injection: FLEETS_JSON_FILE / GAMESERVERS_JSON_FILE replace the API calls.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-}"
[ -n "${REPO_ROOT}" ] || { echo "::error::REPO_ROOT is required" >&2; exit 1; }
KUBE_API="${KUBE_API:-https://kubernetes.default.svc}"
KUBE_NS="${KUBE_NS:-arc-runners}"
SA_DIR="${SA_DIR:-/var/run/secrets/kubernetes.io/serviceaccount}"
LABEL='ows.kbve.com/server-version'

git_pins() {
    local f
    for f in "${REPO_ROOT}"/apps/kube/agones/rows-tenants/*/manifests/fleet.yaml; do
        [ -f "${f}" ] || continue
        # the line after "name: OWS_SERVER_VERSION" is "value: 'x.y.z'" (single-quoted,
        # double-quoted, or bare). Portable: no gawk-only 3-arg match(). grep exits 1 on
        # no match, which is legitimate (a fleet.yaml with no pin) — guard it so
        # `set -e` doesn't trip the pipeline.
        grep -A1 'name: OWS_SERVER_VERSION' "${f}" \
            | sed -n "s/.*value:[[:space:]]*['\"]\{0,1\}\([0-9][0-9A-Za-z.+-]*\).*/\1/p" \
            || true
    done
}

fetch() { # $1 = api path ; $2 = injected file var
    local injected="${!2:-}"
    if [ -n "${injected}" ]; then
        cat "${injected}" 2>/dev/null || return 1
        return 0
    fi
    local token
    token=$(cat "${SA_DIR}/token") || return 1
    # Retry: a single blip would otherwise fail closed and silently skip prune.
    curl -sS --fail --max-time 15 --retry 2 --retry-connrefused --cacert "${SA_DIR}/ca.crt" \
        -H "Authorization: Bearer ${token}" "${KUBE_API}$1" || return 1
}

live_versions() {
    local fleets gs
    fleets=$(fetch "/apis/agones.dev/v1/namespaces/${KUBE_NS}/fleets" FLEETS_JSON_FILE) \
        || { echo "__FETCH_FAILED__"; return 1; }
    gs=$(fetch "/apis/agones.dev/v1/namespaces/${KUBE_NS}/gameservers" GAMESERVERS_JSON_FILE) \
        || { echo "__FETCH_FAILED__"; return 1; }
    # jq exit 2+ = parse error. `// empty` keeps missing labels from printing null.
    printf '%s' "${fleets}" | jq -r --arg l "${LABEL}" \
        '.items[] | .spec.template.metadata.labels[$l] // empty' \
        || { echo "__PARSE_FAILED__"; return 1; }
    printf '%s' "${gs}" | jq -r --arg l "${LABEL}" \
        '.items[] | select(.status.state as $s | ["Ready","Allocated","Reserved"] | index($s)) | .metadata.labels[$l] // empty' \
        || { echo "__PARSE_FAILED__"; return 1; }
}

set +e
live_out=$(live_versions)
rc=$?
set -e
if [ "${rc}" -ne 0 ] || [[ "${live_out}" == *__FETCH_FAILED__* ]] || [[ "${live_out}" == *__PARSE_FAILED__* ]]; then
    echo "::error::live Agones read failed (rc=${rc}); prune must skip" >&2
    exit 2
fi

pins=$(git_pins | { grep -v '^$' || true; })
if [ -z "${pins}" ]; then
    # Not fatal: the pin PR has not landed yet, and a tenant may legitimately
    # track `latest`. Loud, because a silent empty set here is indistinguishable
    # from a glob/parse miss and downgrades prune to "newest KEEP + latest".
    echo "::warning::no OWS_SERVER_VERSION pins found under ${REPO_ROOT}/apps/kube/agones/rows-tenants/*/manifests/fleet.yaml — prune falls back to live labels only" >&2
fi

{ printf '%s\n' "${pins}"; printf '%s\n' "${live_out}"; } | { grep -v '^$' || true; } | sort -u -V
