# `packages/data/proto/kbve` — Core KBVE Protos

Cross-cutting protobuf definitions used by multiple KBVE services. Anything that doesn't belong to a single game / app domain (NPC, meme, ows, empire) lives here.

## Files

| File                | Package          | Purpose                                                                                           |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `ci_registry.proto` | `kbve.ci`        | Source of truth for monorepo projects participating in CI dispatch (docker, npm, crates, python). |
| `common.proto`      | `kbve.common`    | Shared primitives — ULID type, timestamps, well-known wrappers reused everywhere else.            |
| `enums.proto`       | `kbve.enums`     | Item-category bitflags and other cross-domain enum constants.                                     |
| `kbve.proto`        | `kbve`           | Generic service helpers — `HealthCheckRequest`/`Response` for load-balancer probes.               |
| `kbveproto.proto`   | _(unscoped)_     | Legacy `Apikey` message and stragglers awaiting reorganisation.                                   |
| `pool.proto`        | `kbve.pool`      | `PrefabRegistry` — game-side asset/prefab registry shared between Unity and Bevy.                 |
| `schema.proto`      | `kbve.schema`    | Script-binding descriptors so script runtimes can introspect generated types.                     |
| `snapshot.proto`    | `kbve.snapshot`  | `ClientMessage` / `ServerMessage` envelope used by the snapshot/replay infrastructure.            |
| `discordsh.proto`   | `kbve.discordsh` | Mirrors the `discordsh` Postgres schema — servers, votes, guild vault.                            |
| `forum.proto`       | `kbve.forum`     | Mirrors the `forum` Postgres schema — spaces, threads, engagement, moderation, ranks.             |
| `osrs.proto`        | `kbve.osrs`      | Mirrors the `osrs` Postgres schema — items, monsters, drops.                                      |
| `profile.proto`     | `kbve.profile`   | Public-facing user profile shape (display name, avatar, links).                                   |
| `staff.proto`       | `kbve.staff`     | Bitwise permission flags for the `staff` Postgres schema.                                         |

## Notable consumers

- `ci_registry.proto` → `@kbve/devops` Zod registry → [`.github/ci-dispatch-manifest.json`](../../../../.github/ci-dispatch-manifest.json) (built by `nx run astro-kbve:sync:ci-manifest`).
- `forum.proto` / `meme.proto` / `discordsh.proto` → matching `sql/schema/<name>/` and dbmate migrations.
- `common.proto` is imported by every other proto in this directory, plus most game protos under `proto/empire`, `proto/npc`, `proto/ows`.

## Conventions

- One `package` per file. Use `kbve.<scope>` (e.g. `kbve.forum`) so the generated Rust / TS namespaces stay tight.
- New schema-mirror protos belong here only when they cross multiple services. Single-game protos go in their own directory (`proto/empire`, `proto/npc`, `proto/ows`).
- Field numbers are append-only. **Never renumber** — wire-compatible saves and on-the-wire messages depend on stability.
- Adding a field is safe; removing one means promoting it to `reserved` and never reusing the number.

## Related

- Codegen scripts that consume these: [`../../codegen/`](../../codegen/).
- Postgres schemas mirrored from forum / discordsh / profile / staff: [`../../sql/schema/`](../../sql/schema/).
- CI dispatch: [`.github/workflows/ci-manifest-guard.yml`](../../../../.github/workflows/ci-manifest-guard.yml).
