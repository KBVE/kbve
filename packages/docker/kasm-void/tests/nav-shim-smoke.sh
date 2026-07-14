#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/kbve/kasm-void:dev}"
TOKEN="smoke-token-$$"
CID=""

cleanup() {
  if [ -n "$CID" ]; then
    docker rm -f "$CID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

dump_logs_and_die() {
  echo "FAIL: $1" >&2
  if [ -n "$CID" ]; then
    echo "--- docker logs ($CID) ---" >&2
    docker logs "$CID" 2>&1 | tail -40 >&2
    echo "--- /end logs ---" >&2
  fi
  exit 1
}

CID=$(docker run -d --rm \
  -e URL_LAUNCHER_TOKEN="$TOKEN" \
  --entrypoint python3 "$IMAGE" /dockerstartup/nav_shim.py)

healthz=""
for _ in $(seq 1 30); do
  healthz=$(docker exec "$CID" curl -fsS http://127.0.0.1:9998/healthz 2>/dev/null || true)
  [ -n "$healthz" ] && break
  sleep 1
done

[ -n "$healthz" ] || dump_logs_and_die "nav_shim /healthz never came up"
echo "$healthz" | grep -q '"ok"' || dump_logs_and_die "nav_shim /healthz unexpected body: $healthz"
echo "PASS: nav_shim /healthz reachable and returns ok"

code=$(docker exec "$CID" curl -s -o /dev/null -w '%{http_code}' \
  -X POST http://127.0.0.1:9998/open \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}')
[ "$code" = "401" ] || dump_logs_and_die "/open without bearer expected 401, got $code"
echo "PASS: nav_shim /open without bearer returns 401"

code=$(docker exec "$CID" curl -s -o /dev/null -w '%{http_code}' \
  -X POST http://127.0.0.1:9998/open \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1/secret"}')
[ "$code" = "400" ] || dump_logs_and_die "/open loopback URL expected 400, got $code"
echo "PASS: nav_shim rejects loopback URL with 400"

code=$(docker exec "$CID" curl -s -o /dev/null -w '%{http_code}' \
  -X POST http://127.0.0.1:9998/open \
  -H "Authorization: Bearer wrong-$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}')
[ "$code" = "401" ] || dump_logs_and_die "/open wrong bearer expected 401, got $code"
echo "PASS: nav_shim /open with wrong bearer returns 401"

code=$(docker exec "$CID" curl -s -o /dev/null -w '%{http_code}' \
  http://127.0.0.1:9998/does-not-exist)
[ "$code" = "404" ] || dump_logs_and_die "/does-not-exist expected 404, got $code"
echo "PASS: nav_shim returns 404 for unknown route"
