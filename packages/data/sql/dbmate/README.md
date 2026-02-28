# dbmate — Schema Migration Manager

Manages PostgreSQL schema migrations for the KBVE Supabase cluster (`supabase-cluster` in `kilobase` namespace).

## Applied Migrations

| Version | Name | Schema | Objects |
|---------|------|--------|---------|
| `20260227210000` | `mc_schema_init` | `mc` | 6 tables, 28 functions |
| `20260227215000` | `gen_ulid` | `public` | 1 function (`gen_ulid()`) |
| `20260227220000` | `meme_schema_init` | `meme` | 14 tables, 18 functions |

Migration state is tracked in `dbmate.schema_migrations` (not `public`) to isolate it from PostgREST/RPC.

## Local Testing

### Quick test (vanilla Postgres)

```bash
cp dev-docker-compose.yml docker-compose.yml
cp .env.example .env
docker compose up -d
dbmate --no-dump-schema --migrations-dir migrations up
dbmate --no-dump-schema --migrations-dir migrations rollback   # test rollback
docker compose down -v
```

### Production-replica test (CNPG image)

Use `docker-compose.yml` with the production image (`ghcr.io/kbve/postgres:17.4.1.069-kilobase`). Requires `platform: linux/amd64` on ARM Macs (Rosetta via OrbStack/Docker Desktop).

Update `.env` to point to `supabase` database:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/supabase?sslmode=disable&search_path=dbmate,public"
```

## Production Deployment

```bash
# 1. Port-forward to the CNPG primary
kubectl port-forward -n kilobase svc/supabase-cluster-rw 54322:5432

# 2. Set .env to production
#    DATABASE_URL="postgresql://postgres:postgres@localhost:54322/supabase?sslmode=disable&search_path=dbmate,public"

# 3. Check status
dbmate --no-dump-schema --migrations-dir migrations status

# 4. Apply pending migrations
dbmate --no-dump-schema --migrations-dir migrations up
```

## Creating New Migrations

```bash
dbmate new <descriptive_name>
# Creates: migrations/<timestamp>_<descriptive_name>.sql
```

Edit the generated file with `-- migrate:up` and `-- migrate:down` sections.

**Never edit an already-applied migration.** Always create a new one.

## Directory Structure

```
dbmate/
  .env.example          # Template connection string
  .gitignore            # Excludes .env, schema.sql, docker-compose.yml, init/00-supabase-schema.sql
  dev-docker-compose.yml  # Committed template (vanilla postgres:17-alpine)
  docker-compose.yml    # Local override (gitignored)
  README.md
  init/                 # Docker entrypoint scripts (run alphabetically on first start)
    00-roles.sql          # Supabase-compatible roles (service_role, anon, authenticated, etc.)
    01-auth-stub.sql      # Minimal auth.users + auth.uid() for FK references
    02-extensions-stub.sql  # extensions schema + pgcrypto for gen_ulid()
    pgsodium_getkey.sh    # Dummy key for production image testing
  migrations/
    20260227210000_mc_schema_init.sql
    20260227215000_gen_ulid.sql
    20260227220000_meme_schema_init.sql
```

## Important Notes

- `search_path=dbmate,public` in DATABASE_URL ensures `schema_migrations` lives in the `dbmate` schema, not `public`. This prevents the migration table from being exposed via PostgREST/Supabase API.
- The `gen_ulid()` function is created in `public` schema so all roles can access it regardless of their search_path.
- `init/` scripts only run on first container start (empty data volume). They provide the Supabase role/schema stubs that migrations depend on.
- The production CNPG image is x86-only; use `platform: linux/amd64` for ARM Macs.
