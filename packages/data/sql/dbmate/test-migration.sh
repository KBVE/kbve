#!/usr/bin/env bash
#
# test-migration.sh — exercise a single dbmate migration against the local
# dev-docker-compose postgres. Looks for a companion `.test.sql` next to the
# migration with three sections:
#
#   -- SEED              fixtures, runs before dbmate up
#   -- ASSERT_AFTER_UP   invariants after dbmate up
#   -- ASSERT_AFTER_DOWN invariants after dbmate rollback
#
# Asserts should be `DO $$ ... RAISE EXCEPTION 'fail: ...' ... $$;` blocks.
# psql runs with ON_ERROR_STOP=1, so a RAISE bubbles up as a non-zero exit
# and fails the run. Backfilled user data is intentionally preserved across
# rollback, so use the seeded UUIDs above to assert preservation.
#
# Usage:
#   test-migration.sh <migration_basename_or_path>
#
# Examples:
#   test-migration.sh 20260513114428_wallet_auth_user_trigger
#   test-migration.sh migrations/20260513114428_wallet_auth_user_trigger.sql

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

ARG="${1:-}"
if [[ -z "$ARG" ]]; then
    echo "usage: $0 <migration_basename_or_path>" >&2
    exit 64
fi

BASENAME="$(basename "$ARG" .sql)"
MIGRATION_FILE="migrations/${BASENAME}.sql"
TEST_FILE="migration-tests/${BASENAME}.test.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
    echo "migration not found: $MIGRATION_FILE" >&2
    exit 66
fi

if [[ ! -f "$TEST_FILE" ]]; then
    echo "companion test file not found: $TEST_FILE" >&2
    echo "expected sections: -- SEED, -- ASSERT_AFTER_UP, -- ASSERT_AFTER_DOWN" >&2
    exit 66
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres?sslmode=disable&search_path=dbmate,public"
fi
export DATABASE_URL

# Inventory down migration refuses to run unless this GUC is set on the
# session. Local test harness opts in; prod URLs never set it, so a
# stray `dbmate rollback` against prod aborts before any drop.
export PGOPTIONS="${PGOPTIONS:-} -c app.allow_destructive_inventory_down=true -c app.allow_marketplace_unsafe_down=on"

PSQL_URL="postgresql://postgres:postgres@localhost:54322/postgres?sslmode=disable"

bring_up_compose() {
    if docker compose -f dev-docker-compose.yml ps --status running --quiet postgres 2>/dev/null | grep -q .; then
        return 0
    fi
    echo "→ starting dev-docker-compose postgres"
    docker compose -f dev-docker-compose.yml up -d postgres >&2
    for _ in $(seq 1 30); do
        if docker compose -f dev-docker-compose.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    echo "postgres failed to become ready" >&2
    return 1
}

extract_section() {
    local section="$1"
    awk -v marker="-- $section" '
        $0 ~ "^-- (SEED|ASSERT_AFTER_UP|ASSERT_AFTER_DOWN) *$" {
            active = ($0 ~ "^"marker" *$") ? 1 : 0
            next
        }
        active { print }
    ' "$TEST_FILE"
}

run_psql() {
    local label="$1"
    local sql="$2"
    if [[ -z "$(printf '%s' "$sql" | tr -d '[:space:]')" ]]; then
        echo "  (no $label statements; skipping)"
        return 0
    fi
    echo "→ $label"
    printf '%s\n' "$sql" | psql "$PSQL_URL" -v ON_ERROR_STOP=1 -X -q
}

is_applied() {
    psql "$PSQL_URL" -X -t -A -c \
        "SELECT 1 FROM dbmate.schema_migrations WHERE version = '${BASENAME%%_*}'" \
        2>/dev/null | grep -q '^1$'
}

bring_up_compose

echo "→ ensure baseline migrations applied (everything before $BASENAME)"
dbmate --no-dump-schema --migrations-dir migrations up >/dev/null

if is_applied; then
    echo "→ migration already applied; rolling back so we can re-test"
    dbmate --no-dump-schema --migrations-dir migrations rollback >/dev/null
fi

SEED_SQL="$(extract_section SEED)"
UP_ASSERT_SQL="$(extract_section ASSERT_AFTER_UP)"
DOWN_ASSERT_SQL="$(extract_section ASSERT_AFTER_DOWN)"

run_psql "seed" "$SEED_SQL"

echo "→ dbmate up (apply $BASENAME)"
dbmate --no-dump-schema --migrations-dir migrations up >/dev/null

run_psql "assert_after_up" "$UP_ASSERT_SQL"

echo "→ dbmate rollback (revert $BASENAME)"
dbmate --no-dump-schema --migrations-dir migrations rollback >/dev/null

run_psql "assert_after_down" "$DOWN_ASSERT_SQL"

echo "→ re-apply $BASENAME (leave db in up state)"
dbmate --no-dump-schema --migrations-dir migrations up >/dev/null

echo "✓ migration test passed: $BASENAME"
