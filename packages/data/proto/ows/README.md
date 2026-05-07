# `packages/data/proto/ows` — Open World Server Protos

Wire schema for the Open World Server (OWS) — characters, abilities, inventory, chat, areas of interest. Lines up 1:1 with the `ows` Postgres schema so the C++/UE5 server, the Rust services, and the database all share one type vocabulary.

## Files

| File        | Package | Purpose                                                                               |
| ----------- | ------- | ------------------------------------------------------------------------------------- |
| `ows.proto` | `ows`   | Enums + messages for OWS gameplay state. Mirrors `sql/schema/ows/*.sql` (40+ tables). |

## Postgres counterpart

Each top-level message corresponds to a table in [`../../sql/schema/ows/`](../../sql/schema/ows/). Examples:

| Proto message               | Postgres source                                       |
| --------------------------- | ----------------------------------------------------- |
| `Character`                 | `ows.characters`                                      |
| `Ability` / `AbilityType`   | `ows.abilities`, `ows.ability_types`                  |
| `CharacterInventory`        | `ows.char_inventory`, `ows.char_inventory_items`      |
| `ChatGroup` / `ChatMessage` | `ows.chat_groups`, `ows.chat_messages`                |
| `AreaOfInterest`            | `ows.areas_of_interest`, `ows.area_of_interest_types` |
| `Class` / `ClassInventory`  | `ows.class`, `ows.class_inventory`                    |

## Generated downstream

- **Rust** — UE5 server bindings consume the prost-generated module from this proto.
- **TypeScript / Zod** — Astro / web admin tools via `gen-ows-zod.mjs`.

## Conventions

- Field numbers append-only — UE5 saves and live sessions both depend on stability.
- New tables added under `sql/schema/ows/` should land a corresponding proto message in the same PR so the wire side stays in sync.
- Cross-schema concerns (auth, profile) reuse messages from [`../kbve/`](../kbve/) — do not duplicate them here.

## Related

- Postgres schema mirror: [`../../sql/schema/ows/`](../../sql/schema/ows/).
- Codegen: [`../../codegen/gen-ows-zod.mjs`](../../codegen/gen-ows-zod.mjs) (config: `../../codegen/ows-zod-config.json`).
- OWS deployment notes: see `project_ows_instance_launcher` in the auto-memory.
