#!/usr/bin/env bash
set -ex

START_COMMAND="${CLOAK_BIN:-/opt/cloakbrowser/cloakbrowser}"
PGREP="cloakbrowser"
export MAXIMIZE="true"
export MAXIMIZE_NAME="CloakBrowser"
MAXIMIZE_SCRIPT=${STARTUPDIR}/maximize_window.sh

DEFAULT_ARGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --start-maximized --no-first-run --no-default-browser-check --password-store=basic"
ARGS=${APP_ARGS:-$DEFAULT_ARGS}

options=$(getopt -o gau: -l go,assign,url: -n "$0" -- "$@") || exit
eval set -- "$options"

while [[ $1 != -- ]]; do
    case $1 in
        -g|--go) GO='true'; shift 1;;
        -a|--assign) ASSIGN='true'; shift 1;;
        -u|--url) OPT_URL=$2; shift 2;;
        *) echo "bad option: $1" >&2; exit 1;;
    esac
done
shift

FORCE=$2

resolve_url() {
    if [ -n "$OPT_URL" ]; then echo "$OPT_URL"; return; fi
    if [ -n "$KASM_URL" ]; then echo "$KASM_URL"; return; fi
    if [ -n "$LAUNCH_URL" ]; then echo "$LAUNCH_URL"; return; fi
    echo "${START_URL:-https://discord.com/app}"
}

kasm_exec() {
    URL=$(resolve_url "$@")
    /usr/bin/filter_ready
    /usr/bin/desktop_ready
    bash ${MAXIMIZE_SCRIPT} &
    $START_COMMAND $ARGS "$URL"
}

kasm_startup() {
    URL=$(resolve_url)

    if [ -z "$DISABLE_CUSTOM_STARTUP" ] || [ -n "$FORCE" ]; then
        echo "Entering process startup loop"
        set +x
        while true
        do
            if ! pgrep -f "$PGREP" > /dev/null
            then
                /usr/bin/filter_ready
                /usr/bin/desktop_ready
                set +e
                bash ${MAXIMIZE_SCRIPT} &
                $START_COMMAND $ARGS "$URL" &
                set -e
            fi
            sleep 1
        done
        set -x
    fi
}

if [ -n "$GO" ] || [ -n "$ASSIGN" ]; then
    kasm_exec "$@"
else
    kasm_startup
fi
