#!/usr/bin/env bash
# Shared helpers for the ows publish scripts. Source, do not execute.

# ows_is_deployed <version_dir> <target>
# True when the dir holds a usable, fully published server build — i.e. the UBT
# launch script is present. UBT names it after -target (chuckServerDev ->
# chuckServerDev.sh, which also happens to match *Server.sh; a future target
# without that suffix would not, hence the explicit ${TARGET}.sh check).
#
# gate.sh and deploy.sh MUST agree on this predicate. When they disagreed, a
# non-empty dir with no launch script (what the old non-atomic
# `rm -rf; mkdir; cp -r` left behind on a killed runner) gated as "build" and
# then hit deploy's "already deployed" refusal after an 8-hour build.
ows_is_deployed() {
    local dir="$1" target="$2"
    [ -d "${dir}" ] || return 1
    [ -f "${dir}/${target}.sh" ] && return 0
    find "${dir}" -maxdepth 1 -name '*Server.sh' -type f -print -quit 2>/dev/null | grep -q .
}

# ows_is_nonempty <dir>
ows_is_nonempty() {
    [ -d "$1" ] && [ -n "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]
}
