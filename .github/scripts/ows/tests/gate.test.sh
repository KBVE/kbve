#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

gate() { PVC_ROOT="$1" TARGET="$2" VERSION="$3" bash "${SCRIPTS}/gate.sh"; }

t_missing_dir_builds() {
    local pvc; pvc=$(mktemp -d)
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "missing dir"
}

t_empty_dir_builds() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "empty dir"
}

t_flat_binary_skips() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    touch "${pvc}/chuckServer/1.0.0/chuckServer.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServer 1.0.0)" "flat binary present"
}

t_legacy_linuxserver_level_does_not_count() {
    # The old gate looked for <ver>/LinuxServer; deploy never creates it. Must not skip on it.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0/LinuxServer"
    touch "${pvc}/chuckServer/1.0.0/LinuxServer/chuckServer.sh"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "nested layout is not a deploy"
}

t_other_version_present_still_builds() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/0.9.0"
    touch "${pvc}/chuckServer/0.9.0/chuckServer.sh"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "different version"
}

t_target_without_server_suffix_flat_binary_skips() {
    # UBT names the launch script after -target; chuckServerDev -> chuckServerDev.sh.
    # It happens to also match *Server.sh, but gate must recognize it via ${TARGET}.sh too.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServerDev/1.0.0"
    touch "${pvc}/chuckServerDev/1.0.0/chuckServerDev.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServerDev 1.0.0)" "chuckServerDev binary present"
}

t_empty_args_fail() {
    local pvc rc=0; pvc=$(mktemp -d)
    PVC_ROOT="${pvc}" TARGET="" VERSION="1.0.0" bash "${SCRIPTS}/gate.sh" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "empty TARGET must exit 1"
    rc=0
    PVC_ROOT="${pvc}" TARGET="chuckServer" VERSION="" bash "${SCRIPTS}/gate.sh" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "empty VERSION must exit 1"
}

run_tests
