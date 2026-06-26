#!/usr/bin/env bash
# Integration e2e: PostgREST v14 against our custom kilobase image.
# Proves the major postgrest upgrade serves REST over kilobase 17.6:
# schema introspection, anon read, query parsing, JWT role-switch write.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.postgrest-e2e.yml"
SECRET='e2e-postgrest-kilobase-secret-32chars!!'
BASE='http://localhost:3001'

fail=0
pass() { echo "  PASS $*"; }
bad()  { echo "  FAIL $*"; fail=1; }

cleanup() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

wait_db() {
    for _ in $(seq 1 60); do
        if $COMPOSE exec -T db psql -U supabase_admin -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    return 1
}
wait_rest() {
    for _ in $(seq 1 40); do
        if curl -fsS "$BASE/" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    return 1
}

echo "== boot kilobase db =="
$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
$COMPOSE up -d db
wait_db || { echo "db never ready"; $COMPOSE logs --tail=40 db; exit 1; }

echo "== seed test schema/roles (before postgrest caches it) =="
$COMPOSE exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < setup.sql >/dev/null

echo "== boot postgrest v14 =="
$COMPOSE up -d rest
wait_rest || { echo "postgrest never ready"; $COMPOSE logs --tail=40 rest; exit 1; }

echo "== [1] postgrest serves + is v14 =="
ver=$(curl -fsS -D - "$BASE/" -o /dev/null 2>/dev/null | grep -i '^Server:' | tr -d '\r' | awk '{print $2}')
echo "    Server: $ver"
case "$ver" in postgrest/14*|PostgREST/14*) pass "v14 serving over kilobase";; *) bad "unexpected Server header: $ver";; esac

echo "== [2] schema introspection + anon read =="
rows=$(curl -fsS "$BASE/e2e_items?order=id" 2>/dev/null)
echo "    $rows"
if echo "$rows" | grep -q '"name":"alpha"' && echo "$rows" | grep -q '"name":"beta"'; then pass "anon SELECT returns seeded rows"; else bad "anon read wrong: $rows"; fi

echo "== [3] query parsing (filter) =="
one=$(curl -fsS "$BASE/e2e_items?id=eq.1&select=name" 2>/dev/null)
if [ "$one" = '[{"name":"alpha"}]' ]; then pass "filter+select works"; else bad "filter wrong: $one"; fi

echo "== [4] JWT role-switch write (service_role insert) =="
if command -v python3 >/dev/null 2>&1; then
    tok=$(python3 - "$SECRET" <<'PY'
import sys,hmac,hashlib,base64,json
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=')
secret=sys.argv[1].encode()
h=b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode())
p=b64(json.dumps({"role":"service_role"},separators=(',',':')).encode())
s=b64(hmac.new(secret,h+b'.'+p,hashlib.sha256).digest())
print((h+b'.'+p+b'.'+s).decode())
PY
)
    code=$(curl -fsS -o /dev/null -w '%{http_code}' -X POST "$BASE/e2e_items" \
        -H "Authorization: Bearer $tok" -H "Content-Type: application/json" \
        -d '{"id":3,"name":"gamma"}' 2>/dev/null || true)
    cnt=$(curl -fsS "$BASE/e2e_items?select=id" 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "$code" = "201" ] && [ "$cnt" = "3" ]; then pass "service_role JWT insert (role switch works)"; else bad "JWT insert code=$code count=$cnt"; fi
else
    echo "  SKIP JWT test (python3 absent)"
fi

echo
if [ "$fail" = "0" ]; then echo "POSTGREST E2E PASS"; else echo "POSTGREST E2E FAIL"; fi
exit "$fail"
