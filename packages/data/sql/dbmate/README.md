# dbmate — Schema Migration Manager

Manages PostgreSQL schema migrations for the KBVE Supabase cluster (`supabase-cluster` in `kilobase` namespace).

## Applied Migrations

| Version | Name | Schema | Objects |
|---------|------|--------|---------|
| `20260227210000` | `mc_schema_init` | `mc` | 6 tables, 28 functions |
| `20260227215000` | `gen_ulid` | `public` | 1 function (`gen_ulid()`) |
| `20260227220000` | `meme_schema_init` | `meme` | 14 tables, 18 functions |
| `20260228000000` | `discordsh_schema_init` | `discordsh` | 2 tables, 13 functions |
| `20260228210000` | `meme_rpcs` | `meme` | +7 service RPC functions |
| `20260228220000` | `osrs_schema_init` | `osrs` | 9 tables, 11 functions |
| `20260228230000` | `discordsh_update_server` | `discordsh` | +2 functions, removes direct UPDATE |
| `20260301210000` | `meme_rpcs_v2` | `meme` | +12 service RPC functions |
| `20260302000000` | `discordsh_guild_vault` | `discordsh` | 1 table, 7 functions (guild token vault) |

Migration state is tracked in `dbmate.schema_migrations` (not `public`) to isolate it from PostgREST/RPC.

## Schema Overview

### `mc` — Minecraft server player data

6 tables (`auth`, `player`, `container`, `transfer`, `character`, `skill`), 28 functions. Manages player authentication, inventory, transfers, and character stats for the Pumpkin MC server plugin.

- **Source**: `../schema/mc/`
- **Access**: service_role only (all writes via plugin's Supabase service client)

### `meme` — Meme platform

14 tables covering memes, user profiles, reactions, saves, comments, follows, reports, collections, templates, card battler system. 37 functions total (18 trigger/core + 7 v1 RPCs + 12 v2 RPCs).

- **Source**: `../schema/meme/`
- **Access**: service_role only for all RPC functions; tables have RLS with per-role SELECT policies

### `discordsh` — Discord server directory

3 tables (`servers`, `votes`, `guild_tokens`), 22 functions. Server listing directory with voting, categorization, moderation, and per-guild encrypted token vault.

- **Source**: `../schema/discordsh/` + `../schema/vault/guild_tokens.sql`
- **Access**: anon/authenticated can SELECT active servers; all writes gated through proxy functions (`proxy_submit_server`, `proxy_update_server`, `proxy_cast_vote`). Guild vault is service_role only — no proxy functions, accessed via edge functions.
- **Rate limits**: 5 pending submissions per user, 12h per-server vote cooldown, 50 votes/day global cap, 10 tokens per guild
- **Validation**: `is_safe_text()`, `is_safe_url()`, `are_valid_tags()`, `are_valid_categories()` — blocks control chars, zero-width/bidi abuse, whitespace-only text
- **Guild vault**: `guild_tokens` stores FK pointers to `vault.secrets`. Tokens encrypted via Supabase Vault, decrypted values only accessible to service_role. Ownership verified against `servers.owner_id`.

### `osrs` — Old School RuneScape item database

9 tables (`items`, `equipment`, `bonuses`, `requirements`, `drop_sources`, `recipes`, `recipe_materials`, `prices`, `price_latest`), 11 functions (7 trigger, 4 service). Complete item catalog with equipment stats, drop tables, recipes, and GE price tracking.

- **Source**: `../schema/osrs/`
- **Access**: service_role only (data ingestion from OSRS APIs)
- **Extensions**: `pg_trgm` for fuzzy item name search via `service_search_items()`

### `public` — Shared utilities

`gen_ulid()` function for ULID primary key generation. Available to all roles.

## Security Model

All schemas follow the **belt-and-suspenders** pattern:

1. **Schema isolation**: `REVOKE ALL ON SCHEMA ... FROM PUBLIC, anon, authenticated`
2. **RLS on every table**: `service_role_full_access` policy, restrictive policies for other roles
3. **Function lockdown**: Every function gets `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` + `OWNER TO service_role`
4. **SECURITY DEFINER + SET search_path = ''**: On all service/proxy functions and sensitive triggers
5. **Service/proxy pattern**: `service_*` functions take explicit `user_id` (service_role only); `proxy_*` functions derive identity from `auth.uid()` (authenticated users)
6. **ALTER DEFAULT PRIVILEGES**: Both `IN SCHEMA` and `FOR ROLE postgres IN SCHEMA` variants ensure future objects get correct grants
7. **Verification DO blocks**: Each migration validates function existence, privilege grants, ownership, and negative checks (anon must NOT have EXECUTE)

## Source-of-Truth Files

Canonical SQL lives in `../schema/<app>/`. Migrations capture deltas. When modifying a schema, update the source file first, then create a new migration with the changes.

```
schema/
  mc/                    # Minecraft server plugin
    mc.sql                 # Combined schema (all tables + functions)
    mc_auth.sql            # Auth table only
    mc_player.sql          # Player table only
    mc_container.sql       # Container table only
    mc_transfer.sql        # Transfer table only
    mc_character.sql       # Character table only
    mc_skill.sql           # Skill table only
  meme/                  # Meme platform
    meme_core.sql          # Core tables (memes, user_profiles)
    meme_engagement.sql    # Reactions, saves, collections
    meme_social.sql        # Comments, follows
    meme_moderation.sql    # Reports
    meme_cards.sql         # Card battler system
    meme_rpcs.sql          # All service RPC functions
  discordsh/             # Discord server directory
    discordsh_servers.sql  # Schema, servers table, submit + update functions
    discordsh_votes.sql    # Votes table, cast_vote functions
  vault/                 # Vault token storage
    api_tokens.sql         # User-scoped API token vault (private.api_tokens)
    service_proxy.sql      # Service-role wrappers for user tokens
    guild_tokens.sql       # Guild-scoped token vault (discordsh.guild_tokens)
  osrs/                  # OSRS item database
    osrs_core.sql          # 9 tables, triggers, RLS
    osrs_rpcs.sql          # 4 service functions
```

## Local Testing

### Quick test (vanilla Postgres)

```bash
cp dev-docker-compose.yml docker-compose.yml
docker compose up -d
dbmate --no-dump-schema --migrations-dir migrations up       # apply all
dbmate --no-dump-schema --migrations-dir migrations rollback  # test rollback
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
kubectl port-forward -n kilobase pod/supabase-cluster-2 54322:5432

# 2. Apply pending migrations (use production DATABASE_URL)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/supabase?sslmode=disable&search_path=dbmate,public" \
  dbmate --no-dump-schema --migrations-dir migrations up

# 3. Verify
psql "postgresql://postgres:postgres@127.0.0.1:54322/supabase" -c "\dt mc.*; \dt meme.*; \dt discordsh.*; \dt osrs.*"
```

**Tip**: The port-forward can be flaky — if `dbmate status` fails with "connection refused", kill the port-forward (`kill $(lsof -ti:54322)`) and restart it. Avoid making test psql queries before running dbmate, as the port-forward may drop after the first connection.

## Creating New Migrations

```bash
dbmate new <descriptive_name>
# Creates: migrations/<timestamp>_<descriptive_name>.sql
```

Edit the generated file with `-- migrate:up` and `-- migrate:down` sections.

**Never edit an already-applied migration.** Always create a new one. Since all functions use `CREATE OR REPLACE`, a new migration can safely redefine any existing function.

### Migration template

```sql
-- migrate:up

-- ============================================================
-- <SCHEMA> — <description>
--
-- Source of truth: packages/data/sql/schema/<app>/<file>.sql
-- Depends on: <previous_migration_timestamp>
-- ============================================================

CREATE OR REPLACE FUNCTION <schema>.<function_name>(...)
RETURNS ... LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN ... END; $$;

REVOKE ALL ON FUNCTION <schema>.<function_name>(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION <schema>.<function_name>(...) TO service_role;
ALTER FUNCTION <schema>.<function_name>(...) OWNER TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS <schema>.<function_name>(...);
```

## Directory Structure

```
dbmate/
  .env                    # Connection string (gitignored)
  .gitignore              # Excludes .env, docker-compose.yml, schema dump artifacts
  dev-docker-compose.yml  # Committed template (vanilla postgres:17-alpine)
  docker-compose.yml      # Local override (gitignored)
  README.md
  init/                   # Docker entrypoint scripts (run alphabetically on first start)
    00-roles.sql            # Supabase-compatible roles (service_role, anon, authenticated, etc.)
    01-auth-stub.sql        # Minimal auth.users + auth.uid() + auth.jwt() + auth.role()
    02-extensions-stub.sql  # extensions schema + pgcrypto + vault schema stub
    pgsodium_getkey.sh      # Dummy key for production image testing
  migrations/
    20260227210000_mc_schema_init.sql
    20260227215000_gen_ulid.sql
    20260227220000_meme_schema_init.sql
    20260228000000_discordsh_schema_init.sql
    20260228210000_meme_rpcs.sql
    20260228220000_osrs_schema_init.sql
    20260228230000_discordsh_update_server.sql
    20260301210000_meme_rpcs_v2.sql
    20260302000000_discordsh_guild_vault.sql
```

## Important Notes

- **search_path=dbmate,public** in DATABASE_URL: `dbmate` ensures `schema_migrations` is created in the `dbmate` schema only (isolated from PostgREST/Supabase API). `public` is a lookup fallback so migrations can resolve references like `gen_ulid()` — nothing is stored in `public` by dbmate itself.
- **gen_ulid()** is in `public` schema so all roles can access it regardless of search_path.
- **init/ scripts** only run on first container start (empty data volume). They provide Supabase role/schema stubs that migrations depend on.
- **CNPG image** is x86-only; use `platform: linux/amd64` for ARM Macs.
- **Port-forward target**: Use `pod/supabase-cluster-2` (the primary) directly instead of `svc/supabase-cluster-rw` for more stable connections.
- **pg_trgm**: Required by the OSRS schema. The migration creates it automatically via `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
