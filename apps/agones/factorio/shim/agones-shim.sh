#!/bin/sh
set -eu

FACTORIO_BIN="${FACTORIO_BIN:-/opt/factorio/bin/x64/factorio}"
FACTORIO_SCENARIO="${FACTORIO_SCENARIO:-kbve}"
FACTORIO_SAVE="${FACTORIO_SAVE:-}"
FACTORIO_SAVES_DIR="${FACTORIO_SAVES_DIR:-/factorio/saves}"
FACTORIO_PORT="${FACTORIO_PORT:-34197}"
FACTORIO_CONFIG_DIR="${FACTORIO_CONFIG_DIR:-/factorio/config}"
FACTORIO_DEFAULTS_DIR="${FACTORIO_DEFAULTS_DIR:-/opt/factorio/config-defaults}"
FACTORIO_MODS_DIR="${FACTORIO_MODS_DIR:-/factorio/mods}"
FACTORIO_MODS_DEFAULTS_DIR="${FACTORIO_MODS_DEFAULTS_DIR:-/opt/factorio/mods-defaults}"
FACTORIO_LOG_DIR="${FACTORIO_LOG_DIR:-/shared/log}"
FACTORIO_CONSOLE_LOG="${FACTORIO_CONSOLE_LOG:-${FACTORIO_LOG_DIR}/console.log}"
FACTORIO_RCON_PORT="${FACTORIO_RCON_PORT:-27015}"
FACTORIO_RCON_BIND="${FACTORIO_RCON_BIND:-127.0.0.1}"
FACTORIO_RCON_PASSWORD="${FACTORIO_RCON_PASSWORD:-}"

FACTORIO_USERNAME="${FACTORIO_USERNAME:-}"
FACTORIO_TOKEN="${FACTORIO_TOKEN:-}"
FACTORIO_PUBLIC="${FACTORIO_PUBLIC:-}"
FACTORIO_GAME_PASSWORD="${FACTORIO_GAME_PASSWORD:-}"
FACTORIO_ADMINS="${FACTORIO_ADMINS:-}"

AGONES_SDK_HTTP="${AGONES_SDK_HTTP:-}"
AGONES_HEALTH_INTERVAL="${AGONES_HEALTH_INTERVAL:-5}"
AGONES_READY_DELAY="${AGONES_READY_DELAY:-30}"

mkdir -p "$FACTORIO_CONFIG_DIR" "$FACTORIO_MODS_DIR" "$FACTORIO_LOG_DIR"
for f in server-settings.json map-gen-settings.json map-settings.json; do
    if [ ! -f "${FACTORIO_CONFIG_DIR}/${f}" ] && [ -f "${FACTORIO_DEFAULTS_DIR}/${f}" ]; then
        cp "${FACTORIO_DEFAULTS_DIR}/${f}" "${FACTORIO_CONFIG_DIR}/${f}"
    fi
done

if [ ! -f "${FACTORIO_MODS_DIR}/mod-list.json" ] && [ -f "${FACTORIO_MODS_DEFAULTS_DIR}/mod-list.json" ]; then
    cp "${FACTORIO_MODS_DEFAULTS_DIR}/mod-list.json" "${FACTORIO_MODS_DIR}/mod-list.json"
    echo "[agones-shim] mod-list defaults applied"
fi

BASE_MODS="base elevated-rails quality space-age core"
sync_mod() {
    name="$1"
    for skip in $BASE_MODS; do
        [ "$name" = "$skip" ] && return 0
    done
    if ls "${FACTORIO_MODS_DIR}/${name}_"*.zip >/dev/null 2>&1; then
        return 0
    fi
    if [ -z "$FACTORIO_USERNAME" ] || [ -z "$FACTORIO_TOKEN" ]; then
        echo "[agones-shim] WARN cannot download mod ${name}: FACTORIO_USERNAME or FACTORIO_TOKEN unset"
        return 1
    fi
    echo "[agones-shim] fetching mod portal metadata for ${name}..."
    info=$(wget -q -O - "https://mods.factorio.com/api/mods/${name}") || {
        echo "[agones-shim] WARN portal metadata fetch failed for ${name}"
        return 1
    }
    dl_url=$(echo "$info" | jq -r '.releases | sort_by(.released_at) | last | .download_url // empty')
    file_name=$(echo "$info" | jq -r '.releases | sort_by(.released_at) | last | .file_name // empty')
    if [ -z "$dl_url" ] || [ -z "$file_name" ]; then
        echo "[agones-shim] WARN no releases for ${name}"
        return 1
    fi
    echo "[agones-shim] downloading ${file_name}..."
    if wget -q -O "${FACTORIO_MODS_DIR}/${file_name}" \
        "https://mods.factorio.com${dl_url}?username=${FACTORIO_USERNAME}&token=${FACTORIO_TOKEN}"; then
        echo "[agones-shim] installed ${file_name}"
    else
        rm -f "${FACTORIO_MODS_DIR}/${file_name}"
        echo "[agones-shim] WARN download failed for ${name}"
        return 1
    fi
}

if [ -f "${FACTORIO_MODS_DIR}/mod-list.json" ]; then
    for mod in $(jq -r '.mods[] | select(.enabled == true) | .name' "${FACTORIO_MODS_DIR}/mod-list.json"); do
        sync_mod "$mod" || true
    done
fi

SETTINGS="${FACTORIO_CONFIG_DIR}/server-settings.json"
if [ -n "$FACTORIO_USERNAME" ] && [ -n "$FACTORIO_TOKEN" ]; then
    sed -i \
        -e "s|\"username\": *\"[^\"]*\"|\"username\": \"${FACTORIO_USERNAME}\"|" \
        -e "s|\"token\": *\"[^\"]*\"|\"token\": \"${FACTORIO_TOKEN}\"|" \
        "$SETTINGS"
    echo "[agones-shim] matchmaking credentials applied (username=${FACTORIO_USERNAME})"
fi
case "$FACTORIO_PUBLIC" in
    1|true|TRUE|yes|YES)
        sed -i 's|"public": *false|"public": true|' "$SETTINGS"
        echo "[agones-shim] public visibility enabled"
        ;;
    0|false|FALSE|no|NO)
        sed -i 's|"public": *true|"public": false|' "$SETTINGS"
        ;;
esac
if [ -n "$FACTORIO_GAME_PASSWORD" ]; then
    sed -i \
        -e "s|\"game_password\": *\"[^\"]*\"|\"game_password\": \"${FACTORIO_GAME_PASSWORD}\"|" \
        "$SETTINGS"
fi

ADMINLIST="${FACTORIO_CONFIG_DIR}/server-adminlist.json"
if [ -n "$FACTORIO_ADMINS" ]; then
    JSON="["
    SEP=""
    IFS=','
    for ADMIN in $FACTORIO_ADMINS; do
        ADMIN_TRIMMED="$(echo "$ADMIN" | sed 's/^ *//;s/ *$//')"
        [ -z "$ADMIN_TRIMMED" ] && continue
        JSON="${JSON}${SEP}\"${ADMIN_TRIMMED}\""
        SEP=","
    done
    unset IFS
    JSON="${JSON}]"
    echo "$JSON" > "$ADMINLIST"
    echo "[agones-shim] adminlist applied: ${FACTORIO_ADMINS}"
fi
ADMIN_ARGS=""
if [ -f "$ADMINLIST" ]; then
    ADMIN_ARGS="--server-adminlist ${ADMINLIST}"
fi

RCON_ARGS=""
if [ -n "$FACTORIO_RCON_PASSWORD" ]; then
    RCON_ARGS="--rcon-bind ${FACTORIO_RCON_BIND}:${FACTORIO_RCON_PORT} --rcon-password ${FACTORIO_RCON_PASSWORD}"
fi

sdk_post() {
    [ -n "$AGONES_SDK_HTTP" ] || return 0
    wget -q -O - --post-data='{}' --header='Content-Type: application/json' \
        "${AGONES_SDK_HTTP}$1" >/dev/null 2>&1 || true
}

FACTORIO_PID=""

cleanup() {
    echo "[agones-shim] received shutdown signal"
    sdk_post /shutdown
    if [ -n "$FACTORIO_PID" ] && kill -0 "$FACTORIO_PID" 2>/dev/null; then
        kill -TERM "$FACTORIO_PID" 2>/dev/null || true
        wait "$FACTORIO_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup TERM INT

START_ARG="--start-server-load-scenario $FACTORIO_SCENARIO"
START_DESC="scenario=${FACTORIO_SCENARIO}"
if [ -n "$FACTORIO_SAVE" ]; then
    SAVE_PATH="${FACTORIO_SAVES_DIR}/${FACTORIO_SAVE}"
    if [ -f "$SAVE_PATH" ]; then
        START_ARG="--start-server $SAVE_PATH"
        START_DESC="save=${FACTORIO_SAVE}"
    else
        echo "[agones-shim] WARN FACTORIO_SAVE=${FACTORIO_SAVE} not found at ${SAVE_PATH}, falling back to scenario ${FACTORIO_SCENARIO}"
    fi
fi

echo "[agones-shim] launching factorio ${START_DESC} port=${FACTORIO_PORT} console_log=${FACTORIO_CONSOLE_LOG}"

# shellcheck disable=SC2086
"$FACTORIO_BIN" \
    $START_ARG \
    --port "$FACTORIO_PORT" \
    --server-settings "${FACTORIO_CONFIG_DIR}/server-settings.json" \
    --mod-directory "${FACTORIO_MODS_DIR}" \
    --console-log "${FACTORIO_CONSOLE_LOG}" \
    $ADMIN_ARGS \
    $RCON_ARGS &
FACTORIO_PID=$!

if [ -n "$AGONES_SDK_HTTP" ]; then
    (
        sleep "$AGONES_READY_DELAY"
        echo "[agones-shim] sending Ready() to ${AGONES_SDK_HTTP}"
        sdk_post /ready
        while kill -0 "$FACTORIO_PID" 2>/dev/null; do
            sdk_post /health
            sleep "$AGONES_HEALTH_INTERVAL"
        done
    ) &
fi

wait "$FACTORIO_PID"
