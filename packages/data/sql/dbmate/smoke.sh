#!/usr/bin/env bash
#
# smoke.sh — full migration-chain smoke test against a chosen compose stack.
#
# Tears down + nukes the volume, brings the stack back up fresh, waits for
# Postgres to be healthy, applies every migration in migrations/, prints
# the dbmate status, and (optionally) tears the stack back down again.
#
# Two stacks supported:
#   vanilla   → dev-docker-compose.yml          (postgres:17-alpine)
#   kilobase  → kilobase-docker-compose.yml     (ghcr.io/kbve/postgres:...-kilobase, prod-replica)
#
# Usage:
#   ./smoke.sh vanilla              # full lifecycle: reset, apply, status, down
#   ./smoke.sh vanilla --keep       # leave the stack up after smoke
#   ./smoke.sh kilobase --keep      # same, against the kilobase image
#   ./smoke.sh kilobase --rollback  # also exercise the down migration of the latest file
#
# Exits non-zero on any failure (set -euo pipefail). Designed to be called
# from nx targets (see project.json: smoke-vanilla / smoke-kilobase / smoke).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

STACK="${1:-}"
shift || true

KEEP=false
ROLLBACK=false
for arg in "$@"; do
    case "$arg" in
        --keep)     KEEP=true ;;
        --rollback) ROLLBACK=true ;;
        *)
            echo "smoke.sh: unknown flag: $arg" >&2
            exit 64
            ;;
    esac
done

case "$STACK" in
    vanilla)
        COMPOSE_FILE="dev-docker-compose.yml"
        DB_NAME="postgres"
        ;;
    kilobase)
        COMPOSE_FILE="kilobase-docker-compose.yml"
        DB_NAME="supabase"
        ;;
    "")
        echo "usage: $0 <vanilla|kilobase> [--keep] [--rollback]" >&2
        exit 64
        ;;
    *)
        echo "smoke.sh: unknown stack: $STACK (expected: vanilla, kilobase)" >&2
        exit 64
        ;;
esac

DATABASE_URL="postgresql://postgres:postgres@localhost:54322/${DB_NAME}?sslmode=disable&search_path=dbmate,public"
export DATABASE_URL

echo "==> smoke ($STACK / $COMPOSE_FILE / db=$DB_NAME)"

# Take down any pre-existing stack (vanilla or kilobase) so the port frees up
# regardless of which one was last run.
docker compose -f dev-docker-compose.yml      down -v >/dev/null 2>&1 || true
docker compose -f kilobase-docker-compose.yml down -v >/dev/null 2>&1 || true

echo "==> bringing $STACK up clean (volume nuked)"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> waiting for postgres to accept connections"
ATTEMPTS=0
until PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [[ "$ATTEMPTS" -gt 60 ]]; then
        echo "smoke.sh: postgres did not become ready within 60 attempts" >&2
        docker compose -f "$COMPOSE_FILE" logs --tail=30 >&2
        exit 1
    fi
    sleep 2
done
echo "    ready after $ATTEMPTS attempts"

echo "==> applying all migrations"
dbmate --no-dump-schema --migrations-dir migrations up

echo "==> migration status"
dbmate --no-dump-schema --migrations-dir migrations status | tail -5

if [[ "$ROLLBACK" == "true" ]]; then
    echo "==> rolling back latest migration"
    dbmate --no-dump-schema --migrations-dir migrations rollback
    echo "==> re-applying after rollback"
    dbmate --no-dump-schema --migrations-dir migrations up
fi

if [[ "$KEEP" == "true" ]]; then
    echo "==> smoke complete ($STACK); stack left running on localhost:54322 (db=$DB_NAME)"
else
    echo "==> tearing down $STACK"
    docker compose -f "$COMPOSE_FILE" down -v
    echo "==> smoke complete ($STACK)"
fi
