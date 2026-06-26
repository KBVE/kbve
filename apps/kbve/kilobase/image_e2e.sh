#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.e2e.yml"
SVC=kilobase-e2e
DB=postgres
ADMIN=supabase_admin
WORKER='Smart Matview Refresher'
PARITY_EXTS="pgsodium supabase_vault wrappers pg_graphql pg_cron pg_net pgaudit pg_stat_statements vector postgis pgmq pg_tle"

fail=0
pass() { echo "  PASS $*"; }
bad()  { echo "  FAIL $*"; fail=1; }
sql()  { $COMPOSE exec -T "$SVC" psql -U "$ADMIN" -d "$DB" -tAc "$1"; }

cleanup() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Gate on a real admin connection: supabase runs a temp init server (roles +
# migrations) then bounces to the real one, so pg_isready alone races.
wait_db() {
    for _ in $(seq 1 60); do
        if $COMPOSE exec -T "$SVC" psql -U "$ADMIN" -d "$DB" -tAc "SELECT 1" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    return 1
}

echo "== build + boot =="
$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
$COMPOSE up -d --build

echo "== wait for ready =="
wait_db || { echo "server never ready"; $COMPOSE logs --tail=40 "$SVC"; exit 1; }

echo "== [1] kilobase preloaded =="
if sql "SHOW shared_preload_libraries;" | grep -q kilobase; then pass "shared_preload_libraries has kilobase"; else bad "kilobase not preloaded"; fi

echo "== [2] CREATE EXTENSION kilobase =="
if sql "CREATE EXTENSION IF NOT EXISTS kilobase;" >/dev/null && [ "$(sql "SELECT 1 FROM pg_extension WHERE extname='kilobase';")" = "1" ]; then
    pass "extension installed"
else
    bad "CREATE EXTENSION kilobase failed"
fi

echo "== restart so the worker boots with its schema present (models prod) =="
$COMPOSE restart "$SVC" >/dev/null 2>&1
wait_db || { echo "server never ready after restart"; exit 1; }

echo "== [3] C function runtime load =="
if sql "SELECT kilobase_health_check();" >/dev/null 2>&1; then pass "kilobase_health_check() callable"; else bad "health_check call failed (.so load)"; fi

echo "== [4] background worker alive (LISTEN-crash regression guard) =="
sleep 6
n1=$(sql "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '$WORKER';")
sleep 8
n2=$(sql "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '$WORKER';")
if [ "$n1" = "1" ] && [ "$n2" = "1" ]; then
    pass "worker running and stable (no exit-1 crash loop)"
else
    bad "worker not stable (count $n1 -> $n2); check for 'cannot execute LISTEN'"
    $COMPOSE logs "$SVC" 2>&1 | grep -iE "matview|listen|exit code" | tail -10 || true
fi

echo "== [5] supabase extension parity =="
for e in $PARITY_EXTS; do
    if [ "$(sql "SELECT 1 FROM pg_available_extensions WHERE name='$e';")" = "1" ]; then
        pass "available: $e"
    else
        bad "missing extension: $e"
    fi
done

echo
if [ "$fail" = "0" ]; then echo "E2E PASS"; else echo "E2E FAIL"; fi
exit "$fail"
