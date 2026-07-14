# RentEarth ↔ ARPG Agones Multiplayer — Phase 1: Networking

**Date:** 2026-06-30
**Status:** Approved (design)
**Scope:** Phase 1 of 2. This spec covers the networking client only. Rendering, isometric camera, and terrain are deferred to a Phase 2 spec.

## Goal

Make `unreal-rentearth` a thin **client** of the existing Rust ARPG authority (Axum + simgrid, Agones-hosted). The Rust server owns the entire simulation. Unreal renders and samples input. There is no Unreal dedicated server image and no Unreal-native player replication on this path.

This is a hard fork in how rentearth networks: the `chuckServer` target and the `KBVENetEntityReplicator` (Iris/NetDriver) path are not used for networked players. They remain in the tree but are out of the critical path for this feature.

## Authority Model

- **Rust ARPG server = full authority.** Owns the grid sim, collision, AOI, movement integration, and persistence.
- **Unreal = client/renderer.** Decodes snapshots into actor positions, samples local input, and applies server corrections to the local pawn.
- Unreal physics / Mass become cosmetic only and do not drive networked state.

## Server Reference (existing, do not modify in Phase 1)

- Transport: WebSocket, binary frames only, `ws://<addr>:7979/ws`.
- Wire codec: **postcard** payloads, **COBS** framing on the outer `ServerEvent`/`ClientMessage`.
- `PROTOCOL_VERSION = 15`.
- Auth: Supabase JWT in the `JoinMatch` handshake (HS256 local or ES256/JWKS); dev-accept when the server has no secret set.
- Positions quantized: `qx = x * 32`, `qy = y * 32` (`POS_SCALE = 32`); velocity `* 256` (`VEL_SCALE`).
- Coordinate system: integer tile grid, isometric on the render side.
- Snapshots are AOI-culled per connection (`AOI_RADIUS = 64`, Chebyshev).

Source of truth for the wire format:

- `packages/rust/simgrid/src/proto.rs` (Rust structs/enums + codec)
- `packages/npm/laser/src/lib/net/postcard-wire.ts` (TS codec mirror)
- `packages/npm/laser/src/lib/net/postcard-wire.spec.ts` (cross-language hex fixtures)

## Plugin / Module Layout

No new plugin. Add a **new module under the existing `KBVENet` plugin** (a `.uplugin` hosts multiple modules; `KBVEWorld` already ships three). This keeps all networking under one umbrella while isolating the two transports.

```
packages/unreal/KBVENet/  (plugin = all networking)
├── Source/KBVENet/        (existing) UE-native Iris/FastArray replication
└── Source/KBVESimgrid/    (NEW) foreign postcard/WS client → Rust ARPG
```

`KBVESimgrid` module contents:

- **`SimgridWebSocket`** — thin wrapper over `IWebSocket`. Binary frames, connect/close, single reconnect with backoff. No polling.
- **`Cobs`** — COBS encode/decode for frame boundaries.
- **`Postcard`** — `FPostcardReader` / `FPostcardWriter`: varint, zigzag-encoded signed ints, bool, enum tag (u32 variant index), string, `Vec<T>`, and struct field helpers. Positional encoding (field order matters, no skips).
- **`SimgridProto`** — C++ mirrors of the **subset** of `proto.rs` needed for Phase 1: `FJoinMatch`, `FClientFrame`, `EInput` (at least `Move`, later `MoveTo`), `FServerEvent` (`Welcome`, `Snapshot`, `Ephemeral`, `Reject`), `FSnapshot`, `FEntityDelta`, `FKindEntry`, `FTile`. Only mirror what the slice needs.
- **`USimgridClientSubsystem`** (`UGameInstanceSubsystem`) — owns the socket, runs the state machine, encodes outbound frames, decodes inbound events, exposes delegates.

`chuck` module gains a dependency on `KBVESimgrid` and consumes the subsystem delegates. The iso camera, real actors, and terrain are Phase 2 and live in `chuck` / consume `KBVEWorld`.

## State Machine

`USimgridClientSubsystem`:

```
Disconnected → Connecting → Joining → Live → Disconnected
```

- **Connecting** — WS open in progress.
- **Joining** — WS open; `JoinMatch` sent; awaiting `Welcome`.
- **Live** — `Welcome` accepted; processing snapshots; sending input frames.
- **Disconnected** — closed or errored; fires `OnDisconnect`.

Delegates: `OnWelcome`, `OnSnapshot`, `OnEphemeral`, `OnReject`, `OnDisconnect`.

## Handshake

1. WS connect to `ws://<addr>:7979/ws`. `<addr>` from config/env; dev default `localhost`.
2. Send `JoinMatch{ protocol: 15, jwt, kbve_username }`.
3. Receive `Welcome{ protocol, your_slot, seed, registry }`.
    - Guard: if `protocol != 15`, disconnect with a clear version-mismatch error.
    - Store `your_slot`, `seed`, `registry` for Phase 2 (seed feeds KBVEWorld terrain).
4. `Reject{ reason }` → surface the reason, no retry loop.

## Auth

rentearth already ships **KBVESupabase**. Pull the live Supabase session JWT and `kbve_username` from it for the handshake. No new auth code.

- Dev fallback: a config/env token when there is no session (Rust server dev-accepts when it has no secret).
- The JWT is passed only in the `JoinMatch` frame over the WS connection.

## Input (local player → server)

Per Unreal tick:

1. Sample EnhancedInput (analog move, run modifier).
2. Build `ClientFrame{ client_tick, inputs: [ Move{ seq, mx, my, run, tick } ] }`.
3. postcard + COBS encode, send as a binary frame.
4. Track `seq`; buffer unacked moves; re-send on heartbeat if dropped (mirrors the TS client behavior).

`MoveTo{ tile }` (click-to-move) is a later addition, not required for the slice.

## Snapshot (all players → client)

On inbound binary frame:

1. COBS deframe → postcard decode into `FServerEvent`.
2. On `Snapshot`: for each `FEntityDelta`,
    - dequantize `x = qx / 32.0`, `y = qy / 32.0`;
    - upsert into an entity map keyed by entity id (store tile, world pos, velocity);
    - spawn / despawn a **throwaway debug actor** (e.g. colored capsule) at the mapped position to prove sync;
    - if the entity is the local `your_slot`, apply as a **server correction** to the local pawn rather than spawning a remote actor.
3. On `Ephemeral`: decode the outer envelope; Phase 1 logs `kind` only. Combat/inventory/projectile handling is later.

Tile → Unreal world mapping in Phase 1 is a simple flat placement (`X = x * tileSize`, `Y = y * tileSize`, `Z = 0`) sufficient to verify movement. The polished isometric mapping and camera are Phase 2.

## Error Handling & Lifecycle

- **Version mismatch** — hard fail with a clear message; no reconnect.
- **WS drop** — transition to Disconnected, fire `OnDisconnect`, attempt a single reconnect with backoff. No poll storms / no busy-wait safety nets.
- **Decode error** — log and drop the offending frame; never crash the client.
- **Eviction** (same username joins elsewhere) — the server closes the socket; surface a "session replaced" message.

## Testing

- **C++ automation tests** in `KBVESimgrid`:
    - COBS encode/decode roundtrip.
    - Postcard roundtrip for varint, zigzag, bool, string, enum tag, `Vec<T>`.
- **Cross-language hex fixtures** — port the pinned byte vectors from `postcard-wire.spec.ts` into C++ tests for `JoinMatch`, `Welcome`, `EntityDelta`, and `Move`. These fail loud if the Rust `proto.rs` wire layout drifts, catching mismatch at build time rather than runtime.
- **Manual integration** — run a local ARPG server, connect two rentearth clients, confirm debug capsules move and despawn correctly across clients.

## Drift Mitigation (no codegen)

postcard is derive-based on Rust types; there is no shared IDL, and codegen would mean replacing the existing wire definition (out of scope, high risk). Drift is instead caught by:

- **Version guard** — `Welcome.protocol != 15` fails loud.
- **Hex fixtures** — pinned bytes break the build when Rust changes.
- **Minimal surface** — only the slice's structs are mirrored, reducing what can drift.

Re-sync is a manual step when `proto.rs` changes, surfaced at build time.

## Out of Scope (Phase 2)

- Isometric camera rig (replacing the spring-arm third-person camera).
- Real 3D actors for remote players/NPCs (replacing debug capsules).
- KBVEWorld terrain rendered from `Welcome.seed`.
- Snapshot interpolation / smoothing polish.
- Ephemeral gameplay events (combat, inventory, projectiles, ships, dungeons).
- `MoveTo` click-to-move.

## Definition of Done (Phase 1)

- `KBVESimgrid` module builds under the `KBVENet` plugin and is consumed by `chuck`.
- A rentearth client connects to a local ARPG server, authenticates via KBVESupabase JWT, and accepts `Welcome`.
- Two clients see each other's movement as debug actors driven by decoded snapshots.
- Local input drives the local pawn through server corrections.
- COBS + postcard unit tests and ported hex fixtures pass.
