# `packages/data/proto/npc` — NPC Database Protos

Universal NPC definitions — creatures, humanoids, bosses — shared across every KBVE game (KBVE isometric, Rareicon, MC, Discordsh).

## Files

| File          | Package | Purpose                                                                                        |
| ------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `npcdb.proto` | `npc`   | NPC registry, stats, spawn rules, behavior traits, interaction flags, phase/time-of-day rules. |

## Why one shared proto

Each game used to maintain its own NPC enum / struct. That meant identical creatures (e.g. a wolf) had three different field schemas, three migrations to add HP, three places to update for a balance pass.

`npcdb.proto` is the single source of truth. Game-specific concerns (render kind, pool size, animation timing) live in **per-game adapter configs** beside the game code, not in this proto. The proto only carries data that any game might want to query.

## Field categories

- **Identity** — `ref` (string slug, stable across runs), `id` (ULID), `name`, `family`, `rarity`.
- **Stats** — `hp`, `attack`, `defense`, `speed`, `armor`, …
- **Behavior** — `wander_radius`, `aggression`, flee thresholds.
- **Spatial** — walk speed, swim/fly capabilities.
- **Interaction** — `is_interactable`, `is_targetable`, `is_capturable`.
- **Phase rules** — time-of-day visibility windows.
- **Type flags** — bitmask for "is creature / is humanoid / is boss" filters.

## Generated downstream

| Target                                  | Consumer                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Rust struct via `prost`                 | `packages/rust/bevy/bevy_npc` → `NpcDb` resource.                       |
| TypeScript Zod via `gen-npcdb-zod.mjs`  | Astro / Rareicon Unity build pipelines.                                 |
| C# via `protoc` (Rareicon Unity client) | `apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Proto/Npc.cs`. |

## Conventions

- `ref` is the **stable** slug (`"meadow-firefly"`). Always present.
- `id` is the runtime ULID — present after publish, blank in source MDX.
- Field numbers are append-only. Spawn rules / phase rules use `repeated` so multi-zone creatures fit in one entry.
- New games adding NPCs **edit MDX, not this proto**. The MDX → JSON / binpb pipeline lives in `apps/kbve/astro-kbve/src/content/docs/npcdb/` and produces `Generated NpcRegistry` consumed by `NpcDb::from_bytes`.

## Related

- Bevy adapter: [`packages/rust/bevy/bevy_npc`](../../../../packages/rust/bevy/bevy_npc/).
- Unity adapter (Rareicon): `apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/`.
- Codegen: [`../../codegen/gen-npcdb-zod.mjs`](../../codegen/gen-npcdb-zod.mjs), [`../../codegen/gen-npcdb-data.mjs`](../../codegen/gen-npcdb-data.mjs).
- Source MDX: `apps/kbve/astro-kbve/src/content/docs/npcdb/`.
