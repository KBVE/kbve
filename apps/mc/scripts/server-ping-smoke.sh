#!/usr/bin/env bash
set -euo pipefail

# Probes a Velocity-fronted MC stack with itzg/mc-monitor (Server List Ping).
# A successful ping proves: backend reached "Done", proxy is forwarding,
# and a vanilla client could complete the handshake.
#
# Pure Go binary, single download, no npm tree — chosen over mineflayer to
# avoid the prismarine-* transitive surface (Snyk-flagged in 4.37.x).

HOST="${MC_HOST:-127.0.0.1}"
PORT="${MC_PORT:-25565}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5s}"
RETRY_LIMIT="${RETRY_LIMIT:-60}"
MC_MONITOR_BIN="${MC_MONITOR_BIN:-mc-monitor}"

if ! command -v "$MC_MONITOR_BIN" >/dev/null 2>&1; then
    echo "[ping-smoke] $MC_MONITOR_BIN not in PATH" >&2
    exit 2
fi

echo "[ping-smoke] probing ${HOST}:${PORT} (retry ${RETRY_LIMIT}x @ ${RETRY_INTERVAL})"

"$MC_MONITOR_BIN" status \
    --host "$HOST" \
    --port "$PORT" \
    --retry-interval "$RETRY_INTERVAL" \
    --retry-limit "$RETRY_LIMIT" \
    --show-player-count
