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

## License

Part of the KBVE monorepo — see repo root.
