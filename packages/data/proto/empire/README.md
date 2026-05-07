# `packages/data/proto/empire` — Rareicon Empire Protos

City-state, faction, and empire-meta data shared between the Rareicon Unity client and the Bevy / Rust simulation. The proto is the canonical wire shape across the FFI boundary; saves carry it forward across runs.

## Files

| File           | Package  | Purpose                                                                              |
| -------------- | -------- | ------------------------------------------------------------------------------------ |
| `empire.proto` | `empire` | City-state lifecycle, faction definitions, persisted city / building / unit records. |

## Why one shared proto across Unity ↔ Rust

Rareicon's economy and simulation logic runs in Rust (Bevy ECS); the rendered world runs in Unity. Anything that crosses the FFI — save loading, ghost-sim deltas, city-state transitions — is serialized through this proto. The wire numbers must stay stable so older saves keep deserializing after balance patches.

## Notable enums / messages

- `CityStateStatusValue` — city lifecycle (founded → growing → sieged → fallen). **Wire numbers MUST stay stable** to preserve saves; comment in the proto mirrors `RareIcon.CityStateStatusValue` in Unity.
- City record — coordinates, faction, population, building inventory.
- Empire / faction record — alliances, treaties, diplomatic state.

## Generated downstream

| Target                  | Consumer                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| Rust struct via `prost` | `packages/rust/bevy/uniti` (FFI layer) and the Rareicon Bevy ECS systems.  |
| C# via `protoc`         | `apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Proto/Empire.cs`. |

## Conventions

- Wire numbers are append-only; **never renumber** — see save-compat note above.
- Removing a field means promoting it to `reserved` and never reusing the number.
- Unity-side enum mirrors must keep the same int values as the proto enum. The proto file has a `// keep wire numbers stable so saves carry across Unity ↔ Rust` reminder at the top — do not delete it.
- Game-specific render / animation config does NOT belong here. Those live in `apps/rareicon/` (Unity) and the Bevy gameplay crates.

## Related

- Rust FFI bridge: [`packages/rust/bevy/uniti`](../../../../packages/rust/bevy/uniti/).
- Unity-side generated proto: `apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Proto/Empire.cs`.
- Save / persistence pipeline notes: see `project_rareicon_ffi_persistence` in the auto-memory.
