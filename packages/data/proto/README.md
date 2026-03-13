# Proto — Source of Truth Schemas

This directory contains **protobuf definition files** (`.proto`) that serve as the universal source of truth for data structures across all KBVE games and services.

## Structure

| Directory | Purpose |
|-----------|---------|
| `kbve/` | Core KBVE protos (OSRS items, discordsh, common types) |
| `npc/` | NPC database proto (`npcdb.proto`) — universal NPC definitions |
| `google/` | Google well-known proto imports |
| `jedi/` | Jedi-specific protos |
| `meme/` | Meme schema protos |

## Rules

- **Never edit applied/production protos** without creating a new migration if they back a database schema.
- Proto files here are **compile-time definitions** — they produce zero cost for unused optional fields at runtime.
- Compiled descriptors (`.binpb`) belong in `../codegen/descriptors/`, not here.
- Codegen configs and scripts belong in `../codegen/`, not here.

## Related

- Codegen scripts and zod configs: [`../codegen/`](../codegen/)
- Compiled descriptors: [`../codegen/descriptors/`](../codegen/descriptors/)
