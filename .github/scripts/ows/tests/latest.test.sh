#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

latest() { # pvc target version
    PVC_ROOT="$1" TARGET="$2" VERSION="$3" bash "${SCRIPTS}/latest.sh"
}

link_of() { readlink "$1/chuckServer/latest" 2>/dev/null || echo ""; }

t_creates_link_when_absent() {
    local pvc; pvc=$(mktemp -d); mkdir -p "${pvc}/chuckServer/1.0.0"
    latest "${pvc}" chuckServer 1.0.0 >/dev/null 2>&1
    assert_eq "1.0.0" "$(link_of "${pvc}")" "link created"
}

t_moves_forward() {
    local pvc; pvc=$(mktemp -d); mkdir -p "${pvc}/chuckServer/1.0.0" "${pvc}/chuckServer/1.0.1"
    ln -sfn 1.0.0 "${pvc}/chuckServer/latest"
    latest "${pvc}" chuckServer 1.0.1 >/dev/null 2>&1
    assert_eq "1.0.1" "$(link_of "${pvc}")" "moved forward"
}

t_refuses_to_move_backwards() {
    local pvc; pvc=$(mktemp -d); mkdir -p "${pvc}/chuckServer/1.0.0" "${pvc}/chuckServer/1.0.1"
    ln -sfn 1.0.1 "${pvc}/chuckServer/latest"
    latest "${pvc}" chuckServer 1.0.0 >/dev/null 2>&1
    assert_eq "1.0.1" "$(link_of "${pvc}")" "stayed on newer"
}

t_semver_order_not_lexical() {
    local pvc; pvc=$(mktemp -d); mkdir -p "${pvc}/chuckServer/0.3.9" "${pvc}/chuckServer/0.3.10"
    ln -sfn 0.3.9 "${pvc}/chuckServer/latest"
    latest "${pvc}" chuckServer 0.3.10 >/dev/null 2>&1
    assert_eq "0.3.10" "$(link_of "${pvc}")" "0.3.10 > 0.3.9"
}

t_same_version_is_idempotent() {
    local pvc; pvc=$(mktemp -d); mkdir -p "${pvc}/chuckServer/1.0.0"
    ln -sfn 1.0.0 "${pvc}/chuckServer/latest"
    latest "${pvc}" chuckServer 1.0.0 >/dev/null 2>&1
    assert_eq "1.0.0" "$(link_of "${pvc}")" "unchanged"
}

t_empty_args_fail() {
    local pvc rc=0; pvc=$(mktemp -d)
    PVC_ROOT="${pvc}" TARGET="" VERSION="1.0.0" bash "${SCRIPTS}/latest.sh" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "empty TARGET must exit 1"
    rc=0
    PVC_ROOT="${pvc}" TARGET="chuckServer" VERSION="" bash "${SCRIPTS}/latest.sh" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "empty VERSION must exit 1"
}

run_tests
