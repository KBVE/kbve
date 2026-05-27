#!/bin/sh
set -eu

FACTORIO_BIN="${FACTORIO_BIN:-/opt/factorio/bin/x64/factorio}"
FACTORIO_SCENARIO="${FACTORIO_SCENARIO:-kbve}"
FACTORIO_PORT="${FACTORIO_PORT:-34197}"
FACTORIO_CONFIG_DIR="${FACTORIO_CONFIG_DIR:-/factorio/config}"
FACTORIO_DEFAULTS_DIR="${FACTORIO_DEFAULTS_DIR:-/opt/factorio/config-defaults}"
FACTORIO_LOG_DIR="${FACTORIO_LOG_DIR:-/shared/log}"
FACTORIO_CONSOLE_LOG="${FACTORIO_CONSOLE_LOG:-${FACTORIO_LOG_DIR}/console.log}"
FACTORIO_RCON_PORT="${FACTORIO_RCON_PORT:-27015}"
FACTORIO_RCON_BIND="${FACTORIO_RCON_BIND:-127.0.0.1}"
FACTORIO_RCON_PASSWORD="${FACTORIO_RCON_PASSWORD:-}"

AGONES_SDK_HTTP="${AGONES_SDK_HTTP:-}"
AGONES_HEALTH_INTERVAL="${AGONES_HEALTH_INTERVAL:-5}"
AGONES_READY_DELAY="${AGONES_READY_DELAY:-30}"

mkdir -p "$FACTORIO_CONFIG_DIR" "$FACTORIO_LOG_DIR"
for f in server-settings.json map-gen-settings.json map-settings.json; do
    if [ ! -f "${FACTORIO_CONFIG_DIR}/${f}" ] && [ -f "${FACTORIO_DEFAULTS_DIR}/${f}" ]; then
        cp "${FACTORIO_DEFAULTS_DIR}/${f}" "${FACTORIO_CONFIG_DIR}/${f}"
    fi
done

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

echo "[agones-shim] launching factorio scenario=${FACTORIO_SCENARIO} port=${FACTORIO_PORT} console_log=${FACTORIO_CONSOLE_LOG}"

# shellcheck disable=SC2086
"$FACTORIO_BIN" \
    --start-server-load-scenario "$FACTORIO_SCENARIO" \
    --port "$FACTORIO_PORT" \
    --server-settings "${FACTORIO_CONFIG_DIR}/server-settings.json" \
    --console-log "${FACTORIO_CONSOLE_LOG}" \
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
