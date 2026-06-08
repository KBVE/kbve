#!/usr/bin/env bash
#
# smoke.sh — full migration-chain smoke test against the kilobase
# (ghcr.io/kbve/postgres:…-kilobase) prod-replica image.
#
# Tears down + nukes the volume, brings the stack back up fresh, waits
# for Postgres to be healthy, applies every migration in migrations/,
# prints the dbmate status, and (optionally) tears the stack back down.
#
# Vanilla postgres:17-alpine smoke was retired: it lacks the Supabase
# auth.* schema, supabase_auth_admin / authenticator / service_role
# ownership chain, the pgsodium vault, PostgREST, and every other
# Supabase-managed object. It silently passed migrations that fail in
# prod with `permission denied for table identities`-class errors.
# The kilobase image mirrors prod, so it's the only smoke that earns
# its keep.
#
# Backwards compat: any caller still passing `vanilla` is rejected
# loudly so legacy nx targets / scripts surface the change instead of
# silently running a different stack.
#
# Usage:
#   ./smoke.sh                 # full lifecycle: reset, apply, status, down
#   ./smoke.sh --keep          # leave the stack up after smoke
#   ./smoke.sh --rollback      # also exercise the down + re-apply path
#   ./smoke.sh kilobase        # explicit stack name still accepted
#   ./smoke.sh kilobase --rollback
#
# Exits non-zero on any failure (set -euo pipefail). Designed to be
# called from nx targets (see project.json: smoke / smoke-kilobase /
# smoke-kilobase-keep / smoke-kilobase-rollback).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

KEEP=false
ROLLBACK=false
for arg in "$@"; do
    case "$arg" in
        kilobase)   ;;  # accepted for backwards compat
        vanilla)
            echo "smoke.sh: vanilla stack retired — only kilobase is supported." >&2
            echo "          Prod-parity is the whole point of this script." >&2
            exit 64
            ;;
        --keep)     KEEP=true ;;
        --rollback) ROLLBACK=true ;;
        *)
            echo "smoke.sh: unknown arg: $arg" >&2
            echo "          usage: $0 [kilobase] [--keep] [--rollback]" >&2
            exit 64
            ;;
    esac
done

COMPOSE_FILE="kilobase-docker-compose.yml"
# supabase/postgres image creates the `supabase` DB inside its
# bundled migrate.sh; dbmate targets that DB. initdb auths as
# supabase_admin (see compose env).
DB_NAME="supabase"
DB_USER="supabase_admin"
DB_PASS="postgres"
STACK="kilobase"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:54322/${DB_NAME}?sslmode=disable&search_path=dbmate,public"
export DATABASE_URL

echo "==> smoke ($STACK / $COMPOSE_FILE / db=$DB_NAME user=$DB_USER)"

# Take down any pre-existing stack so the port frees up regardless of
# what was last running (incl. legacy vanilla containers from before
# the retirement).
docker compose -f kilobase-docker-compose.yml down -v >/dev/null 2>&1 || true
if [[ -f dev-docker-compose.yml ]]; then
    docker compose -f dev-docker-compose.yml down -v >/dev/null 2>&1 || true
fi

echo "==> bringing $STACK up clean (volume nuked)"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> waiting for postgres + supabase migrate.sh to settle"
ATTEMPTS=0
until PGPASSWORD="$DB_PASS" psql -h localhost -p 54322 -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1 FROM auth.users LIMIT 0' >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [[ "$ATTEMPTS" -gt 90 ]]; then
        echo "smoke.sh: postgres + supabase init did not settle within 90 attempts" >&2
        docker compose -f "$COMPOSE_FILE" logs --tail=40 >&2
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
