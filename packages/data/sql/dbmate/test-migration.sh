#!/usr/bin/env bash
#
# test-migration.sh — exercise a single dbmate migration against the
# kilobase (ghcr.io/kbve/postgres:…-kilobase) prod-replica stack, the
# same image CI uses. Looks for a companion `.test.sql` next to the
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
# Why kilobase and not dev-docker-compose.yml's postgres:17-alpine:
# init/01-supabase-runtime-stubs.sql needs the `auth` schema that only
# the supabase image creates, so the vanilla stack dies during initdb
# with `schema "auth" does not exist` and never becomes ready. Vanilla
# also lacks the role-ownership chain that store_api_owner /
# service_role privilege bugs hide behind (PR #12033 retro). smoke.sh
# moved to kilobase for those reasons; this script was left behind.
#
# The app database is `supabase`, not `postgres` — same as prod.
#
# Any migration can be targeted, not only the head: migrations newer
# than the target are rolled back first, then dbmate is pointed at a
# temp dir holding only files up to the target, so `rollback` reverts
# the target itself instead of whatever happens to be newest.
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
VERSION="${BASENAME%%_*}"

if [[ ! -f "$MIGRATION_FILE" ]]; then
    echo "migration not found: $MIGRATION_FILE" >&2
    exit 66
fi

if [[ ! -f "$TEST_FILE" ]]; then
    echo "companion test file not found: $TEST_FILE" >&2
    echo "expected sections: -- SEED, -- ASSERT_AFTER_UP, -- ASSERT_AFTER_DOWN" >&2
    exit 66
fi

for bin in dbmate psql docker; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo "$bin not on PATH — required by this harness" >&2
        exit 69
    fi
done

COMPOSE_FILE="kilobase-docker-compose.yml"
DB_NAME="supabase"
DB_USER="supabase_admin"
DB_PASS="postgres"

PSQL_URL="${PSQL_URL:-postgresql://${DB_USER}:${DB_PASS}@localhost:54322/${DB_NAME}?sslmode=disable}"

if [[ -z "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:54322/${DB_NAME}?sslmode=disable&search_path=dbmate,public"
fi
export DATABASE_URL

# Inventory down migration refuses to run unless this GUC is set on the
# session. Local test harness opts in; prod URLs never set it, so a
# stray `dbmate rollback` against prod aborts before any drop.
export PGOPTIONS="${PGOPTIONS:-} -c app.allow_destructive_inventory_down=true -c app.allow_marketplace_unsafe_down=on -c app.allow_legacy_marketplace_proxy_restore=on"

WORK_MIGRATIONS=""
cleanup() {
    if [[ -n "$WORK_MIGRATIONS" && -d "$WORK_MIGRATIONS" ]]; then
        rm -rf "$WORK_MIGRATIONS"
    fi
}
trap cleanup EXIT

bring_up_compose() {
    if docker compose -f "$COMPOSE_FILE" ps --status running --quiet postgres 2>/dev/null | grep -q .; then
        return 0
    fi
    # A stale vanilla stack from before the kilobase move squats on 54322.
    if [[ -f dev-docker-compose.yml ]]; then
        docker compose -f dev-docker-compose.yml down >/dev/null 2>&1 || true
    fi
    echo "→ starting kilobase postgres (amd64 image; first boot is slow under Rosetta)"
    docker compose -f "$COMPOSE_FILE" up -d postgres >&2
    for _ in $(seq 1 90); do
        # pg_isready flips true before supabase's bundled migrate.sh has
        # created auth.*, so gate on a real query instead.
        if PGPASSWORD="$DB_PASS" psql -h localhost -p 54322 -U "$DB_USER" -d "$DB_NAME" \
                -c 'SELECT 1 FROM auth.users LIMIT 0' >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    echo "postgres failed to become ready" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=40 >&2
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

# Empty when dbmate.schema_migrations doesn't exist yet; the `|| true`
# keeps that from tripping pipefail on a virgin database.
latest_applied() {
    psql "$PSQL_URL" -X -t -A -c \
        "SELECT COALESCE(MAX(version), '') FROM dbmate.schema_migrations" 2>/dev/null \
        | tr -d '[:space:]' || true
}

is_applied() {
    psql "$PSQL_URL" -X -t -A -c \
        "SELECT 1 FROM dbmate.schema_migrations WHERE version = '${VERSION}'" \
        2>/dev/null | grep -q '^1$'
}

# Point dbmate at a dir holding only migrations up to and including the
# target, so the target is dbmate's head and `rollback` reverts it.
stage_migrations() {
    WORK_MIGRATIONS="$(mktemp -d)"
    local f
    for f in migrations/*.sql; do
        if [[ "$(basename "$f")" > "${BASENAME}.sql" ]]; then
            continue
        fi
        cp "$f" "$WORK_MIGRATIONS/"
    done
}

dbm() {
    dbmate --no-dump-schema --migrations-dir "$WORK_MIGRATIONS" "$@"
}

bring_up_compose

# Migrations newer than the target have to come off first, or dbmate's
# rollback reverts one of them instead. Uses the full dir so their down
# sections are findable.
newest="$(latest_applied)"
while [[ -n "$newest" && "$newest" > "$VERSION" ]]; do
    echo "→ rolling back newer migration $newest (target $VERSION must be head)"
    dbmate --no-dump-schema --migrations-dir migrations rollback >/dev/null
    prev="$newest"
    newest="$(latest_applied)"
    if [[ "$newest" == "$prev" ]]; then
        echo "rollback made no progress at $newest" >&2
        exit 1
    fi
done

stage_migrations

echo "→ ensure baseline migrations applied (everything before $BASENAME)"
dbm up >/dev/null

if is_applied; then
    echo "→ migration already applied; rolling back so we can re-test"
    dbm rollback >/dev/null
fi

SEED_SQL="$(extract_section SEED)"
UP_ASSERT_SQL="$(extract_section ASSERT_AFTER_UP)"
DOWN_ASSERT_SQL="$(extract_section ASSERT_AFTER_DOWN)"

run_psql "seed" "$SEED_SQL"

echo "→ dbmate up (apply $BASENAME)"
dbm up >/dev/null

run_psql "assert_after_up" "$UP_ASSERT_SQL"

echo "→ dbmate rollback (revert $BASENAME)"
dbm rollback >/dev/null

run_psql "assert_after_down" "$DOWN_ASSERT_SQL"

echo "→ re-apply $BASENAME (leave db in up state)"
dbm up >/dev/null

# No-op when the target is the newest file; otherwise it puts back the
# migrations peeled off above (and anything the staged dir never had),
# so the harness never leaves a half-migrated database behind.
echo "→ re-apply anything newer than the target"
dbmate --no-dump-schema --migrations-dir migrations up >/dev/null

echo "✓ migration test passed: $BASENAME"
