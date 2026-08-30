#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mk_pvc() { # $1 = pvc root ; versions...
    local pvc="$1"; shift
    local v
    for v in "$@"; do mkdir -p "${pvc}/chuckServer/${v}"; touch "${pvc}/chuckServer/${v}/chuckServer.sh"; done
}

prune() { # pvc [keep]
    PVC_ROOT="$1" TARGET=chuckServer KEEP="${2:-2}" bash "${SCRIPTS}/prune.sh"
}

t_keeps_running_plus_new() {
    # KEEP=2 is "the version pods are on, plus the one just published".
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.50 0.3.51 0.3.52 0.3.53
    ln -sfn 0.3.53 "${pvc}/chuckServer/latest"
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/0.3.53" "newest kept"
    assert_exists "${pvc}/chuckServer/0.3.52" "one back kept"
    assert_missing "${pvc}/chuckServer/0.3.51" "older removed"
    assert_missing "${pvc}/chuckServer/0.3.50" "older removed"
}

t_semver_order_not_lexical() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.9 0.3.10 0.3.11 0.3.12
    prune "${pvc}"
    assert_missing "${pvc}/chuckServer/0.3.9" "0.3.9 is oldest"
    assert_exists "${pvc}/chuckServer/0.3.12" "0.3.12 newest"
    assert_exists "${pvc}/chuckServer/0.3.11" "one back kept"
}

t_latest_target_survives() {
    # Rollback without a pin is "delete the bad newest and let the launcher fall
    # back", which can leave latest pointing below the KEEP window.
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4 0.3.5
    ln -sfn 0.3.1 "${pvc}/chuckServer/latest"
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/0.3.1" "latest target kept"
    assert_missing "${pvc}/chuckServer/0.3.2" "unprotected old removed"
}

t_nfs_silly_rename_dir_kept() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    touch "${pvc}/chuckServer/0.3.1/.nfs0000000012345678"
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/0.3.1" "in-use dir kept"
    assert_missing "${pvc}/chuckServer/0.3.2" "unprotected old removed"
}

t_non_version_dirs_ignored() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    mkdir -p "${pvc}/chuckServer/scratch"
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/scratch" "non-version dir untouched"
}

t_nothing_to_prune() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/0.3.1" "kept"
    assert_exists "${pvc}/chuckServer/0.3.2" "kept"
}

t_sweeps_stale_stage_and_old_dirs() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2
    mkdir -p "${pvc}/chuckServer/.stage-0.3.3.123" "${pvc}/chuckServer/.old-0.3.1.456"
    touch -d '3 days ago' "${pvc}/chuckServer/.stage-0.3.3.123" "${pvc}/chuckServer/.old-0.3.1.456"
    prune "${pvc}"
    assert_missing "${pvc}/chuckServer/.stage-0.3.3.123" "stale stage dir swept"
    assert_missing "${pvc}/chuckServer/.old-0.3.1.456" "stale old dir swept"
}

t_does_not_sweep_fresh_stage_dir() {
    # A publish may be running right now; its staging dir must survive.
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2
    mkdir -p "${pvc}/chuckServer/.stage-0.3.3.123"
    prune "${pvc}"
    assert_exists "${pvc}/chuckServer/.stage-0.3.3.123" "fresh stage dir kept"
}

t_missing_target_is_noop() {
    local pvc; pvc=$(mktemp -d)
    prune "${pvc}"
}

run_tests
