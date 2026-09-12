#!/usr/bin/env bash
# End-to-end test: boots real ClickHouse + the metrics binary, drives the public
# ingest endpoint, and asserts rows land in CH correctly sanitized.
#
# Usage: services/metrics/e2e/run.sh
# Requires: docker compose, curl.
set -euo pipefail

cd "$(dirname "$0")"

INGEST="http://localhost:5500/api/v1/ingest/errors"
INGEST_PERF="http://localhost:5500/api/v1/ingest/perf"
INGEST_EVENTS="http://localhost:5500/api/v1/ingest/events"
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

echo "==> Case 4: perf ingest lands a normalized Web Vitals sample"
body=$(curl -s -X POST "$INGEST_PERF" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[
          {"project":"e2e","metric":"  LCP ","value":1234.5,"rating":"GOOD",
           "navigation_type":"teleport","url":"https://example.com/p?secret=1",
           "session_id":"s1"},
          {"project":"e2e","metric":"made_up","value":1},
          {"project":"e2e","metric":"lcp","value":-1}
        ]}')
echo "    response: $body"
# Two of the three are unusable: an unknown metric would poison a quantile, and
# a negative duration is not a measurement. Both are dropped, not rejected.
echo "$body" | grep -q '"accepted":1' || fail "expected accepted:1 for perf, got $body"
echo "$body" | grep -q '"dropped":2' || fail "expected dropped:2 for perf, got $body"

echo "==> Case 5: product ingest lands a normalized named event"
body=$(curl -s -X POST "$INGEST_EVENTS" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[{"project":"e2e","name":"  Signup_Completed ","session_id":"s1",
                    "url":"https://example.com/join?ref=x"}]}')
echo "    response: $body"
echo "$body" | grep -q '"accepted":1' || fail "expected accepted:1 for product, got $body"

sleep 3

metric=$(ch "SELECT metric FROM telemetry.perf_distributed WHERE project='e2e' LIMIT 1")
[ "$metric" = "lcp" ] || fail "perf metric not normalized (got '$metric')"
rating=$(ch "SELECT rating FROM telemetry.perf_distributed WHERE project='e2e' LIMIT 1")
[ "$rating" = "good" ] || fail "perf rating not normalized (got '$rating')"
nav=$(ch "SELECT navigation_type FROM telemetry.perf_distributed WHERE project='e2e' LIMIT 1")
[ -z "$nav" ] || fail "unknown navigation_type should be left blank (got '$nav')"
purl=$(ch "SELECT url FROM telemetry.perf_distributed WHERE project='e2e' LIMIT 1")
[ "$purl" = "https://example.com/p" ] || fail "perf url query not stripped (got '$purl')"

name=$(ch "SELECT name FROM telemetry.events_distributed WHERE project='e2e' LIMIT 1")
[ "$name" = "signup_completed" ] || fail "product name not normalized (got '$name')"

# The rollup views are what the dashboard reads; a view that does not survive
# contact with real rows is a dashboard that 502s.
# round(x, 1) rather than round(x): ClickHouse rounds halves to even, so the
# single sample of 1234.5 comes back as 1234 and the assertion reads as a bug in
# the view rather than in the expectation.
p75=$(ch "SELECT round(p75, 1) FROM telemetry.perf_summary WHERE project='e2e' AND metric='lcp'")
[ "$p75" = "1234.5" ] || fail "perf_summary p75 wrong (got '$p75')"
evcount=$(ch "SELECT events FROM telemetry.event_counts WHERE project='e2e' AND name='signup_completed'")
[ "$evcount" = "1" ] || fail "event_counts wrong (got '$evcount')"

echo "==> Case 6: every table and view the schema source defines exists"
# The DDL is generated from packages/data/ch/schemas/telemetry.sql into both the
# production setup job and init/01-telemetry.sql. Asserting the object list here
# is what makes the generated init a real check on the source rather than a copy
# that happens to be applied.
for obj in errors_distributed perf_distributed events_distributed \
    error_groups perf_summary event_counts; do
    found=$(ch "SELECT count() FROM system.tables WHERE database='telemetry' AND name='$obj'")
    [ "$found" = "1" ] || fail "telemetry.$obj missing from the applied schema"
done

echo "==> Case 7: recovery drill -- the schema is wiped and rebuilt from source"
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

echo "==> Case 8: ingest works again after recovery"
body=$(curl -s -X POST "$INGEST" \
    -H 'content-type: application/json' \
    -H "x-kbve-ingest: $TOKEN" \
    -d '{"events":[{"project":"e2e","message":"after the wipe"}]}')
echo "$body" | grep -q '"accepted":1' || fail "expected accepted:1 after recovery, got $body"
sleep 3
count=$(ch "SELECT count() FROM telemetry.errors_distributed WHERE project='e2e'")
[ "$count" -ge 1 ] || fail "no rows landed after recovery, got $count"

PASS=1
echo "==> PASS: three lenses ingested and rolled up, and full schema loss -> recovery"
[ "$PASS" = "1" ]
