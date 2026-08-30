#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mk_build() { # $1 = dir to create as LinuxServer
    mkdir -p "$1/Engine"
    printf '#!/bin/sh\necho server\n' > "$1/chuckServer.sh"
    echo "sha=abc" > "$1/BUILD_INFO"
}

deploy() { # pvc target version server_dir [force]
    PVC_ROOT="$1" TARGET="$2" VERSION="$3" SERVER_DIR="$4" FORCE_REPUBLISH="${5:-false}" \
        bash "${SCRIPTS}/deploy.sh"
}

t_fresh_deploy_is_flat_and_repoints_latest() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "flat binary"
    assert_missing "${tmp}/pvc/chuckServer/1.0.0/LinuxServer" "no nested level"
    assert_eq "1.0.0" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest symlink"
    assert_eq "755" "$(stat -c %a "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh")" "mode"
}

t_republish_refused_by_default() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    echo "original" > "${tmp}/pvc/chuckServer/1.0.0/marker"
    local rc=0
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer" >/dev/null 2>&1 || rc=$?
    assert_eq "3" "${rc}" "refused exit code"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/marker" "existing dir untouched"
}

t_republish_allowed_with_force() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    echo "original" > "${tmp}/pvc/chuckServer/1.0.0/marker"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer" true
    assert_missing "${tmp}/pvc/chuckServer/1.0.0/marker" "force replaced dir"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "binary present after force"
}

t_empty_existing_dir_is_not_a_deploy() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    mkdir -p "${tmp}/pvc/chuckServer/1.0.0"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "filled empty dir"
}

t_partial_dir_without_launch_script_is_replaced() {
    # gate.sh says "build" for a non-empty dir with no launch script, so deploy
    # must publish over it. Refusing here would burn an 8-hour build and exit 3.
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    mkdir -p "${tmp}/pvc/chuckServer/1.0.0/Engine"
    touch "${tmp}/pvc/chuckServer/1.0.0/Engine/half-copied.pak"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "published over partial dir"
    assert_missing "${tmp}/pvc/chuckServer/1.0.0/Engine/half-copied.pak" "partial contents gone"
}

t_target_without_server_suffix_refused() {
    # UBT names the launch script after -target; chuckServerDev -> chuckServerDev.sh.
    # deploy must refuse target-agnostically (non-empty dest dir), not just on *Server.sh.
    local tmp; tmp=$(mktemp -d)
    mkdir -p "${tmp}/out/LinuxServer/Engine"
    printf '#!/bin/sh\necho server\n' > "${tmp}/out/LinuxServer/chuckServerDev.sh"
    deploy "${tmp}/pvc" chuckServerDev 1.0.0 "${tmp}/out/LinuxServer"
    echo "original" > "${tmp}/pvc/chuckServerDev/1.0.0/marker"
    local rc=0
    deploy "${tmp}/pvc" chuckServerDev 1.0.0 "${tmp}/out/LinuxServer" >/dev/null 2>&1 || rc=$?
    assert_eq "3" "${rc}" "chuckServerDev refused exit code"
    assert_exists "${tmp}/pvc/chuckServerDev/1.0.0/marker" "existing dir untouched"
}

t_second_version_keeps_first_and_moves_latest() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.1 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "old kept"
    assert_eq "1.0.1" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest moved"
}

t_missing_server_dir_fails() {
    local tmp; tmp=$(mktemp -d)
    local rc=0
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/nope" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "missing SERVER_DIR"
}

t_no_staging_dir_left_behind() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    local leftover; leftover=$(find "${tmp}/pvc/chuckServer" -maxdepth 1 -name '.stage-*' | wc -l)
    assert_eq "0" "${leftover}" "no staging dir remains"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "binary in place"
}

t_force_republish_older_version_does_not_move_latest_back() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.1 "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer" true
    assert_eq "1.0.1" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest stays on newer version"
}

t_deploying_newer_version_moves_latest_forward() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.1 "${tmp}/out/LinuxServer"
    assert_eq "1.0.1" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest moves to newer version"
}

run_tests
