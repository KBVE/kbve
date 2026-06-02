#!/usr/bin/env bash
set -e

export MAXIMIZE="${MAXIMIZE:-true}"
MAXIMIZE_SCRIPT="${STARTUPDIR:-/dockerstartup}/maximize_window.sh"

CLOAK_BIN="${CLOAK_BIN:-/opt/cloakbrowser/cloakbrowser}"
CLOAK_PGREP="cloakbrowser"
CDP_PORT="${CDP_PORT:-9222}"
CLOAK_CDP_ARGS="--remote-debugging-port=${CDP_PORT} --remote-debugging-address=127.0.0.1 --remote-allow-origins=http://127.0.0.1"
CLOAK_DEFAULT_ARGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --start-maximized --no-first-run --no-default-browser-check --password-store=basic ${CLOAK_CDP_ARGS}"
CLOAK_ARGS=${CLOAK_APP_ARGS:-$CLOAK_DEFAULT_ARGS}
CLOAK_URL="${START_URL:-https://kbve.com}"

DISCORD_STARTUP="/dockerstartup/discord_startup.sh"
NAV_SHIM="/dockerstartup/nav_shim.py"
NAV_SHIM_PGREP="nav_shim.py"

wait_desktop() {
    [ -x /usr/bin/filter_ready ] && /usr/bin/filter_ready || true
    [ -x /usr/bin/desktop_ready ] && /usr/bin/desktop_ready || true
}

cloak_loop() {
    wait_desktop
    while true; do
        if ! pgrep -f "$CLOAK_PGREP" >/dev/null 2>&1; then
            echo "[startup] launching cloakbrowser"
            [ -x "$MAXIMIZE_SCRIPT" ] && bash "$MAXIMIZE_SCRIPT" &
            "$CLOAK_BIN" $CLOAK_ARGS "$CLOAK_URL" >/tmp/cloakbrowser.log 2>&1 &
        fi
        sleep 3
    done
}

discord_loop() {
    wait_desktop
    if [ ! -x "$DISCORD_STARTUP" ]; then
        echo "[startup] discord_startup.sh missing; skipping discord supervisor"
        return
    fi
    while true; do
        if ! pgrep -f -i 'discord|electron' >/dev/null 2>&1; then
            echo "[startup] launching discord"
            "$DISCORD_STARTUP" >/tmp/discord.log 2>&1 &
        fi
        sleep 3
    done
}

nav_shim_loop() {
    if [ ! -x "$NAV_SHIM" ]; then
        echo "[startup] nav_shim.py missing; skipping URL launcher supervisor"
        return
    fi
    while true; do
        if ! pgrep -f "$NAV_SHIM_PGREP" >/dev/null 2>&1; then
            echo "[startup] launching nav_shim"
            python3 "$NAV_SHIM" >/tmp/nav_shim.log 2>&1 &
        fi
        sleep 5
    done
}

if [ -n "$DISABLE_CUSTOM_STARTUP" ]; then
    echo "[startup] DISABLE_CUSTOM_STARTUP set; idling"
    exec sleep infinity
fi

[ "${LAUNCH_CLOAK:-1}" = "1" ] && cloak_loop &
[ "${LAUNCH_DISCORD:-1}" = "1" ] && discord_loop &
[ "${LAUNCH_NAV_SHIM:-1}" = "1" ] && nav_shim_loop &

wait -n || true
exec sleep infinity
