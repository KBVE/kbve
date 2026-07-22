#!/bin/sh
set -eu

REST_HOST="${PALWORLD_REST_BIND:-127.0.0.1}"
REST_PORT="${REST_API_PORT:-8212}"
ADMIN_PASS="${ADMIN_PASSWORD:-}"
WARN_SECS="${PRESTOP_WARN_SECS:-30}"

if [ -z "$ADMIN_PASS" ]; then
    echo "[prestop] ADMIN_PASSWORD unset — skipping graceful shutdown"
    exit 0
fi

base="http://${REST_HOST}:${REST_PORT}/v1/api"
auth="admin:${ADMIN_PASS}"

echo "[prestop] announcing restart"
curl -fsS -u "$auth" -X POST "$base/announce" \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"Server restarting in ${WARN_SECS}s — progress will be saved.\"}" >/dev/null 2>&1 || true

echo "[prestop] requesting graceful shutdown (save)"
curl -fsS -u "$auth" -X POST "$base/shutdown" \
    -H 'Content-Type: application/json' \
    -d "{\"waittime\":${WARN_SECS},\"message\":\"Restarting now. See you in a minute.\"}" >/dev/null 2>&1 || true

echo "[prestop] done"
exit 0
