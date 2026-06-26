#!/usr/bin/env bash
# Kilobase upgrade rehearsal helper (17.4 -> 17.6, in-house image).
#
# Collects the live CNPG kilobase facts read-only, checks a candidate local
# image against them (preload .so coverage + postgres uid/gid), dumps the real
# databases, restores into the candidate image, and runs ALTER EXTENSION UPDATE
# so the upgrade can be rehearsed against the REAL schema before prod cutover.
#
# Safety by design — it does NOT:
#   - read any Kubernetes Secret or container env var
#   - print/echo any password or connection string
#   - run pg_dumpall --globals (which would emit role password hashes)
#   - dump table DATA unless you pass --data (and then only to local disk)
#   - write anything to the production cluster
#
# Prod reads run as `postgres` over the pod's local socket (peer auth) — no
# password is supplied or seen. pg_dump takes only ACCESS SHARE locks.
#
# Subcommands:
#   collect   read-only prod facts -> $FACTS (image, uid/gid, version, preload,
#             per-db extensions+versions, replication slots)
#   verify    boot $KILOBASE_IMAGE and check it can replace prod:
#               - every shared_preload_libraries .so is present (catches e.g.
#                 pg_failover_slots, which vanilla supabase does NOT ship)
#               - postgres uid/gid matches the cluster's postgresUID/GID
#   dump      per-database schema dump of every non-template db -> $DUMPDIR
#   rehearse  restore the dumps into $KILOBASE_IMAGE + per-db ALTER EXTENSION
#             UPDATE, reporting every version delta
#   all       collect + verify + dump + rehearse
#   add --data to include table data (local only; default schema-only)
#
# Env: NS, CLUSTER, KILOBASE_IMAGE, FACTS, DUMPDIR, DBLIST(optional override)
set -euo pipefail

NS=${NS:-kilobase}
CLUSTER=${CLUSTER:-supabase-cluster}
LOCAL_IMAGE=${KILOBASE_IMAGE:-kbve/kilobase:17.6.1.136-local}
FACTS=${FACTS:-/tmp/kilobase-facts.txt}
DUMPDIR=${DUMPDIR:-/tmp/kilobase-rehearsal}
WITH_DATA=0
for a in "$@"; do [ "$a" = "--data" ] && WITH_DATA=1; done

confirm() { read -r -p "$1 [y/N] " r; [ "$r" = y ] || [ "$r" = Y ]; }

find_primary() {
    kubectl -n "$NS" get pods -l "cnpg.io/cluster=$CLUSTER,cnpg.io/instanceRole=primary" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null && return 0
    kubectl -n "$NS" get pods -l "cnpg.io/cluster=$CLUSTER,role=primary" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
}

# read-only psql in the primary pod (peer auth, no password)
pq() { kubectl -n "$NS" exec "$1" -c postgres -- psql -U postgres -d "$2" -tAc "$3" 2>/dev/null; }

list_dbs() { pq "$1" postgres "SELECT datname FROM pg_database WHERE datistemplate=false AND datallowconn ORDER BY datname;"; }

# .so libdir of a running/booted local container
libdir_in() { docker exec "$1" sh -c 'echo "$(dirname "$(dirname "$(readlink -f "$(command -v pg_config)")")")/lib"'; }

collect() {
    local pod; pod="$(find_primary)"; [ -n "$pod" ] || { echo "no primary pod"; exit 1; }
    {
        echo "# kilobase live facts ($(kubectl config current-context 2>/dev/null))"
        echo "primary_pod=$pod"
        echo "imageName=$(kubectl -n "$NS" get cluster "$CLUSTER" -o jsonpath='{.spec.imageName}')"
        echo "postgresUID=$(kubectl -n "$NS" get cluster "$CLUSTER" -o jsonpath='{.spec.postgresUID}')"
        echo "postgresGID=$(kubectl -n "$NS" get cluster "$CLUSTER" -o jsonpath='{.spec.postgresGID}')"
        echo "instances=$(kubectl -n "$NS" get cluster "$CLUSTER" -o jsonpath='{.spec.instances}')"
        echo "server_version=$(pq "$pod" postgres 'SHOW server_version;')"
        echo "shared_preload_libraries=$(pq "$pod" postgres 'SHOW shared_preload_libraries;')"
        echo "databases=$(list_dbs "$pod" | paste -sd, -)"
        for db in $(list_dbs "$pod"); do
            echo "extensions[$db]=$(pq "$pod" "$db" "SELECT string_agg(extname||' '||extversion, ',' ORDER BY extname) FROM pg_extension;")"
        done
        echo "replication_slots=$(pq "$pod" postgres "SELECT string_agg(slot_name||':'||slot_type, ',' ORDER BY slot_name) FROM pg_replication_slots;")"
    } | tee "$FACTS"
    echo ">> wrote $FACTS"
}

verify() {
    [ -f "$FACTS" ] || { echo "no facts at $FACTS — run '$0 collect' first"; exit 1; }
    local preload uid gid cid lib rc=0
    preload=$(grep '^shared_preload_libraries=' "$FACTS" | cut -d= -f2-)
    uid=$(grep '^postgresUID=' "$FACTS" | cut -d= -f2)
    gid=$(grep '^postgresGID=' "$FACTS" | cut -d= -f2)
    echo ">> booting candidate $LOCAL_IMAGE"
    cid=$(docker run -d -e POSTGRES_PASSWORD=verify "$LOCAL_IMAGE")
    trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' RETURN
    for _ in $(seq 1 40); do docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
    lib=$(libdir_in "$cid")

    echo "== [A] preload library coverage =="
    echo "$preload" | tr ',' '\n' | while read -r n; do
        n=$(echo "$n" | tr -d ' '); [ -n "$n" ] || continue
        if docker exec "$cid" sh -c "[ -e '$lib/$n.so' ]"; then echo "  ok   $n"; else echo "  MISS $n  <-- preloaded in prod, absent from image (would FATAL)"; fi
    done

    echo "== [B] postgres uid/gid vs cluster postgresUID/GID =="
    local img_uid img_gid
    img_uid=$(docker exec "$cid" id -u postgres)
    img_gid=$(docker exec "$cid" id -g postgres)
    echo "  cluster: $uid:$gid   image: $img_uid:$img_gid"
    if [ "$uid" = "$img_uid" ] && [ "$gid" = "$img_gid" ]; then
        echo "  ok   uid/gid match"
    else
        echo "  MISMATCH -> set postgresUID:$img_uid postgresGID:$img_gid in postgres-cluster.yaml AND chown the PGDATA volume $uid:$gid -> $img_uid:$img_gid at cutover"
    fi
}

dump() {
    local pod; pod="$(find_primary)"; [ -n "$pod" ] || { echo "no primary pod"; exit 1; }
    echo "primary: $pod"
    confirm "Read-only pg_dump ($([ "$WITH_DATA" = 1 ] && echo schema+DATA || echo schema-only)) of every db from PROD?" || { echo aborted; exit 0; }
    mkdir -p "$DUMPDIR"
    local args="--no-owner --no-privileges"; [ "$WITH_DATA" = 1 ] || args="$args --schema-only"
    for db in $(list_dbs "$pod"); do
        echo ">> dump $db ..."
        kubectl -n "$NS" exec "$pod" -c postgres -- pg_dump -U postgres -d "$db" $args > "$DUMPDIR/$db.sql"
        echo "   $DUMPDIR/$db.sql ($(wc -l < "$DUMPDIR/$db.sql") lines)"
    done
}

rehearse() {
    [ -d "$DUMPDIR" ] || { echo "no dumps in $DUMPDIR — run '$0 dump' first"; exit 1; }
    local cid; echo ">> booting candidate $LOCAL_IMAGE"
    cid=$(docker run -d -e POSTGRES_PASSWORD=rehearse "$LOCAL_IMAGE")
    trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' RETURN
    for _ in $(seq 1 40); do docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
    for f in "$DUMPDIR"/*.sql; do
        db=$(basename "$f" .sql)
        echo "== restore + upgrade db: $db =="
        docker exec "$cid" psql -U supabase_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
            || docker exec "$cid" createdb -U supabase_admin "$db" 2>/dev/null || true
        docker exec -i "$cid" psql -U supabase_admin -d "$db" -v ON_ERROR_STOP=0 < "$f" > "/tmp/restore-$db.log" 2>&1 || true
        echo "  restore ERRORs: $(grep -c 'ERROR:' "/tmp/restore-$db.log" 2>/dev/null || echo 0) (see /tmp/restore-$db.log)"
        echo "  versions before -> after ALTER EXTENSION UPDATE:"
        before=$(docker exec "$cid" psql -U supabase_admin -d "$db" -tAc "SELECT extname||' '||extversion FROM pg_extension ORDER BY extname;")
        docker exec "$cid" psql -U supabase_admin -d "$db" -Xq -c \
            "DO \$\$ DECLARE r record; BEGIN FOR r IN SELECT extname FROM pg_extension LOOP BEGIN EXECUTE format('ALTER EXTENSION %I UPDATE', r.extname); EXCEPTION WHEN others THEN RAISE WARNING 'skip % : %', r.extname, SQLERRM; END; END LOOP; END \$\$;" >/dev/null 2>&1 || true
        after=$(docker exec "$cid" psql -U supabase_admin -d "$db" -tAc "SELECT extname||' '||extversion FROM pg_extension ORDER BY extname;")
        diff <(echo "$before") <(echo "$after") | grep -E '^[<>]' | sed 's/^</  was/; s/^>/  now/' || echo "  (no extension version changes)"
    done
    echo ">> rehearsal complete (candidate container discarded)"
}

case "${1:-}" in
    collect)  collect ;;
    verify)   verify ;;
    dump)     dump ;;
    rehearse) rehearse ;;
    all)      collect; verify; dump; rehearse ;;
    *) echo "usage: $0 {collect|verify|dump|rehearse|all} [--data]"; exit 1 ;;
esac
