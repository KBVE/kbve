#!/usr/bin/env bash
# Kilobase upgrade rehearsal helper.
#
# Pulls a logical schema dump from the live CNPG kilobase cluster, restores it
# into a local kilobase 17.6 container, and runs the extension UPDATE path so
# you can rehearse the 17.4 -> 17.6 upgrade against the REAL schema before
# touching prod.
#
# Safety by design — it does NOT:
#   - read any Kubernetes Secret or container env var
#   - print/echo any password or connection string
#   - run pg_dumpall --globals (which would emit role password hashes)
#   - dump table DATA unless you pass --data (and then only to your local disk)
#   - write anything to the production cluster
#
# How the prod read is safe: pg_dump runs INSIDE the primary pod over the local
# unix socket as the `postgres` superuser (peer auth) — no password is supplied
# or seen by this script. pg_dump takes only ACCESS SHARE locks (read-only).
#
# Usage:
#   upgrade_rehearsal.sh dump        # read-only schema dump from prod -> $DUMP_FILE
#   upgrade_rehearsal.sh rehearse    # restore $DUMP_FILE into local 17.6 + ALTER EXTENSION UPDATE
#   upgrade_rehearsal.sh all         # dump then rehearse
#   add --data to include table data (local only); default is schema-only
#
# Env: NS, CLUSTER, KILOBASE_IMAGE, DUMP_FILE, DBNAME
set -euo pipefail

NS=${NS:-kilobase}
CLUSTER=${CLUSTER:-supabase-cluster}
LOCAL_IMAGE=${KILOBASE_IMAGE:-kbve/kilobase:17.6.1.136-local}
DUMP=${DUMP_FILE:-/tmp/kilobase-rehearsal-schema.sql}
DBNAME=${DBNAME:-postgres}
WITH_DATA=0

for a in "$@"; do [ "$a" = "--data" ] && WITH_DATA=1; done

confirm() { read -r -p "$1 [y/N] " r; [ "$r" = y ] || [ "$r" = Y ]; }

find_primary() {
    kubectl -n "$NS" get pods -l "cnpg.io/cluster=$CLUSTER,cnpg.io/instanceRole=primary" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null && return 0
    kubectl -n "$NS" get pods -l "cnpg.io/cluster=$CLUSTER,role=primary" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
}

dump_from_prod() {
    local pod="$1" args="--no-owner --no-privileges"
    [ "$WITH_DATA" = 1 ] || args="$args --schema-only"
    echo ">> pg_dump ($([ "$WITH_DATA" = 1 ] && echo 'schema+DATA' || echo 'schema-only')) inside $pod (local socket, no password) ..."
    kubectl -n "$NS" exec "$pod" -c postgres -- pg_dump -U postgres -d "$DBNAME" $args > "$DUMP"
    echo ">> wrote $DUMP ($(wc -l < "$DUMP") lines)"
}

rehearse_local() {
    [ -f "$DUMP" ] || { echo "no dump at $DUMP — run '$0 dump' first"; exit 1; }
    local cid
    echo ">> booting local kilobase: $LOCAL_IMAGE"
    cid=$(docker run -d -e POSTGRES_PASSWORD=rehearse "$LOCAL_IMAGE")
    trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' RETURN
    for _ in $(seq 1 40); do docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done

    echo ">> restoring prod schema into fresh 17.6 (errors are surfaced, not fatal) ..."
    docker exec -i "$cid" psql -U supabase_admin -d "$DBNAME" -v ON_ERROR_STOP=0 < "$DUMP" \
        > /tmp/kilobase-restore.log 2>&1 || true
    echo "   restore ERRORs (first 25):"
    grep -iE "ERROR:" /tmp/kilobase-restore.log | head -25 || echo "   none"

    echo ">> extension versions BEFORE update:"
    docker exec "$cid" psql -U supabase_admin -d "$DBNAME" -tAc \
        "SELECT extname||' '||extversion FROM pg_extension ORDER BY extname;"

    echo ">> ALTER EXTENSION ... UPDATE for every installed extension:"
    docker exec "$cid" psql -U supabase_admin -d "$DBNAME" -Xq -c \
        "DO \$\$ DECLARE r record; BEGIN FOR r IN SELECT extname FROM pg_extension LOOP BEGIN EXECUTE format('ALTER EXTENSION %I UPDATE', r.extname); RAISE NOTICE 'updated %', r.extname; EXCEPTION WHEN others THEN RAISE WARNING 'skip % : %', r.extname, SQLERRM; END; END LOOP; END \$\$;"

    echo ">> extension versions AFTER update:"
    docker exec "$cid" psql -U supabase_admin -d "$DBNAME" -tAc \
        "SELECT extname||' '||extversion FROM pg_extension ORDER BY extname;"
    echo ">> rehearsal complete (local container discarded)"
}

case "${1:-}" in
    dump)
        pod="$(find_primary)"; [ -n "$pod" ] || { echo "no primary pod in ns $NS for cluster $CLUSTER"; exit 1; }
        echo "primary: $pod  (ns $NS, cluster $CLUSTER)"
        confirm "Read-only schema pg_dump from the PROD primary above?" || { echo "aborted"; exit 0; }
        dump_from_prod "$pod"
        ;;
    rehearse) rehearse_local ;;
    all)
        pod="$(find_primary)"; [ -n "$pod" ] || { echo "no primary pod in ns $NS for cluster $CLUSTER"; exit 1; }
        echo "primary: $pod  (ns $NS, cluster $CLUSTER)"
        confirm "Read-only pg_dump from the PROD primary above, then rehearse locally?" || { echo "aborted"; exit 0; }
        dump_from_prod "$pod"; rehearse_local
        ;;
    *) echo "usage: $0 {dump|rehearse|all} [--data]"; exit 1 ;;
esac
