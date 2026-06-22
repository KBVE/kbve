# Proto — Source of Truth Schemas

Protobuf definition files (`.proto`) — universal source of truth for data structures across KBVE games and services.

## Structure

- **`kbve/`** — Core KBVE protos (CI registry, discordsh, common types, OSRS, agents, VM, firecracker, forum, telemetry)
- **`npc/`** — NPC database proto (`npcdb.proto`) — universal NPC definitions
- **`item/`** — Item database proto (`itemdb.proto`) — universal item definitions
- **`quest/`** — Quest database proto (`questdb.proto`) — quest definitions and rewards
- **`map/`** — Map database proto (`mapdb.proto`) — world map and tile data
- **`git/`** — Git platform schemas (GitHub, Forgejo, common git types)
- **`jedi/`** — Infrastructure protos (Argo CD, ClickHouse, Redis, Twitch, Groq)
- **`jobboard/`** — Job board schema (postings, applications, taxonomy)
- **`meme/`** — Meme schema protos
- **`ows/`** — Open World Server (OWS) schema
- **`referral/`** — Referral system schema (per-user redirect links + click log + reward policy)
- **`rows/`** — Rows multiplayer framework schema
- **`wallet/`** — Wallet schema (ledger + coupons + marketplace + treasury)
- **`icon/`** — Icon registry proto
- **`empire/`** — Empire game schema
- **`google/`** — Google well-known proto imports (struct, timestamp, duration)

## Key Schemas

### CI Registry (`kbve/ci_registry.proto`)

Central source of truth for all monorepo projects, pipelines, and deployments:

- **CiProject** — Project metadata, version tracking, build/test/deploy config
- **DispatchPipeline** — Pipeline types (docker, npm, crates, unreal, godot, unity, etc.)
- **ExternalPublish** — Multi-platform publish targets (Steam, itch.io, Modrinth, App Store, etc.)
- **GameEngineConfig** — Game-specific build config (UE, Unity, Godot, Bevy)
- **KubeMetadata** — Kubernetes label metadata (stack, environment, tier, owner, criticality)

Generated outputs:

- Zod schema → `../codegen/generated/ci_registry-schema.ts`
- TypeScript types → `apps/kbve/astro-kbve/src/generated/proto/kbve/ci_registry.ts`
- Astro content collection schema → `apps/kbve/astro-kbve/src/data/schema/ICiProjectSchema.ts`

### Game Data (`item/`, `npc/`, `quest/`, `map/`)

Universal game entity definitions shared across UE, Unity, Godot, Bevy:

- **itemdb.proto** — Items, equipment, consumables, stats
- **npcdb.proto** — NPCs, dialogue, AI behavior
- **questdb.proto** — Quests, objectives, rewards
- **mapdb.proto** — World maps, tiles, spawn points

### Infrastructure (`jedi/`)

Platform and service integration schemas:

- **argocd.proto** — Argo CD application definitions
- **clickhouse.proto** — Analytics event schemas
- **redis.proto** — Cache and queue message formats
- **twitch.proto** — Twitch API integration
- **groq.proto** — AI model inference schemas

### Multiplayer (`rows/`, `ows/`)

Server-client communication protocols:

- **rows.proto** — Rows framework (agones fleet management)
- **ows.proto** — Open World Server character persistence

## Rules

- **Never edit applied/production protos** without creating a new migration if they back a database schema
- Proto files here are **compile-time definitions** — they produce zero cost for unused optional fields at runtime
- Compiled descriptors (`.binpb`) belong in `../codegen/descriptors/`, not here
- Codegen configs and scripts belong in `../codegen/`, not here
- All protos must be included in `../codegen/gen-all.mjs` for Zod generation

## Codegen Workflow

1. **Edit proto** — Make changes to `.proto` files in this directory
2. **Run codegen** — `nx run data-proto:generate` (runs both Zod + TypeScript generation)
3. **Update config** — If adding new message types, update `../codegen/<name>-zod-config.json`:
    - Add to `include` array
    - Add field overrides for validation rules
4. **Consume types** — Import from `@kbve/proto/<name>-schema` in TypeScript/Astro projects

## Related

- Codegen scripts and zod configs: [`../codegen/`](../codegen/)
- Compiled descriptors: [`../codegen/descriptors/`](../codegen/descriptors/)
- Generated Zod schemas: [`../codegen/generated/`](../codegen/generated/)
- Generated TypeScript (buf): [`apps/kbve/astro-kbve/src/generated/proto/`](../../../apps/kbve/astro-kbve/src/generated/proto/)
