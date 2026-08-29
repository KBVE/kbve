#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
FX="${SCRIPTS}/tests/fixtures"

mk_repo() { # $1 = repo root; copies the pinned fleet fixture into the expected path
    mkdir -p "$1/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests"
    cp "${FX}/fleet-pinned.yaml" "$1/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml"
}

protected() { # repo fleets_json gs_json
    REPO_ROOT="$1" FLEETS_JSON_FILE="$2" GAMESERVERS_JSON_FILE="$3" bash "${SCRIPTS}/protected-versions.sh"
}

t_union_of_git_pin_fleet_label_and_live_gs() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local out; out=$(protected "${repo}" "${FX}/fleets.json" "${FX}/gameservers.json")
    # git pin 0.3.51; fleet label 0.3.52; Allocated GS 0.3.49; Ready GS 0.3.52; Shutdown GS 0.3.40 excluded
    assert_eq $'0.3.49\n0.3.51\n0.3.52' "${out}" "union"
}

t_no_pins_no_labels_is_empty_and_ok() {
    local repo; repo=$(mktemp -d)
    mkdir -p "${repo}/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests"
    printf 'apiVersion: agones.dev/v1\nkind: Fleet\n' > "${repo}/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml"
    local empty; empty=$(mktemp); echo '{"items":[]}' > "${empty}"
    local out rc=0
    out=$(protected "${repo}" "${empty}" "${empty}") || rc=$?
    assert_eq "0" "${rc}" "exit ok"
    assert_eq "" "${out}" "empty"
}

t_missing_live_file_is_read_failure() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local rc=0
    protected "${repo}" "/nonexistent.json" "${FX}/gameservers.json" >/dev/null 2>&1 || rc=$?
    assert_eq "2" "${rc}" "live read failure exit 2"
}

t_malformed_live_json_is_read_failure() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local bad; bad=$(mktemp); echo 'not json' > "${bad}"
    local rc=0
    protected "${repo}" "${bad}" "${FX}/gameservers.json" >/dev/null 2>&1 || rc=$?
    assert_eq "2" "${rc}" "malformed json exit 2"
}

t_git_pins_from_all_tenants() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    mkdir -p "${repo}/apps/kube/agones/rows-tenants/chuckrpg-dev/manifests"
    sed 's/0.3.51/0.3.20/g' "${FX}/fleet-pinned.yaml" > "${repo}/apps/kube/agones/rows-tenants/chuckrpg-dev/manifests/fleet.yaml"
    local empty; empty=$(mktemp); echo '{"items":[]}' > "${empty}"
    assert_eq $'0.3.20\n0.3.51' "$(protected "${repo}" "${empty}" "${empty}")" "both tenants"
}

run_tests
