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
        # the line after "name: OWS_SERVER_VERSION" is "value: 'x.y.z'"
        awk '/name: OWS_SERVER_VERSION/{getline; if (match($0, /value:[[:space:]]*['"'"'"]?([0-9][^'"'"'" ]*)/, m)) print m[1]}' "${f}"
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
    curl -sS --fail --max-time 15 --cacert "${SA_DIR}/ca.crt" \
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

{ git_pins; printf '%s\n' "${live_out}"; } | { grep -v '^$' || true; } | sort -u -V
