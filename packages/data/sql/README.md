# `packages/data/sql` — PostgreSQL Schemas, Migrations, and Compose Stacks

PostgreSQL state for the KBVE Supabase cluster (`supabase-cluster` in the `kilobase` namespace) plus the local docker-compose stacks used to validate it.

## Layout

| Path                   | What lives here                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| [`dbmate/`](./dbmate/) | dbmate-managed migrations and per-deployment compose files. Source of truth for **applied** schema.     |
| [`schema/`](./schema/) | Hand-authored DDL grouped by Postgres schema (`discordsh`, `forum`, `mc`, `meme`, …). Reference mirror. |
| [`old/`](./old/)       | Pre-dbmate migrations and helper functions. Kept for archaeology — do **not** apply to new clusters.    |

## How the pieces fit together

```
proto/*.proto                        ← cross-language type contracts
   │
   ▼ (codegen + manual mirroring)
schema/<schema>/*.sql                ← reference DDL grouped by Postgres schema
   │
   ▼ (hand-promoted into a dated migration)
dbmate/migrations/YYYY...sql         ← what the live database actually runs
   │
   ▼ (dbmate up / managed by GitOps)
supabase-cluster (kilobase)
```

`schema/` is the **review surface** — humans edit there and discuss diffs. A migration in `dbmate/migrations/` is the **deploy surface** — once applied, never edited; a new migration replaces it.

## Local dev

| Compose file                                                                                       | Purpose                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`dbmate/dev-docker-compose.yml`](./dbmate/dev-docker-compose.yml)                                 | Vanilla Postgres 17 for fast migration loops.                  |
| [`dbmate/kilobase-docker-compose.yml`](./dbmate/kilobase-docker-compose.yml)                       | Production replica image (`ghcr.io/kbve/postgres:…-kilobase`). |
| [`dbmate/forgejo-docker-compose.yml`](./dbmate/forgejo-docker-compose.yml)                         | Forgejo dependency stack.                                      |
| [`dbmate/n8n-docker-compose.yml`](./dbmate/n8n-docker-compose.yml) / `n8n-prod-docker-compose.yml` | n8n workflow engine stacks.                                    |

Quick start (against `dev-docker-compose.yml`):

```bash
cd packages/data/sql/dbmate
docker compose -f dev-docker-compose.yml up -d

export DATABASE_URL='postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable&search_path=dbmate,public'
dbmate --migrations-dir migrations up
```

### Smoke testing the full migration chain

Two end-to-end smoke flows are wired as nx targets. Each one nukes the
volume, brings the stack up fresh, applies every migration, prints
`dbmate status`, and tears the stack back down. Failure at any step
exits non-zero.

```bash
# Vanilla postgres:17-alpine — fast feedback loop, ~10s end-to-end
npx nx run data-sql:smoke-vanilla

# Production-replica CNPG image (kilobase) — real auth.* schema +
# Supabase trigger surface; the only locally-runnable parity test
# for the live cluster. Slower (Rosetta on ARM Macs).
npx nx run data-sql:smoke-kilobase

# Run both stacks sequentially (vanilla first, then kilobase)
npx nx run data-sql:smoke

# Leave the stack up after smoke (useful for follow-up psql probes)
npx nx run data-sql:smoke-vanilla-keep
npx nx run data-sql:smoke-kilobase-keep
```

The wrapper script is [`dbmate/smoke.sh`](./dbmate/smoke.sh); it also
takes `--rollback` to exercise the latest migration's down path.

Every meaningful PR that touches `migrations/` should pass at minimum
`smoke-vanilla` and ideally `smoke-kilobase` before merge. See
[`dbmate/README.md`](./dbmate/README.md#smoke-testing-the-full-chain-via-nx)
for full target reference.

## Conventions

- **Never edit applied migrations.** Add a new one with `dbmate new <name>`.
- **`DATABASE_URL` must include `search_path=dbmate,public`** so `schema_migrations` lives in the `dbmate` schema (not `public`) and stays out of the PostgREST surface.
- **One Postgres schema per directory** in `schema/`. Files inside use the prefix `<schema>_*.sql` so they read in dependency order without an explicit ordering hint.
- **RPC functions live next to their schema** (e.g. `schema/meme/meme_rpcs.sql`), not in a separate `functions/` tree. The pre-dbmate `old/functions/` layout is intentionally NOT carried forward.

## Related

- Migration changelog + applied versions table: [`dbmate/README.md`](./dbmate/README.md).
- Per-schema DDL conventions: [`schema/README.md`](./schema/README.md).
- Proto definitions that some Postgres tables mirror: [`../proto/`](../proto/).
