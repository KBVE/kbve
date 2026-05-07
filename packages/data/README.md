# `packages/data` — Data, Schemas, and Codegen

Single tree for every cross-language data definition in the monorepo. Apps and services compile against artifacts produced here so the same shape moves through proto, Postgres, ClickHouse, and TypeScript without drift.

## Layout

| Directory                | What lives here                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`proto/`](./proto/)     | Protobuf `.proto` files — source of truth for cross-service data structures.                                       |
| [`codegen/`](./codegen/) | Generators that read proto descriptors + JSON config and emit typed Zod / TS schemas into app trees.               |
| [`sql/`](./sql/)         | PostgreSQL schemas, dbmate migrations, and supporting docker-compose stacks for the Supabase cluster.              |
| [`ch/`](./ch/)           | ClickHouse DDL — Logflare OTEL templates, observability log/trace pipelines, and firecracker microVM event tables. |

## Pipeline

```
proto/*.proto
   │  prost / buf / protoc
   ▼
codegen/descriptors/*.binpb
   │  gen-*-zod.mjs
   ▼
apps/<service>/src/schemas/generated/*.ts   ← Zod + TS
sql/schema/<schema>/*.sql                   ← hand-authored Postgres schema mirror
sql/dbmate/migrations/*.sql                 ← applied migrations (dbmate)
ch/schemas/*.sql                            ← hand-authored ClickHouse DDL
```

The proto file is authoritative for **structure**. Postgres migrations and ClickHouse DDL are authoritative for **deployed schema state** in their respective stores.

## Conventions

- Edit proto, regenerate Zod via `npx tsx packages/data/codegen/gen-*-zod.mjs`.
- Never hand-edit `codegen/generated/` or `codegen/descriptors/` — they are build artifacts.
- Never hand-edit applied dbmate migrations. Add a new one with `dbmate new <name>`.
- Match Postgres + ClickHouse table names to the proto message names where practical so traces line up across stores.

## Related

- Memory pipeline pattern: itemdb / npcdb / mapdb / questdb sync via `astro-kbve` scripts (`nx run astro-kbve:sync:{itemdb,npcdb,mapdb}`). MDX is the source of truth for those pools.
- CI registry proto: [`proto/kbve/ci_registry.proto`](./proto/kbve/ci_registry.proto) → Zod → `@kbve/devops` registry → `.github/ci-dispatch-manifest.json`.
