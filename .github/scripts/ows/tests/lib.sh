#!/usr/bin/env bash
# Minimal assertions for the ows script tests. Source this file.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "${HERE}/.." && pwd)"
export SCRIPTS

_fail_count=0

assert_eq() {
    local expected="$1" actual="$2" msg="${3:-}"
    if [ "${expected}" != "${actual}" ]; then
        echo "FAIL ${msg}: expected [${expected}] got [${actual}]" >&2
        _fail_count=$((_fail_count + 1))
    fi
}

assert_exists() {
    [ -e "$1" ] || { echo "FAIL ${2:-}: expected path to exist: $1" >&2; _fail_count=$((_fail_count + 1)); }
}

assert_missing() {
    [ ! -e "$1" ] || { echo "FAIL ${2:-}: expected path to be absent: $1" >&2; _fail_count=$((_fail_count + 1)); }
}

# Run every function named t_* in the calling file, report, exit.
run_tests() {
    local fn
    for fn in $(declare -F | awk '{print $3}' | grep '^t_' | sort); do
        echo "--- ${fn}"
        "${fn}"
    done
    if [ "${_fail_count}" -ne 0 ]; then
        echo "${_fail_count} assertion(s) failed" >&2
        exit 1
    fi
    echo "all passed"
}
