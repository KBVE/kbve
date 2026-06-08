# dbmate — Schema Migration Manager

Manages PostgreSQL schema migrations for the KBVE Supabase cluster (`supabase-cluster` in `kilobase` namespace).

## Applied Migrations

| Version          | Name                                        | Schema      | Objects                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260227210000` | `mc_schema_init`                            | `mc`        | 6 tables, 28 functions                                                                                                                                                                                                          |
| `20260227215000` | `gen_ulid`                                  | `public`    | 1 function (`gen_ulid()`)                                                                                                                                                                                                       |
| `20260227220000` | `meme_schema_init`                          | `meme`      | 14 tables, 18 functions                                                                                                                                                                                                         |
| `20260228000000` | `discordsh_schema_init`                     | `discordsh` | 2 tables, 13 functions                                                                                                                                                                                                          |
| `20260228210000` | `meme_rpcs`                                 | `meme`      | +7 service RPC functions                                                                                                                                                                                                        |
| `20260228220000` | `osrs_schema_init`                          | `osrs`      | 9 tables, 11 functions                                                                                                                                                                                                          |
| `20260228230000` | `discordsh_update_server`                   | `discordsh` | +2 functions, removes direct UPDATE                                                                                                                                                                                             |
| `20260301210000` | `meme_rpcs_v2`                              | `meme`      | +12 service RPC functions                                                                                                                                                                                                       |
| `20260302000000` | `discordsh_guild_vault`                     | `discordsh` | 1 table, 7 functions (guild token vault)                                                                                                                                                                                        |
| `20260302100000` | `n8n_schema_init`                           | `n8n`       | Schema creation for n8n workflow engine                                                                                                                                                                                         |
| `20260303210000` | `meme_create_rpc`                           | `meme`      | +1 function (`service_create_meme`)                                                                                                                                                                                             |
| `20260304210000` | `meme_service_get_meme_by_id`               | `meme`      | +1 function (`service_get_meme_by_id`)                                                                                                                                                                                          |
| `20260307210000` | `staff_schema_init`                         | `staff`     | 2 tables, 12 functions (permissions)                                                                                                                                                                                            |
| `20260312183000` | `discordsh_list_servers`                    | `discordsh` | +1 function (`service_list_servers`)                                                                                                                                                                                            |
| `20260316210000` | `discordsh_dungeon_profiles`                | `discordsh` | 2 tables, 4 functions (dungeon RPG)                                                                                                                                                                                             |
| `20260318210000` | `rls_subquery_auth_uid`                     | _multi_     | ALTER 39 RLS policies (perf optimization)                                                                                                                                                                                       |
| `20260427210000` | `forum_schema_init`                         | `forum`     | 18 tables, 2 views, 15 enums, 42 functions (15 service RPCs), 101 indexes, 30 RLS policies                                                                                                                                      |
| `20260427220000` | `forum_feed_indexes_safe`                   | `forum`     | Drop 4 redundant feed indexes, add 7 `_safe` partials (status='active' AND nsfw=FALSE) for service_fetch_feed default path                                                                                                      |
| `20260427230000` | `forum_username_gate`                       | `forum`     | Add `forum.assert_user_has_username` helper; `service_create_thread` + `service_create_comment` reject authors with no `profile.username` row                                                                                   |
| `20260429210000` | `forum_staff_comment_rpcs`                  | `forum`     | `forum.is_staff(uuid)` cross-schema helper + `service_staff_edit_comment` / `service_staff_remove_comment` RPCs (gated on `staff.members.permissions <> 0`)                                                                     |
| `20260429220000` | `forum_rls_perf`                            | `forum`     | Wrap every `auth.uid()` in `(SELECT auth.uid())` (21 policies); merge dual permissive SELECT policies on `threads` + `comments` into single `*_select` policies                                                                 |
| `20260430210000` | `forum_tag_autovivify`                      | `forum`     | `forum.service_resolve_tag_ids` auto-creates missing tags inside the same xact instead of erroring                                                                                                                              |
| `20260503210000` | `forum_gaming_space`                        | `forum`     | Seed `gaming` space row + default tags                                                                                                                                                                                          |
| `20260509190000` | `discordsh_dungeon_permadeath`              | `discordsh` | Hard-delete profile + runs once `dungeon_profiles.deaths >= max_lives`                                                                                                                                                          |
| `20260510101731` | `mc_pgcrypto_qualify`                       | `mc`        | Schema-qualify `extensions.gen_random_uuid()` / `extensions.digest()` calls in mc functions for `search_path = ''` safety                                                                                                       |
| `20260510135547` | `mc_public_proxies`                         | `mc`        | Public-schema `proxy_*` wrappers so PostgREST RPC reaches mc functions without `.schema('mc')` prefix                                                                                                                           |
| `20260510145108` | `mc_lockdown_proxy_grants`                  | `mc`        | Tighten proxy\_\* grants — service_role only, no anon/authenticated EXECUTE                                                                                                                                                     |
| `20260510210000` | `profile_custom_access_token_hook`          | `profile`   | GoTrue `custom_access_token` hook injects `kbve_username` (canonical `profile.username`) into every JWT                                                                                                                         |
| `20260511104220` | `wallet_schema_init`                        | `wallet`    | 8 tables (accounts, balances, ledger, idempotency, transfers, coupon definitions/redemptions, listing), 14 service RPCs                                                                                                         |
| `20260513114428` | `wallet_auth_user_trigger`                  | `wallet`    | Auto-provision wallet account on `auth.users` insert via trigger                                                                                                                                                                |
| `20260514011143` | `wallet_ro_proxies`                         | `wallet`    | Public-schema RO proxies for balance + ledger reads (authenticated, RLS-gated)                                                                                                                                                  |
| `20260514051116` | `wallet_coupon_expiry_sweep`                | `wallet`    | Idempotent expiry sweep + `service_redeem_coupon` rate-limit + audit                                                                                                                                                            |
| `20260514113538` | `wallet_marketplace_schema`                 | `wallet`    | Marketplace tables (listings, offers, settlement events)                                                                                                                                                                        |
| `20260515054304` | `wallet_marketplace_rpcs`                   | `wallet`    | service_create_listing / \_accept_offer / \_cancel_listing + 7 more RPCs                                                                                                                                                        |
| `20260515064554` | `cnpg_pooler_pgbouncer_bootstrap`           | `_internal` | pgbouncer auth role + cnpg pooler bootstrap                                                                                                                                                                                     |
| `20260515220000` | `wallet_source_kind_referral`               | `wallet`    | Add `referral` to ledger source_kind enum                                                                                                                                                                                       |
| `20260515221756` | `referral_schema_init`                      | `referral`  | 3 tables (campaigns, claims, targets), 6 service RPCs for the referral payout pipeline                                                                                                                                          |
| `20260516015242` | `wallet_marketplace_proxies`                | `wallet`    | Public-schema proxies for marketplace listing reads (authenticated)                                                                                                                                                             |
| `20260516090714` | `referral_user_target_mgmt`                 | `referral`  | service_register_referral_target + \_list_my_targets so users self-manage targets                                                                                                                                               |
| `20260516094907` | `wallet_source_kind_firecracker`            | `wallet`    | Add `firecracker` to ledger source_kind enum                                                                                                                                                                                    |
| `20260516094908` | `wallet_firecracker_billing`                | `wallet`    | service_settle_firecracker_session + per-second billing RPC                                                                                                                                                                     |
| `20260518091000` | `inventory_schema_init`                     | `inventory` | 4 tables (items, instances, holds, transfers), 9 service RPCs                                                                                                                                                                   |
| `20260518142326` | `wallet_service_user_balance`               | `wallet`    | service_get_user_balance — single-roundtrip balance read for the dashboard                                                                                                                                                      |
| `20260519121254` | `wallet_firecracker_deployment_history`     | `wallet`    | service_list_firecracker_deployments for billing UI                                                                                                                                                                             |
| `20260520114243` | `wallet_inventory_listing_wire`             | `wallet`    | Wire inventory_instance_id onto listings + service_create_inventory_listing                                                                                                                                                     |
| `20260520124536` | `wallet_listing_settle_inventory`           | `wallet`    | service_accept_inventory_offer moves the inventory instance atomically with the wallet ledger entry                                                                                                                             |
| `20260520132957` | `wallet_service_user_balance_public_proxy`  | `wallet`    | Public-schema proxy for service_get_user_balance                                                                                                                                                                                |
| `20260523033932` | `tracker_find_claim_identity_by_discord_id` | `tracker`   | service_find_claim_identity_by_discord_id — bot lookup by Discord snowflake                                                                                                                                                     |
| `20260523033933` | `gh_issue_cache_init`                       | `gh`        | 2 tables (gh.issue, gh.issue_event lease-queue), 7 functions (upsert_issue / set_discord_thread / record_event / get_issue / list_open_issues / claim_undelivered_events / mark_event_delivered / \_failed / event_queue_stats) |
| `20260526223407` | `mc_lot_system`                             | `mc`        | Lot system (8 tables, 22 functions) for player land claims                                                                                                                                                                      |
| `20260531005655` | `auth_hook_owned_guilds_claim`              | `profile`   | `profile.discord_bootstrap_cache` + `custom_access_token_hook` v2 injects `owned_guilds` array claim onto every JWT (7-day freshness window, max 50 snowflakes)                                                                 |
| `20260606120000` | `gh_service_event_ops`                      | `gh`        | repo_key generated column + 2 partial indexes + 3 dashboard RPCs (service_get_guild_event_stats / \_recent_failed_events / \_requeue_event) with allowlist-scoped GH001–GH006 SQLSTATEs                                         |
| `20260607001923` | `gh_service_event_ops_v2`                   | `gh`        | gh.requeue_audit table (denormalized so it survives purges) + 2 RPCs (service_force_requeue_event / \_purge_old_delivered / \_get_recent_pending_events) + gh.\_normalize_repo_allowlist helper + GH007/GH008                   |
| `20260607171125` | `profile_service_get_discord_provider_id`   | `profile`   | profile.service_get_discord_provider_id + public.proxy_service_get_discord_provider_id — discord-bootstrap edge fn reaches auth.identities through proxy instead of `.schema('auth')` (PostgREST blocks auth)                   |
| `20260608014906` | `profile_discord_provider_id_owner`         | `profile`   | ALTER FUNCTION ... OWNER TO postgres so SECURITY DEFINER inherits SELECT on auth.identities (service_role has none). Fixes `permission denied for table identities` 500 cascade across the dashboard                            |

Migration state is tracked in `dbmate.schema_migrations` (not `public`) to isolate it from PostgREST/RPC.

## Schema Overview

### `mc` — Minecraft server player data

6 tables (`auth`, `player`, `container`, `transfer`, `character`, `skill`), 28 functions. Manages player authentication, inventory, transfers, and character stats for the Pumpkin MC server plugin.

- **Source**: `../schema/mc/`
- **Access**: service_role only (all writes via plugin's Supabase service client)

### `meme` — Meme platform

14 tables covering memes, user profiles, reactions, saves, comments, follows, reports, collections, templates, card battler system. 39 functions total (18 trigger/core + 7 v1 RPCs + 12 v2 RPCs + `service_create_meme` + `service_get_meme_by_id`).

- **Source**: `../schema/meme/`
- **Access**: service_role only for all RPC functions; tables have RLS with per-role SELECT policies

### `discordsh` — Discord server directory

5 tables (`servers`, `votes`, `guild_tokens`, `dungeon_profiles`, `dungeon_runs`), 27 functions. Server listing directory with voting, categorization, moderation, per-guild encrypted token vault, paginated listing, and a dungeon RPG system with player profiles, runs, and leaderboards.

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

### `n8n` — n8n workflow engine

Schema container only — n8n TypeORM manages its own 23 tables (workflows, executions, credentials, webhooks, users, etc.) within this schema. We create the schema and grants; n8n handles all DDL on boot.

- **Source**: `../schema/n8n/`
- **Access**: postgres (superuser) + service_role (read); anon/authenticated blocked entirely
- **Integration**: n8n workflows call KBVE service functions directly via SQL (no HTTP hop)

### `staff` — Staff permissions and audit log

2 tables (`members`, `audit_log`), 12 functions. Bitwise permission system for staff roles with privilege escalation guards and an immutable audit trail.

- **Source**: `../schema/staff/`
- **Access**: `is_staff()` and `staff_permissions()` are public RPCs (authenticated); `proxy_check_staff()`, `proxy_has_permission()`, `proxy_audit_log()` for authenticated users; `service_grant()`, `service_revoke()`, `service_remove()` for service_role only
- **Permission layout**: Core roles (bits 0-7), Features (bits 8-15), Admin ops (bits 16-23), Superadmin (bit 30)

### `public` — Shared utilities

`gen_ulid()` function for ULID primary key generation. Available to all roles.

### `forum` — Reddit-style discussion / marketplace / auction / poll system

18 tables (`spaces`, `tags`, `threads`, `comments`, `thread_tags`, `forum_user_profiles`, `user_follows`, `bookmarks`, `thread_subscriptions`, `thread_votes`, `comment_votes`, `reactions`, `auction_bids`, `poll_votes`, `reports`, `moderation_actions`, `notifications`, `attachments`), 2 views (`public_user_profiles`, `thread_tags_resolved`), 15 enums, 42 functions (27 trigger/normalize + 15 service RPCs), 101 indexes, 30 RLS policies.

- **Source**: `../schema/forum/` (`forum_core.sql`, `forum_user.sql`, `forum_engagement.sql`, `forum_moderation.sql`, `forum_rpcs.sql`)
- **Access**: read paths via `public_user_profiles` view + RLS-gated SELECTs on threads / comments / reactions / attachments / moderation*actions; all writes route through `service*\*` RPCs (service_role only)
- **Identity**: stays in `kbve.profile.UserProfile` — `forum.forum_user_profiles` only holds forum-side denormalized state (karma, post_count, signature, badges, ban flags)
- **RPC surface**: `service_create_thread` / `service_edit_thread` / `service_create_comment` / `service_edit_comment` / `service_cast_thread_vote` / `service_cast_comment_vote` / `service_toggle_reaction` / `service_file_report` / `service_place_bid` / `service_mark_notifications_read` / `service_fetch_feed` / `service_record_moderation` / `service_update_user_profile` / `service_ensure_user_profile` / `service_resolve_tag_ids`
- **Hardening**: FORCE RLS on every base table, advisory `pg_advisory_xact_lock` on contentious paths (votes, reactions, reports), `lock_timeout = '1s'` on contentious write RPCs, `statement_timeout = '2s'` on `service_fetch_feed`, append-only audit log (`moderation_actions` REVOKEs UPDATE/DELETE even from service_role), polymorphic parent existence triggers, FORCE RLS bypass via service_role's BYPASSRLS attribute

## Security Model

All schemas follow the **belt-and-suspenders** pattern:

1. **Schema isolation**: `REVOKE ALL ON SCHEMA ... FROM PUBLIC, anon, authenticated`
2. **RLS on every table**: `service_role_full_access` policy, restrictive policies for other roles
3. **Function lockdown**: Every function gets `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` + `OWNER TO service_role`
4. **SECURITY DEFINER + SET search_path = ''**: On all service/proxy functions and sensitive triggers
5. **Service/proxy pattern**: `service_*` functions take explicit `user_id` (service*role only); `proxy*\*`functions derive identity from`auth.uid()` (authenticated users)
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
    meme_core.sql          # Core tables (memes, templates), shared triggers + validation
    meme_engagement.sql    # Reactions, comments
    meme_social.sql        # User profiles, follows, collections, saves
    meme_moderation.sql    # Reports
    meme_cards.sql         # Card battler (card stats, decks, deck cards, player stats, battles)
    meme_rpcs.sql          # All service RPC functions
  discordsh/             # Discord server directory
    discordsh_servers.sql  # Schema, servers table, submit + update + list functions
    discordsh_votes.sql    # Votes table, cast_vote functions
  staff/                 # Staff permissions
    staff.sql              # Members, audit_log, 12 functions (grant/revoke/check)
  vault/                 # Vault token storage
    api_tokens.sql         # User-scoped API token vault (private.api_tokens)
    service_proxy.sql      # Service-role wrappers for user tokens
    guild_tokens.sql       # Guild-scoped token vault (discordsh.guild_tokens)
  osrs/                  # OSRS item database
    osrs_core.sql          # 9 tables, triggers, RLS
    osrs_rpcs.sql          # 4 service functions
  n8n/                   # n8n workflow engine
    n8n_init.sql           # Schema creation + grants (n8n TypeORM manages tables)
```

## Local Testing

### Smoke testing the full chain via nx

The fastest way to verify a migration is to run the full chain
against a prod-replica database. All smoke targets run against the
`ghcr.io/kbve/postgres:…-kilobase` image (x86, Rosetta on ARM).

Vanilla `postgres:17-alpine` smoke was retired — it lacks Supabase's
auth schema, ownership chain (`supabase_auth_admin`, `authenticator`,
`service_role`), pgsodium vault, PostgREST, and every other
Supabase-managed object. It silently passed migrations that fail in
prod with `permission denied for table identities`-class errors
(see PR #12033). Prod-parity is the whole point of this script, so
the only stack worth running is the one that mirrors prod.

| Target                                    | When to use                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `nx run data-sql:smoke`                   | Default: up → apply all → rollback → re-apply → tear down. Use before opening PR. |
| `nx run data-sql:smoke-kilobase`          | Same as `smoke` minus the rollback leg (faster).                                  |
| `nx run data-sql:smoke-kilobase-keep`     | Apply all + leave the stack up so you can `psql` / `dbmate` against it.           |
| `nx run data-sql:smoke-kilobase-rollback` | Explicit rollback target (alias of the default `smoke`).                          |

Underlying script: [`smoke.sh`](./smoke.sh). Pass `--keep` to leave
the compose stack up, or `--rollback` to additionally exercise the
latest migration's `down` path before tearing down:

```bash
./smoke.sh                    # default lifecycle
./smoke.sh --keep             # leave stack on localhost:54322
./smoke.sh --rollback         # apply → down → re-apply → tear down
./smoke.sh kilobase           # `kilobase` arg still accepted (legacy)
```

The script defensively takes any pre-existing compose stacks down
before bringing kilobase up so port 54322 is always free.

Other granular nx targets if you only want one phase:

| Target                                                             | What it does                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `nx run data-sql:kilobase-up` / `kilobase-down` / `kilobase-reset` | Lifecycle for the kilobase stack.                                                                     |
| `nx run data-sql:migrate-up`                                       | `dbmate up` against the running stack.                                                                |
| `nx run data-sql:migrate-status`                                   | Print applied / pending status.                                                                       |
| `nx run data-sql:test-migration -- <basename>`                     | Per-migration smoke via companion `.test.sql` files (see [`test-migration.sh`](./test-migration.sh)). |

The `dev-up` / `dev-down` / `dev-reset` targets that drove the
vanilla stack were dropped alongside the smoke retirement. The
`dev-docker-compose.yml` file is kept for ad-hoc local experiments
that genuinely don't need Supabase plumbing.

### n8n integration test (Postgres + n8n)

Runs both Postgres and n8n to verify the full integration — n8n boots, TypeORM creates tables in the `n8n` schema, and existing schemas are unaffected.

```bash
cp n8n-docker-compose.yml docker-compose.yml
docker compose up -d
# Wait for postgres health check, then apply migrations:
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres?sslmode=disable&search_path=dbmate,public" \
  dbmate --no-dump-schema --migrations-dir migrations up
# Wait ~30s for n8n TypeORM migrations, then verify:
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt n8n.*"
# n8n editor: http://localhost:5678
docker compose down -v
```

**When to run this**: After bumping the n8n image version, before updating the kube manifest. Verifies TypeORM migrations still work with the `n8n` custom schema.

### Production-replica test (CNPG kilobase image)

Uses the production CNPG image with the `supabase` database. Requires `platform: linux/amd64` on ARM Macs (Rosetta via OrbStack/Docker Desktop).

```bash
cp kilobase-docker-compose.yml docker-compose.yml
docker compose up -d
# Wait for postgres health check, then apply migrations:
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/supabase?sslmode=disable&search_path=dbmate,public" \
  dbmate --no-dump-schema --migrations-dir migrations up
# Verify:
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/supabase?sslmode=disable&search_path=dbmate,public" \
  dbmate --migrations-dir migrations status
# Test rollback:
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/supabase?sslmode=disable&search_path=dbmate,public" \
  dbmate --no-dump-schema --migrations-dir migrations rollback
# Tear down:
docker compose down -v
```

**Note**: The `public.realtime_messages` table is Supabase-managed and does not exist in local test environments. Migrations that alter its policies use conditional `DO` blocks to skip gracefully.

## Production Deployment

```bash
# 1. Port-forward to the CNPG primary
kubectl port-forward -n kilobase pod/supabase-cluster-2 54322:5432

# 2. Apply pending migrations (use production DATABASE_URL)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/supabase?sslmode=disable&search_path=dbmate,public" \
  dbmate --no-dump-schema --migrations-dir migrations up

# 3. Verify
psql "postgresql://postgres:postgres@127.0.0.1:54322/supabase" -c "\dt mc.*; \dt meme.*; \dt discordsh.*; \dt osrs.*; \dn n8n"
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
  dev-docker-compose.yml      # Committed template (vanilla postgres:17-alpine)
  kilobase-docker-compose.yml # Committed template (CNPG production image, migration testing)
  n8n-docker-compose.yml      # Committed template (postgres + n8n for integration testing)
  n8n-prod-docker-compose.yml # Committed template (CNPG image + redis + n8n for full stack)
  docker-compose.yml          # Local override (gitignored)
  README.md
  init/                   # Docker entrypoint scripts (run alphabetically on first start)
    00-roles.sql            # Supabase-compatible roles (service_role, anon, authenticated, etc.)
    01-auth-stub.sql        # Minimal auth.users + auth.uid() + auth.jwt() + auth.role()
    02-extensions-stub.sql  # extensions schema + pgcrypto + vault schema stub
    03-n8n-stub.sql         # n8n schema stub (TypeORM manages tables)
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
    20260302100000_n8n_schema_init.sql
    20260303210000_meme_create_rpc.sql
    20260304210000_meme_service_get_meme_by_id.sql
    20260307210000_staff_schema_init.sql
    20260312183000_discordsh_list_servers.sql
    20260316210000_discordsh_dungeon_profiles.sql
    20260318210000_rls_subquery_auth_uid.sql
```

## Important Notes

- **search_path=dbmate,public** in DATABASE_URL: `dbmate` ensures `schema_migrations` is created in the `dbmate` schema only (isolated from PostgREST/Supabase API). `public` is a lookup fallback so migrations can resolve references like `gen_ulid()` — nothing is stored in `public` by dbmate itself.
- **gen_ulid()** is in `public` schema so all roles can access it regardless of search_path.
- **init/ scripts** only run on first container start (empty data volume). They provide Supabase role/schema stubs that migrations depend on.
- **CNPG image** is x86-only; use `platform: linux/amd64` for ARM Macs.
- **Port-forward target**: Use `pod/supabase-cluster-2` (the primary) directly instead of `svc/supabase-cluster-rw` for more stable connections.
- **pg_trgm**: Required by the OSRS schema. The migration creates it automatically via `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
