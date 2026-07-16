#!/usr/bin/env bash
set -e

export MAXIMIZE="${MAXIMIZE:-true}"
MAXIMIZE_SCRIPT="${STARTUPDIR:-/dockerstartup}/maximize_window.sh"

CLOAK_BIN="${CLOAK_BIN:-/opt/cloakbrowser/cloakbrowser}"
CLOAK_PGREP="cloakbrowser"
CLOAK_USER_DATA_DIR="${CLOAK_USER_DATA_DIR:-/home/kasm-user/.config/cloakbrowser}"

KASM_USER_HOME="${HOME:-/home/kasm-user}"
KASM_USER_DESKTOP="${KASM_USER_HOME}/Desktop"
KASM_USER_SCRIPTS="${KASM_USER_HOME}/scripts"
KASM_VOID_TEMPLATE_DESKTOP="/opt/kasm-void/Desktop"
KASM_VOID_TEMPLATE_SCRIPTS="/opt/kasm-void/scripts"

stage_user_workspace() {
    mkdir -p "$KASM_USER_DESKTOP" "$KASM_USER_SCRIPTS"
    if [ -d "$KASM_VOID_TEMPLATE_SCRIPTS" ]; then
        cp -an "$KASM_VOID_TEMPLATE_SCRIPTS"/. "$KASM_USER_SCRIPTS"/ 2>/dev/null || true
        cp -a "$KASM_VOID_TEMPLATE_SCRIPTS"/*.sh "$KASM_USER_SCRIPTS"/ 2>/dev/null || true
        chmod +x "$KASM_USER_SCRIPTS"/*.sh 2>/dev/null || true
    fi
    if [ -d "$KASM_VOID_TEMPLATE_DESKTOP" ]; then
        cp -a "$KASM_VOID_TEMPLATE_DESKTOP"/*.desktop "$KASM_USER_DESKTOP"/ 2>/dev/null || true
        chmod +x "$KASM_USER_DESKTOP"/*.desktop 2>/dev/null || true
    fi
}
CDP_PORT="${CDP_PORT:-9222}"
CLOAK_CDP_ARGS="--remote-debugging-port=${CDP_PORT} --remote-debugging-address=127.0.0.1 --remote-allow-origins=http://127.0.0.1"
CLOAK_DEFAULT_ARGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --disable-software-rasterizer --start-maximized --no-first-run --no-default-browser-check --password-store=basic --user-data-dir=${CLOAK_USER_DATA_DIR} ${CLOAK_CDP_ARGS}"
CLOAK_ARGS=${CLOAK_APP_ARGS:-$CLOAK_DEFAULT_ARGS}
CLOAK_URL="${START_URL:-https://kbve.com}"

DISCORD_STARTUP="/dockerstartup/discord_startup.sh"
DISCORD_SEED="${KASM_USER_SCRIPTS}/seed-discord-config.sh"
NAV_SHIM="/dockerstartup/nav_shim.py"
NAV_SHIM_PGREP="nav_shim.py"

wait_desktop() {
    [ -x /usr/bin/filter_ready ] && /usr/bin/filter_ready || true
    [ -x /usr/bin/desktop_ready ] && /usr/bin/desktop_ready || true
}

cloak_clear_locks() {
    rm -f "${CLOAK_USER_DATA_DIR}/SingletonLock" "${CLOAK_USER_DATA_DIR}/SingletonSocket" 2>/dev/null || true
}

cloak_loop() {
    wait_desktop
    mkdir -p "${CLOAK_USER_DATA_DIR}"
    cloak_clear_locks
    local backoff=3
    while true; do
        if ! pgrep -f "$CLOAK_PGREP" >/dev/null 2>&1; then
            cloak_clear_locks
            local started_at=$(date +%s)
            echo "[startup] launching cloakbrowser at $(date -Iseconds)"
            [ -x "$MAXIMIZE_SCRIPT" ] && bash "$MAXIMIZE_SCRIPT" &
            "$CLOAK_BIN" $CLOAK_ARGS "$CLOAK_URL" >>/tmp/cloakbrowser.log 2>&1 &
            local pid=$!
            sleep 2
            if ! kill -0 "$pid" 2>/dev/null; then
                local elapsed=$(( $(date +%s) - started_at ))
                echo "[startup] cloakbrowser exited in ${elapsed}s; backoff=${backoff}s — tail of log:"
                tail -n 5 /tmp/cloakbrowser.log 2>/dev/null || true
                sleep "$backoff"
                if [ "$backoff" -lt 30 ]; then backoff=$(( backoff * 2 )); fi
                continue
            fi
            backoff=3
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
    [ -x "$DISCORD_SEED" ] && "$DISCORD_SEED" || true
    while true; do
        if ! pgrep -fa Discord 2>/dev/null | grep -qv "$DISCORD_SEED" ; then
            if ! pgrep -f "$DISCORD_STARTUP" >/dev/null 2>&1; then
                echo "[startup] launching discord at $(date -Iseconds)"
                [ -x "$DISCORD_SEED" ] && "$DISCORD_SEED" || true
                "$DISCORD_STARTUP" >>/tmp/discord.log 2>&1 &
            fi
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

stage_user_workspace

if [ -n "$DISABLE_CUSTOM_STARTUP" ]; then
    echo "[startup] DISABLE_CUSTOM_STARTUP set; idling"
    exec sleep infinity
fi

[ "${LAUNCH_CLOAK:-1}" = "1" ] && cloak_loop &
[ "${LAUNCH_DISCORD:-1}" = "1" ] && discord_loop &
[ "${LAUNCH_NAV_SHIM:-1}" = "1" ] && nav_shim_loop &

wait -n || true
exec sleep infinity
