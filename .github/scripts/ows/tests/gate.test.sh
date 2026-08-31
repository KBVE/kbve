#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

gate() { # pvc target version [force]
    PVC_ROOT="$1" TARGET="$2" VERSION="$3" FORCE_REPUBLISH="${4:-false}" bash "${SCRIPTS}/gate.sh"
}

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

t_legacy_linuxserver_level_counts_as_deployed() {
    # The fleet launchers exec /server/latest/LinuxServer/chuckServer.sh, so a
    # nested dir IS bootable. Treating it as "not deployed" would send deploy.sh
    # in to overwrite a directory live GameServers are running from.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0/LinuxServer"
    touch "${pvc}/chuckServer/1.0.0/LinuxServer/chuckServer.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServer 1.0.0)" "nested layout is a deploy"
}

t_nested_target_without_server_suffix_counts_as_deployed() {
    # The flat branch handles ${TARGET}.sh explicitly; the nested branch must too,
    # or a bootable <ver>/LinuxServer/chuckServerDev.sh gates as "not deployed"
    # and deploy.sh replaces a directory a pod could be executing from.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServerDev/1.0.0/LinuxServer"
    touch "${pvc}/chuckServerDev/1.0.0/LinuxServer/chuckServerDev.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServerDev 1.0.0)" "nested Dev target is a deploy"
}

t_linuxserver_dir_without_binary_builds() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0/LinuxServer/Engine"
    touch "${pvc}/chuckServer/1.0.0/LinuxServer/Engine/half-copied.pak"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "nested but no launch script"
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

t_force_republish_overrides_skip() {
    # server_build is gated on should_build, so force_republish is only reachable
    # if the gate itself honours it. Without this the input is a silent no-op in
    # exactly the state it exists for.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    touch "${pvc}/chuckServer/1.0.0/chuckServer.sh"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0 true)" "force_republish rebuilds"
}

t_force_republish_false_still_skips() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    touch "${pvc}/chuckServer/1.0.0/chuckServer.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServer 1.0.0 false)" "no force, still skip"
}

t_nonempty_without_launch_script_builds() {
    # Partial dir from the old non-atomic publish. Must gate as "build", and
    # deploy must agree and replace it rather than refusing after 8 hours.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0/Engine"
    touch "${pvc}/chuckServer/1.0.0/Engine/half-copied.pak"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "partial dir is not a deploy"
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
