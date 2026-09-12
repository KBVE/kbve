#!/usr/bin/env bash
# End-to-end test: boots real ClickHouse + the metrics binary, drives the public
# ingest endpoint, and asserts rows land in CH correctly sanitized.
#
# Usage: services/metrics/e2e/run.sh
# Requires: docker compose, curl.
set -euo pipefail

cd "$(dirname "$0")"

INGEST="http://localhost:5500/api/v1/ingest/errors"
TOKEN="e2e-secret-token"
JWT_SECRET="e2e-jwt-secret-that-is-long-enough"
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

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# An HS256 service_role token. The read paths are staff-gated, and asserting
# only that they reject anonymous callers would leave every line past the guard
# untested -- the SQL included.
mint_jwt() {
    hdr=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
    pay=$(printf '{"sub":"e2e","role":"service_role","exp":%s}' "$(($(date +%s) + 3600))" | b64url)
    unsigned="${hdr}.${pay}"
    sig=$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
    printf '%s.%s' "$unsigned" "$sig"
}

read_api() {
    curl -s -H "authorization: Bearer $(mint_jwt)" "http://localhost:5500$1"
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

# The control character is written as a JSON \u escape, not as a raw byte: a
# raw 0x01 inside a string is invalid JSON and serde rejects the whole body
# before the sanitizer is reached, so the raw form tested nothing.
echo "==> Case 2: valid batch is accepted (202)"
body=$(curl -s -X POST "$INGEST" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[{
          "project":"e2e",
          "message":"boom\u0001ctrl",
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

echo "==> Case 4: every table and view the schema source defines exists"
# The DDL is generated from packages/data/ch/schemas/telemetry.sql into both the
# production setup job and init/01-telemetry.sql. Asserting the object list here
# is what makes the generated init a real check on the source rather than a copy
# that happens to be applied.
for obj in errors_distributed perf_distributed events_distributed \
    error_groups perf_summary event_counts; do
    found=$(ch "SELECT count() FROM system.tables WHERE database='telemetry' AND name='$obj'")
    [ "$found" = "1" ] || fail "telemetry.$obj missing from the applied schema"
done

echo "==> Case 5: recovery drill -- the schema is wiped and rebuilt from source"
# The question this answers: if ClickHouse comes back empty, does anything
# notice, and can the schema be put back from what is in the repo? Both halves
# have failed before -- readiness used to latch on its first success, so a
# service whose database vanished went on reporting ready while discarding every
# row it accepted.
ch "DROP DATABASE telemetry SYNC" >/dev/null

degraded=""
for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5500/readiness || true)
    if [ "$code" = "503" ]; then
        degraded=1
        break
    fi
    sleep 1
done
[ -n "$degraded" ] || fail "readiness stayed green after the database was dropped"

# Rebuild from the generated artifact, exactly as a restored cluster would.
docker compose exec -T clickhouse clickhouse-client --multiquery \
    < init/01-telemetry.sql || fail "could not reapply the schema from init/01-telemetry.sql"

recovered=""
for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5500/readiness || true)
    if [ "$code" = "200" ]; then
        recovered=1
        break
    fi
    sleep 1
done
[ -n "$recovered" ] || fail "readiness never recovered after the schema was reapplied"

echo "==> Case 6: ingest works again after recovery"
body=$(curl -s -X POST "$INGEST" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[{"project":"e2e","message":"after the wipe"}]}')
echo "$body" | grep -q '"accepted":1' || fail "expected accepted:1 after recovery, got $body"
sleep 3
count=$(ch "SELECT count() FROM telemetry.errors_distributed WHERE project='e2e'")
[ "$count" -ge 1 ] || fail "no rows landed after recovery, got $count"

echo "==> Case 7: read endpoints refuse an anonymous caller"
for path in /api/v1/groups /api/v1/perf /api/v1/product; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:5500$path")
    [ "$code" = "401" ] || fail "expected 401 on $path without a token, got $code"
done

echo "==> Case 8: read endpoints return the rollups to a staff caller"
# Seeded directly rather than through ingest: these are read tests, and the perf
# and product write paths are a separate change. What is under test here is the
# projection and the view behind it.
ch "INSERT INTO telemetry.perf_distributed (project, metric, value, rating, session_id)
    VALUES ('e2e','lcp',1234.5,'good','s1'), ('e2e','lcp',900,'good','s2')" >/dev/null
ch "INSERT INTO telemetry.events_distributed (project, name, session_id, user_id)
    VALUES ('e2e','signup_completed','s1','u1')" >/dev/null

body=$(read_api "/api/v1/perf?project=e2e")
echo "    perf: $body"
echo "$body" | grep -q '"metric":"lcp"' || fail "perf read missing the lcp rollup: $body"
echo "$body" | grep -q '"samples":"2"' || fail "perf read sample count wrong: $body"

body=$(read_api "/api/v1/product?project=e2e")
echo "    product: $body"
echo "$body" | grep -q '"name":"signup_completed"' || fail "product read missing the event: $body"
echo "$body" | grep -q '"events":"1"' || fail "product read count wrong: $body"

body=$(read_api "/api/v1/groups?project=e2e")
echo "$body" | grep -q '"sample_message"' || fail "groups read returned nothing: $body"

echo "==> Case 9: an unknown project reads as empty, not as an error"
body=$(read_api "/api/v1/perf?project=nope")
echo "$body" | grep -q '"perf":\[\]' || fail "expected an empty list for an unknown project: $body"

PASS=1
echo "==> PASS: ingest, schema loss -> recovery, and the staff-gated read API"
[ "$PASS" = "1" ]
