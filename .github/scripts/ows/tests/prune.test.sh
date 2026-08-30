#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mk_pvc() { # $1 = pvc root ; versions...
    local pvc="$1"; shift
    local v
    for v in "$@"; do mkdir -p "${pvc}/chuckServer/${v}"; touch "${pvc}/chuckServer/${v}/chuckServer.sh"; done
}

prune() { # pvc protected_file [keep]
    PVC_ROOT="$1" TARGET=chuckServer PROTECTED_FILE="$2" KEEP="${3:-3}" bash "${SCRIPTS}/prune.sh"
}

t_keeps_newest_three() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.47 0.3.48 0.3.49 0.3.50 0.3.51
    ln -sfn 0.3.51 "${pvc}/chuckServer/latest"
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_missing "${pvc}/chuckServer/0.3.47" "oldest removed"
    assert_missing "${pvc}/chuckServer/0.3.48" "second oldest removed"
    assert_exists "${pvc}/chuckServer/0.3.49" "kept 3rd newest"
    assert_exists "${pvc}/chuckServer/0.3.51" "kept newest"
}

t_semver_order_not_lexical() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.9 0.3.10 0.3.11 0.3.12
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_missing "${pvc}/chuckServer/0.3.9" "0.3.9 is oldest"
    assert_exists "${pvc}/chuckServer/0.3.12" "0.3.12 newest"
}

t_protected_survives_beyond_keep() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.40 0.3.49 0.3.50 0.3.51 0.3.52
    local prot; prot=$(mktemp); printf '0.3.40\n0.3.49\n' > "${prot}"
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.40" "protected 0.3.40 (Allocated old GS) kept"
    assert_exists "${pvc}/chuckServer/0.3.49" "protected 0.3.49 kept"
}

t_latest_target_survives() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4 0.3.5
    ln -sfn 0.3.1 "${pvc}/chuckServer/latest"   # someone re-pointed latest backwards
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.1" "latest target kept"
    assert_missing "${pvc}/chuckServer/0.3.2" "unprotected old removed"
}

t_missing_protected_file_aborts() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    local rc=0
    prune "${pvc}" "/nonexistent" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "exit 1"
    assert_exists "${pvc}/chuckServer/0.3.1" "nothing deleted"
}

t_non_version_dirs_ignored() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    mkdir -p "${pvc}/chuckServer/scratch"
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/scratch" "non-version dir untouched"
}

t_nfs_silly_rename_dir_kept() {
    # A running server holds its binaries open; on the NFS-backed RWX mount that
    # shows up as .nfs* silly-renames. Belt-and-braces guard for the window
    # before every Fleet/GameServer carries ows.kbve.com/server-version.
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4 0.3.5
    touch "${pvc}/chuckServer/0.3.1/.nfs0000000012345678"
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.1" "in-use dir kept"
    assert_missing "${pvc}/chuckServer/0.3.2" "unprotected old removed"
}

t_nothing_to_prune() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.1" "kept"
}

run_tests
