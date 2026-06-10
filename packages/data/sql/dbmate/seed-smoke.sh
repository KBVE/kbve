#!/usr/bin/env bash
#
# seed-smoke.sh — smoke-test the OWS seed scripts (schema/ows/seed/*.sql)
# against the kilobase prod-replica stack.
#
# The seeds are parameterized, secret-derived, gameops-run scripts — NOT
# dbmate migrations — so the migration smoke (smoke.sh) does not cover
# them. This runner brings up the kilobase stack + full migration chain
# (via smoke.sh --keep), then applies each seed under `SET ROLE ows`
# (real FORCE-RLS context) with dummy params, asserting:
#   - the seed applies without error (catches psql :'var'-in-DO-block and
#     quoting bugs that only surface at run time), and
#   - insert seeds are idempotent (re-run leaves exactly one customer row).
#
# Usage:
#   ./seed-smoke.sh            # reset stack, apply migrations + seeds, assert, down
#   ./seed-smoke.sh --keep     # leave the stack up afterward

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

KEEP=false
[[ "${1:-}" == "--keep" ]] && KEEP=true

SEED_DIR="$(cd ../schema/ows/seed && pwd)"
DB_USER="supabase_admin"
DB_PASS="postgres"
PORT=54322
DB_NAME="supabase"

# Dummy, obviously-fake test GUIDs (valid hex) — never real tenant values.
CG_CHUCK="0000c0c0-0000-0000-0000-000000000001"
CG_TENANT="0000c0c0-0000-0000-0000-000000000002"
LAUNCHER="0000c0c0-0000-0000-0000-0000000000aa"

run_psql() { PGPASSWORD="$DB_PASS" psql -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 "$@"; }

# Apply a seed file as the `ows` role (RLS enforced), passing -v params.
seed_as_ows() {
    local file="$1"; shift
    local wrapper; wrapper="$(mktemp)"
    printf 'SET ROLE ows;\n\\i %s\n' "$file" > "$wrapper"
    run_psql "$@" -f "$wrapper"
    rm -f "$wrapper"
}

count_customers() {
    PGPASSWORD="$DB_PASS" psql -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
        "SELECT count(*) FROM ows.Customers WHERE CustomerGUID = '$1'::uuid;"
}

echo "==> bringing up kilobase + migration chain (smoke.sh --keep)"
./smoke.sh kilobase --keep

FAIL=0
assert_one() { # label guid
    local n; n="$(count_customers "$2")"
    if [[ "$n" == "1" ]]; then echo "    PASS: $1 → 1 customer row"; else echo "    FAIL: $1 → expected 1 customer, got $n"; FAIL=1; fi
}

echo "==> seed: chuck_init.sql (apply x2, idempotent)"
seed_as_ows "$SEED_DIR/chuck_init.sql" -v customer_guid="$CG_CHUCK" -v server_ip="game.test" -v launcher_guid="$LAUNCHER"
seed_as_ows "$SEED_DIR/chuck_init.sql" -v customer_guid="$CG_CHUCK" -v server_ip="game.test" -v launcher_guid="$LAUNCHER"
assert_one "chuck_init" "$CG_CHUCK"

echo "==> seed: tenants_init.sql (apply x2, idempotent)"
seed_as_ows "$SEED_DIR/tenants_init.sql" -v customer_guid="$CG_TENANT" -v customer_name="Smoke Tenant" -v customer_email="smoke@test" -v map_name="Lvl_Smoke" -v zone_name="SmokeZone"
seed_as_ows "$SEED_DIR/tenants_init.sql" -v customer_guid="$CG_TENANT" -v customer_name="Smoke Tenant" -v customer_email="smoke@test" -v map_name="Lvl_Smoke" -v zone_name="SmokeZone"
assert_one "tenants_init" "$CG_TENANT"

echo "==> seed: chuck_maintenance.sql (runs clean against seeded customer)"
seed_as_ows "$SEED_DIR/chuck_maintenance.sql" -v customer_guid="$CG_CHUCK" -v launcher_guid="$LAUNCHER" >/dev/null
echo "    PASS: chuck_maintenance applied"

if [[ "$KEEP" == "true" ]]; then
    echo "==> seed smoke complete; stack left up on localhost:$PORT (db=$DB_NAME)"
else
    echo "==> tearing down"
    docker compose -f kilobase-docker-compose.yml down -v >/dev/null 2>&1
fi

if [[ "$FAIL" -ne 0 ]]; then echo "==> SEED SMOKE FAILED"; exit 1; fi
echo "==> seed smoke passed"
