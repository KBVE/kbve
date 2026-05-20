# `packages/data/sql/schema` — Per-Schema DDL Mirror

Hand-authored reference DDL grouped by Postgres schema. This tree is the **review surface** for SQL changes — it does not run against the database directly. Reviewed changes get promoted into a dated [`../dbmate/migrations/`](../dbmate/migrations/) file, which is what dbmate actually applies.

## Schemas

| Directory                    | Postgres schema | Owner / consumers                                                                                  |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| [`discordsh/`](./discordsh/) | `discordsh`     | Discord game-data service (servers, votes, dungeon profiles, guild vault).                         |
| [`forum/`](./forum/)         | `forum`         | KBVE forum core (spaces, threads, engagement, moderation, RPCs).                                   |
| [`inventory/`](./inventory/) | `inventory`     | KBVE-owned ledger of items (canonical bank-style), bridge coordinator + receipt, 2FA gate.         |
| [`mc/`](./mc/)               | `mc`            | Minecraft server (auth, characters, containers, players, skills, transfers).                       |
| [`meme/`](./meme/)           | `meme`          | Meme social platform (cards, engagement, moderation, social, RPCs).                                |
| [`n8n/`](./n8n/)             | `n8n`           | n8n workflow engine bootstrap.                                                                     |
| [`osrs/`](./osrs/)           | `osrs`          | OSRS data tables and read RPCs.                                                                    |
| [`ows/`](./ows/)             | `ows`           | Open World Server (characters, abilities, inventories, chat, areas of interest, …).                |
| [`profile/`](./profile/)     | `profile`       | Cross-app user profiles.                                                                           |
| [`realtime/`](./realtime/)   | `realtime`      | Supabase Realtime publication and broadcast helpers.                                               |
| [`referral/`](./referral/)   | `referral`      | Per-user referral links, click log, reward policy. Credits to wallet via `'referral'` source_kind. |
| [`staff/`](./staff/)         | `staff`         | Bitwise staff permission / access-control tables.                                                  |
| [`tracker/`](./tracker/)     | `tracker`       | Activity / metrics tracking.                                                                       |
| [`vault/`](./vault/)         | `vault`         | Encrypted secret storage helpers.                                                                  |
| [`wallet/`](./wallet/)       | `wallet`        | Multi-currency ledger + coupons + khash marketplace (listings, bids, treasury fee).                |

## File layout convention

Each schema directory follows the same pattern:

```
schema/<schema>/
  <schema>_core.sql          ← tables, types, base indexes
  <schema>_<feature>.sql     ← feature-grouped extensions (e.g. meme_engagement.sql)
  <schema>_rpcs.sql          ← service RPC functions exposed to PostgREST
```

- File prefix matches the schema name so `\i schema/<schema>/*.sql` glob-loads in alphabetical order.
- Tables → indexes → views → triggers → policies → functions → grants. Within a single file, in that order.
- RPCs that read are `service_get_*`; RPCs that mutate are `service_<verb>_*`. Keep them in `<schema>_rpcs.sql`.
- Cross-schema FKs are allowed but should be declared in the **referencing** schema's file, not the referenced one.

## Promoting a change to a migration

1. Edit the relevant file under `schema/<schema>/`.
2. Open a PR with the schema-only change for review.
3. Once approved, run `dbmate new <description>` from `packages/data/sql/dbmate/`.
4. Copy the diff into the new migration file. Add the matching `down` block.
5. Apply locally against the dev compose to verify before pushing.

The `schema/` tree is intentionally **idempotent-safe**: every CREATE uses `IF NOT EXISTS`, every function uses `CREATE OR REPLACE`. That makes a clean bootstrap (`\i schema/<schema>/*.sql`) work on an empty database for local testing. dbmate migrations don't share that constraint — they assume a known prior state.

## Related

- dbmate-managed migrations + applied changelog: [`../dbmate/`](../dbmate/).
- Local dev compose stacks: [`../dbmate/dev-docker-compose.yml`](../dbmate/dev-docker-compose.yml).
- Pre-dbmate / archaeology: [`../old/`](../old/) — kept for reference, do not apply.
