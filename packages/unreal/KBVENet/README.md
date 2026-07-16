# KBVENet

Shared networking layer for KBVE games. Iris-ready replication primitives for streaming server-authoritative simulations (Mass ECS swarms, etc.) to clients for local rendering.

## Entity-snapshot replicator

`UKBVENetEntityReplicator` (an `UActorComponent`) holds a delta-compressed `FFastArraySerializer` of lean per-entity snapshots:

| field       | meaning                                            |
| ----------- | -------------------------------------------------- |
| `Id`        | correlates a snapshot with the source sim's entity |
| `Location`  | `FVector_NetQuantize10` world position             |
| `YawQ`      | quantized yaw (uint16) — e.g. movement direction   |
| `Frame`     | animation frame (uint8)                            |
| `StateByte` | one free byte (flags, e.g. moving)                 |

FastArrays are transported by **Iris** when the ReplicationSystem is enabled (and by the classic NetDriver otherwise) — no Iris-specific code in the consumer.

```cpp
// server (authority)
Rep->ServerUpsert(EntityId, WorldPos, MoveYawDeg, Frame, bMoving ? 1 : 0);
Rep->ServerRemove(EntityId);

// client
for (const FKBVENetEntitySnapshot& S : Rep->GetSnapshots()) { /* render */ }
Rep->OnSnapshotsChanged.AddRaw(this, &FThing::Reconcile); // change-driven
```

Put the component on an `bAlwaysRelevant` replicated actor the server spawns; clients find it (`TActorIterator`) and read it.

## Enabling Iris (per game)

KBVENet provides the primitives; turning Iris on is per-target + config in the game:

- In each `*.Target.cs` (Game / Editor / Server): `bUseIris = true;`
- In `Config/DefaultEngine.ini`:
    ```ini
    [ConsoleVariables]
    Net.Iris.UseIrisReplication=1
    ```

## Consumers

- **chuck slime swarm** — server runs the Mass sim and `ServerUpsert`s each slime's position/yaw/frame; clients render the swarm from snapshots into a local ISM (direction row + billboard computed per-client from the local camera, so facing stays view-correct).

## KBVESimgrid — ARPG wire client

Byte-exact C++ client for the Rust ARPG simgrid protocol (`packages/rust/simgrid/src/proto.rs`). **`PROTOCOL_VERSION = 16`** (`GSimgridProtocolVersion` in [SimgridClientSubsystem.cpp](Source/KBVESimgrid/Private/SimgridClientSubsystem.cpp)). Bottom-up layers:

| layer               | file                           | role                                                                         |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| COBS framing        | `SimgridCobs`                  | stuff/deframe top-level messages, `0x00` delimited                           |
| postcard primitives | `SimgridPostcard`              | LEB128 varint, zigzag i16/i32, string, seq, option, variant                  |
| typed proto         | `SimgridProto` (`FProtoCodec`) | encode `JoinMatch`/`Frame`; decode `Welcome`/`Snapshot`/`Ephemeral`/`Reject` |
| WS transport        | `SimgridWebSocket`             | binary `IWebSocket`, fragment reassembly                                     |
| UDP fastlane        | `SimgridUdpLink`               | token hello + snapshot datagrams (#13767)                                    |
| subsystem           | `USimgridClientSubsystem`      | state machine + handshake + auth                                             |

Wire rules: postcard + COBS over WebSocket. `POS_SCALE=32`/`VEL_SCALE=256` are **not on the wire** — dequant is the render layer's job. No code comments (project rule); byte fixtures in `Private/Tests/` guard drift against `proto.rs`.

`USimgridClientSubsystem` (`UGameInstanceSubsystem`, Blueprint category `KBVE|Simgrid`):

```cpp
Sub->ConnectToServer("ws://host/ws"); // pulls JWT + username from KBVESupabase
Sub->SendMove(Move);
Sub->GetState();          // Disconnected → Connecting → Joining → Live
Sub->GetLastSnapshot();
// delegates: OnWelcome(Slot,Seed) OnSnapshot OnRejected(Reason) OnDisconnected OnEphemeral
```

Handshake: open → `Joining` (JoinMatch sent) → `Welcome` (protocol guard vs 16, else disconnect) → `Live` → snapshots. Server may offer a UDP port; `SimgridUdpLink` takes over snapshot delivery when accepted. Any `proto.rs` change shifts fixture bytes → test fails at build → re-sync mirror + bump `GSimgridProtocolVersion`.

## KBVESimgridRender — snapshot → world

Render module (`KBVESimgridRender`) that turns decoded snapshots into actors. Consumes `USimgridClientSubsystem`; owns dequant + interpolation + iso camera. Key pieces:

- `FSimgridCoords` — `TILE_SIZE=100`, `FLOOR_HEIGHT=200`, `POS_SCALE=32`, `VEL_SCALE=256`; `QuantToWorldXY`, `TileToWorldXY`, `FacingToYaw`.
- `USimgridEntityManager` — spawns/reconciles `ASimgridEntityActor` per entity delta (mesh/sprite via KBVENpcDB).
- `SimgridInterpolator` — snapshot smoothing.
- `SimgridIsoCameraPawn`, `SimgridNameplateWidget`, `SimgridDamageText`, `SimgridProjectileTracer` — iso rig + player nameplates + vitals/combat FX.

## License

Part of the KBVE monorepo — see repo root.
