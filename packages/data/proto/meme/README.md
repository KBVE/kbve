# `packages/data/proto/meme` — Meme Social Schema

Protobuf mirror of the `meme` Postgres schema — meme posts, profiles, engagement (likes / saves / votes), moderation, and the card collection minigame.

## Files

| File         | Package | Purpose                                                                                             |
| ------------ | ------- | --------------------------------------------------------------------------------------------------- |
| `meme.proto` | `meme`  | Top-level enums + messages for memes, user profiles, comments, votes, saves, cards, and moderation. |

## Postgres counterpart

Each top-level message in `meme.proto` corresponds to a table or RPC return type in [`../../sql/schema/meme/`](../../sql/schema/meme/):

| Proto message     | Postgres source                                  |
| ----------------- | ------------------------------------------------ |
| `Meme`            | `meme.memes` (in `meme_core.sql`)                |
| `MemeUserProfile` | `meme.meme_user_profiles` (in `meme_social.sql`) |
| `MemeComment`     | `meme.meme_comments` (in `meme_engagement.sql`)  |
| `MemeVote`        | `meme.meme_votes` (in `meme_engagement.sql`)     |
| `MemeSave`        | `meme.meme_saves` (in `meme_engagement.sql`)     |
| `MemeReport`      | `meme.meme_reports` (in `meme_moderation.sql`)   |
| `MemeCard*`       | `meme.cards*` (in `meme_cards.sql`)              |

RPC payloads (`service_get_meme_by_id`, `service_create_meme`, …) use the matching proto messages so the wire format from `axum-memes` matches what the frontend expects.

## Generated downstream

- **Zod** — `apps/memes/astro-memes/src/schemas/generated/meme.zod.ts` via `npx tsx packages/data/codegen/gen-clickhouse-zod.mjs` (config: `meme-zod-config.json`).
- **Rust** — `apps/memes/axum-memes/src/proto/meme.rs` via `prost-build`.

## Conventions

- One file (`meme.proto`) keeps everything in a single namespace because all messages are tightly coupled (no client wants Meme without MemeVote).
- Field numbers are append-only — see the moderation `MemeReport` enum for an example of `reserved` use after a status was retired.
- Optional fields use proto3 `optional` (`optional string display_name = 2`) so the Postgres `NULL` semantics round-trip cleanly through Zod.

## Related

- Proto-driven Rust service: [`apps/memes/axum-memes`](../../../../apps/memes/axum-memes/).
- Astro frontend: [`apps/memes/astro-memes`](../../../../apps/memes/astro-memes/).
- Postgres schema mirror: [`../../sql/schema/meme/`](../../sql/schema/meme/).
- Applied migrations: [`../../sql/dbmate/migrations/20260227220000_meme_schema_init.sql`](../../sql/dbmate/migrations/20260227220000_meme_schema_init.sql) and follow-ups.
