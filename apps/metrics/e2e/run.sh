#!/usr/bin/env bash
# End-to-end test: boots real ClickHouse + the metrics binary, drives the public
# ingest endpoint, and asserts rows land in CH correctly sanitized.
#
# Usage: apps/metrics/e2e/run.sh
# Requires: docker compose, curl.
set -euo pipefail

cd "$(dirname "$0")"

INGEST="http://localhost:5500/api/v1/ingest/errors"
TOKEN="e2e-secret-token"
PASS=0

fail() {
    echo "FAIL: $*" >&2
    echo "--- metrics logs ---" >&2
    docker compose logs metrics 2>&1 | tail -40 >&2 || true
    exit 1
}

cleanup() {
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

ch() {
    docker compose exec -T clickhouse clickhouse-client -q "$1"
}

echo "==> Building + starting stack"
docker compose up -d --build

echo "==> Waiting for metrics readiness"
ready=""
for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5500/readiness || true)
    if [ "$code" = "200" ]; then
        ready=1
        break
    fi
    sleep 2
done
[ -n "$ready" ] || fail "metrics never became ready"

echo "==> Case 1: missing token is rejected (401)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$INGEST" \
    -H 'content-type: application/json' \
    -d '{"events":[{"project":"e2e","message":"no token"}]}')
[ "$code" = "401" ] || fail "expected 401 without token, got $code"

echo "==> Case 2: valid batch is accepted (202)"
body=$(curl -s -X POST "$INGEST" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[{
          "project":"e2e",
          "message":"boomctrl",
          "platform":"HACKER",
          "environment":"chaos",
          "error_type":"TypeError",
          "stack":"at foo\nat bar",
          "url":"https://example.com/p?secret=1",
          "handled":false
        }]}')
echo "    response: $body"
echo "$body" | grep -q '"accepted":1' || fail "expected accepted:1, got $body"

echo "==> Waiting for flush"
sleep 3

echo "==> Case 3: row landed in ClickHouse, sanitized"
count=$(ch "SELECT count() FROM telemetry.errors_distributed WHERE project='e2e'")
[ "$count" -ge 1 ] || fail "expected >=1 row in CH, got $count"

platform=$(ch "SELECT platform FROM telemetry.errors_distributed WHERE project='e2e' LIMIT 1")
[ "$platform" = "web" ] || fail "platform not clamped to allowlist (got '$platform')"

message=$(ch "SELECT message FROM telemetry.errors_distributed WHERE project='e2e' LIMIT 1")
[ "$message" = "boomctrl" ] || fail "control char not stripped from message (got '$message')"

url=$(ch "SELECT url FROM telemetry.errors_distributed WHERE project='e2e' LIMIT 1")
[ "$url" = "https://example.com/p" ] || fail "url query string not stripped (got '$url')"

PASS=1
echo "==> PASS: ingest -> sanitize -> ClickHouse verified end to end"
[ "$PASS" = "1" ]
