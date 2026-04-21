# Rareicon — Architecture Plan

> **Living roadmap.** Tracks shipped work, in-flight refactors, and the forward arc of the simulation architecture. Section numbering is sticky — once assigned, a section keeps its number even after it ships.

## Status snapshot

| §     | Topic                                                  | State                                                                             |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| §12   | InventorySlot type split (PackSlot + per-bank ledgers) | Shipped                                                                           |
| §13   | Single-writer ledger via NativeQueue drain             | Shipped                                                                           |
| §13.5 | Per-producer NativeQueue conversion                    | **Abandoned** — superseded by §15 (working tree preserved as checkpoint)          |
| §14   | MessagePipe boundary / per-domain pipes                | Plan drafted — see [MESSAGING.md](MESSAGING.md); executes after §15-E             |
| §15   | ECS/DB subsystem + Logistics domain                    | **Shipped** — Chunks A/B/C complete; CurrentAmounts authoritative, MessagePipe UI |
| §16   | Professions domain (dispatch + events)                 | **Active** — rename + DB + event bridge landed; Burst conversion deferred         |
| §17   | Combat domain                                          | **Planned** — pull hostile-scan + preemption out of Professions, see §17 notes    |
| §18+  | Subsequent domains (Skills, Needs, etc.)               | Future — reuse `ECS/DB/<Domain>/` pattern                                         |

## §15 — ECS/DB subsystem + Logistics domain

### Motivation

`DynamicBuffer<*Ledger>` (CapitalLedger, FarmLedger, FurnaceLedger, BarracksLedger, GoblinCaveLedger) is the authoritative store today. Unity's job-safety tracks dependencies at the buffer-type level, forcing serialization between otherwise-independent producers. §13 and §13.5 pushed that model as far as it goes. The in-flight §13.5 per-producer queue conversion (~28 files, preserved as a checkpoint on `dev`) still shows three hard limits:

- No reservation phase — two carriers racing for the same 10 arrows both see them, applier resolves one at a time, underflow possible.
- No intent separation — a flat `BankTransfer { Target, ItemId, Delta }` mixes pickup / deposit / consume / surplus. Applier can't reason about ordering.
- Producer-queue fan-out grows linearly with producer count.

Scale target is millions of units × millions of buildings. That rules out the per-buffer model entirely.

### Pivot — three-layer architecture

Authoritative ledger state moves into an ECS-native in-memory transactional state layer living alongside normal ECS components.

| Layer             | Role                                                                                    | Lives where                                                 |
| ----------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **ECS world**     | Entities + relationships: units, banks, routes, jobs, ownership, transforms             | DOTS native — what DOTS is natural for.                     |
| **Domain state**  | Indexed authoritative state: quantities, reservations, pending deltas                   | Native containers on a singleton inside `ECS/DB/<Domain>/`. |
| **Sync / commit** | Bridge: systems read world state, write into domain state; commit applies; mirror emits | Phases 0–5 of the logistics tick.                           |

This is not "ECS vs database." ECS stores entities and relationships; the domain state layer stores indexed keyed state; systems coordinate between them. Native containers (`NativeParallelHashMap`, `NativeStream`) with `AsParallelWriter()` give job-safe writes with no managed hot path.

### Containers (Logistics domain)

| Container                                                               | Role                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `NativeParallelHashMap<LedgerKey, int>      CurrentAmounts`             | Authoritative balances. Sole writer: the committer. |
| `NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations` | Parallel-writer reservation submissions.            |
| `NativeStream Deliveries`                                               | Resolver → Reducer channel.                         |
| `NativeParallelMultiHashMap<LedgerKey, int> PendingDeltas`              | Reduced per-key mutations awaiting commit.          |

### Tick phases

```
Phase 0: Lifecycle    — clear per-frame state (Reservations, Deliveries, PendingDeltas)
Phase 1: Reservation  — parallel producers write ReservationRecord (RO on CurrentAmounts)
Phase 2: Resolve      — per-key sort by (Priority DESC, Tick ASC, Requester.Index ASC),
                        grant against CurrentAmounts, emit DeliveryRecord,
                        write negative source deltas into PendingDeltas
Phase 3: Reduce       — drain Deliveries, accumulate positive dest deltas into PendingDeltas
Phase 4: Commit       — walk PendingDeltas, apply into CurrentAmounts (sole writer)
Phase 5: Mirror       — read CurrentAmounts, write DynamicBuffer<*Ledger> views (Phase B+ only)
```

### Folder layout

```
Assets/_RareIcon/Scripts/ECS/DB/
  Logistics/
    Components/
      LedgerKey.cs
      ReservationIntent.cs
      ReservationRecord.cs
      DeliveryRecord.cs
      LogisticsDBSingleton.cs
    Systems/
      LogisticsDomainSystem.cs
      ReservationResolveSystem.cs
      DeliveryReduceSystem.cs
      LedgerCommitSystem.cs
      LedgerMirrorSystem.cs
    Harness/
      SyntheticProducerSystem.cs  (editor-only, Burst, no GUI)
```

`ECS/DB/` stays thin. Future domains (`ECS/DB/Combat/`, `ECS/DB/Skills/`) drop in alongside Logistics. Shared primitives only if a second domain actually needs them.

### Rollout

**Phase A — Ship dormant operational subsystem.** Build out `ECS/DB/Logistics/` as a complete, Burst-clean subsystem with its own synthetic harness + debug overlay. Zero touches to existing game code. Correctness invariants (no underflow, conservation, determinism) verified via smoke test — no load-based gating.

**Phase B — Shadow parity.** Keep today's `InventoryTransferApplierSystem` authoritative. Add a shadow hook: every committed `BankTransfer` also writes into `CurrentAmounts`. `LedgerParityCheckSystem` asserts map total == buffer sum per key per frame. Green under real scenarios → ready to flip.

**Phase C — Authority flip.** One atomic cutover:

1. Wake `LedgerMirrorSystem` — drives `DynamicBuffer<*Ledger>` from `CurrentAmounts`.
2. Rewrite `InventoryTransferApplierSystem` as a thin translator: `NativeQueue<BankTransfer>` → `PendingDeltas`.
3. Stop writing buffers from the applier. Buffers are mirrors only.
4. Discard the §13.5 checkpoint working tree.

**Phase D — Producer migration.** File-by-file, each producer stops emitting `BankTransfer` and starts emitting `ReservationRecord` directly. Translator shrinks each PR. Order (low-risk → high-risk):

1. `BuildingSurplusTransferSystem`
2. `PassiveProductionSystem`, `FurnaceProductionSystem`, Farm production
3. `CookingSystem`, `BarracksCraftingSystem`
4. `BuilderDepositSystem`, `EmpireDepositSystem`, `BarracksSupplyDepositSystem`
5. `ArcherRefillSystem`
6. `GoblinCaveSystems`
7. `StorageConsolidatorSystem`

**Phase E — Retire legacy.** Delete `BankTransfer`, `BankTransferQueueSystem`, per-producer queues, the translator. Rename or delete `InventoryTransferApplierSystem`.

**Phase F — §14 messaging on the committed-delta stream.** Separate plan — see [MESSAGING.md](MESSAGING.md). The committer naturally emits (LedgerKey, delta) events; a SystemBase bridge publishes them through MessagePipe per-domain pipes.

### Code style (binding for this plan)

- No inline comments in implementation code. No `// field: …` tails, no `// TODO`, no step-by-step narration inside job bodies.
- One-line `/// <summary>` on public types / systems only when the purpose is non-obvious from the name.
- No `#region`.
- Rationale lives in this doc and commit messages.

## §16 — Professions domain

### Motivation

The dispatcher previously named `JobSystem` collided with Unity's `IJob` / `Unity.Jobs.*` namespace every time someone read the file. It also left idle citizens (`jobIntent: None=5`, `activity: Idle=5` in diagnostics) whenever no scored offer won — the unit sat doing nothing instead of wandering. Finally, the dispatcher's `JobIntent` writes weren't observable; UI panels polled to see who was doing what.

### Scope landed this session

- **Rename** (mechanical, 30 files): `JobKind` → `ProfessionKind`, `JobIntent` → `ProfessionIntent`, `JobPriorities` → `ProfessionPriorities`, `JobDefaults` → `ProfessionDefaults`, `JobPreferencesStore` → `ProfessionPreferencesStore`, `JobSystem` → `ProfessionDispatchSystem`.
- **Folder move** to `ECS/DB/Professions/` (Components / Systems / Messages) matching the Logistics domain shape.
- **New `ProfessionKind.Default = 1`**. Dispatcher falls back to Default and writes a `GoalKind.Wander` MovementGoal when no scored offer wins — idle citizens now wander deterministically per-entity + per-tick.
- **`ProfessionsDBSingleton`** with `NativeList<ProfessionChangedMessage> CommittedEvents`. Populated by the dispatcher inline on any kind / target change; cleared per frame by `ProfessionsDomainSystem` (OrderFirst in `BehaviorSystemGroup`).
- **`ProfessionMessagePipeBridgeSystem`** drains the list and publishes via `IPublisher<ProfessionChangedMessage>` (lazy `GlobalMessagePipe` resolve, same pattern as Logistics).
- **VContainer**: `ProfessionChangedMessage` broker registered in `RootLifetimeScope`.

### Deferred to follow-up

- **Burst IJobParallelFor dispatcher rewrite.** The 400-line scoring loop in `ProfessionDispatchSystem` is still `SystemBase` main-thread. Converting to `IJobParallelFor` over units requires: lifting the offer-enumeration pass into a singleton-cached `NativeList<TaskOffer>`, replacing all `EntityManager.GetComponentData` lookups with `ComponentLookup<T>` passed in, and resolving the `TaskMemory` DynamicBuffer access through `BufferLookup<TaskMemory>` with `[NativeDisableParallelForRestriction]`. The Guard hostile-lookup branch (`TryFindHostile` against `SpatialHashSingleton`) is already Burst-ready. Land as `§16-Burst` in a focused session after a real scaling need appears.
- **UI subscriber conversion.** `RosterTab` still polls — partially because it also displays unit-spawn / death / stat state, not just professions. When those domains get their own events (`UnitLifecycleMessage`, etc.) the whole panel can migrate.

## §17 — Combat domain (planned)

### Motivation

Hostile detection, threat scoring, and preemption logic currently live in `ProfessionDispatchSystem` — specifically `TryFindHostile` (169-cell spatial-hash scan), the `friendlyEmitters` snapshot, and the per-unit preemption branch that drops an Active task when a hostile crosses into territory. That's the wrong home: dispatch is "who does what"; combat is "what's threatening us right now."

Today the dispatcher pays a per-frame cost proportional to `units × scan-radius²` even when zero hostiles exist. Gated with an `anyHostile` early-exit for now (§16 performance patch), but the proper fix is architectural.

### Target shape

New `ECS/DB/Combat/` domain, same pattern as Logistics / Professions:

- `CombatDBSingleton` — `NativeList<ThreatRecord>` of current hostiles inside friendly territory, rebuilt per frame by a Burst job walking `SpatialHashSingleton` + `TerritoryEmitter`.
- `Messages/ThreatDetectedMessage`, `ThreatClearedMessage` — published on transitions.
- Subscribers:
    - `ProfessionDispatchSystem` reads `CombatDBSingleton` (or subscribes to the messages) to decide whether to preempt. No more per-unit 13×13 scan.
    - `AudioCueService` / toast layer can react to threat entry without reaching into ECS.
    - A future `DefenseRallySystem` could assign specific defenders to threats explicitly.

### What moves

From `ProfessionDispatchSystem.RunDispatch`:

- The `friendlyEmitters` NativeList snapshot.
- `TryFindHostile`, `InsideAnyEmitter`, `AxialDistance` helpers.
- The per-unit preemption branch — simplified to "read CombatDBSingleton, preempt if a threat exists inside territory and unit has Guard priority".

Guard patrol-fallback scoring stays in Professions (choosing a hex to patrol is a dispatch concern, not a combat concern).

### Scope note

Not urgent. The §16 performance patch makes the current code cheap enough when no hostiles are present. Migrate when either (a) we add more combat-side subscribers that would duplicate the scan logic, or (b) combat gets richer (multi-faction, threat levels, etc.).

## §14 — MessagePipe boundary (planned)

Detailed plan in [MESSAGING.md](MESSAGING.md). Four-layer model (NativeQueue → Burst applier → SystemBase bridge → MessagePipe subscribers). Per-domain typed pipes, DisposableBag discipline. Shipped for Logistics (§15-C); Professions (§16) follows the same pattern.

## §12 / §13 — shipped

Full write-up: [INVENTORY.md](INVENTORY.md). Summary: unit-side `PackSlot` split, per-bank ledger buffers (Capital/Farm/Furnace/Barracks/GoblinCave), ULID-keyed stacks, `BankLedgerBase` shared-layout via `Reinterpret<T>`, `InventoryTransferApplierSystem` as the single writer drain, `BankTransfer` as the transport record.

## Reference

- [INVENTORY.md](INVENTORY.md) — §12 / §13 implementation record.
- [MESSAGING.md](MESSAGING.md) — §14 MessagePipe boundary plan.
- [MAINTHREAD.md](MAINTHREAD.md) — main-thread budget notes.

## §0

Here is a clean, production-grade v3 pattern for your ECS → MessagePipe pipeline.
No fluff — just the structure you want:

1. Message (with frame + reason)
   public enum ProfessionChangeReason : byte
   {
   Assigned,
   Cleared,
   Retargeted,
   Preempted,
   ReliefOverride,
   ManualOverride,
   Fallback
   }

public struct ProfessionChangedMessage
{
public Entity Entity;
public byte OldKind;
public byte NewKind;
public int2 TargetHex;
public Entity TargetEntity;

    public uint   Frame;
    public ProfessionChangeReason Reason;

    public ProfessionChangedMessage(
        Entity entity,
        byte oldKind,
        byte newKind,
        int2 hex,
        Entity target,
        uint frame,
        ProfessionChangeReason reason)
    {
        Entity        = entity;
        OldKind       = oldKind;
        NewKind       = newKind;
        TargetHex     = hex;
        TargetEntity  = target;
        Frame         = frame;
        Reason        = reason;
    }

} 2. Domain Singleton (DOUBLE BUFFER)
public struct ProfessionsDBSingleton : IComponentData
{
// WRITE BUFFER (ECS systems append here)
public NativeList<ProfessionChangedMessage> WriteBuffer;

    // READ BUFFER (bridge drains this)
    public NativeList<ProfessionChangedMessage> ReadBuffer;

    public JobHandle PipelineHandle;

} 3. Domain System (SWAP BUFFERS)
[UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
public partial struct ProfessionsDomainSystem : ISystem
{
Entity \_singleton;
bool \_init;

    public void OnUpdate(ref SystemState state)
    {
        if (!_init)
        {
            var db = new ProfessionsDBSingleton
            {
                WriteBuffer = new NativeList<ProfessionChangedMessage>(256, Allocator.Persistent),
                ReadBuffer  = new NativeList<ProfessionChangedMessage>(256, Allocator.Persistent),
                PipelineHandle = default
            };

            _singleton = state.EntityManager.CreateEntity(typeof(ProfessionsDBSingleton));
            state.EntityManager.SetComponentData(_singleton, db);
            _init = true;
        }

        ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;

        db.PipelineHandle.Complete();

        // SWAP (no copy)
        var tmp        = db.ReadBuffer;
        db.ReadBuffer  = db.WriteBuffer;
        db.WriteBuffer = tmp;

        db.WriteBuffer.Clear(); // new writes go here
        db.PipelineHandle = default;
    }

    public void OnDestroy(ref SystemState state)
    {
        if (!_init) return;

        var db = state.EntityManager.GetComponentData<ProfessionsDBSingleton>(_singleton);

        if (db.WriteBuffer.IsCreated) db.WriteBuffer.Dispose();
        if (db.ReadBuffer.IsCreated)  db.ReadBuffer.Dispose();
    }

} 4. ECS Event Sink (ALL SYSTEMS USE THIS)
public static class ProfessionEventSink
{
public static void Add(
ref NativeList<ProfessionChangedMessage> buffer,
Entity entity,
byte oldKind,
byte newKind,
int2 hex,
Entity target,
uint frame,
ProfessionChangeReason reason)
{
buffer.Add(new ProfessionChangedMessage(
entity, oldKind, newKind, hex, target, frame, reason));
}
} 5. Managed Dispatcher (COALESCE + BATCH)
using MessagePipe;
using System.Buffers;
using System.Collections.Generic;

public interface IProfessionEventDispatcher
{
void PublishBatch(NativeList<ProfessionChangedMessage> native);
}

public class ProfessionEventDispatcher : IProfessionEventDispatcher
{
readonly IPublisher<ProfessionChangedMessage> \_publisher;

    // reused each frame
    readonly Dictionary<Entity, ProfessionChangedMessage> _coalesced
        = new Dictionary<Entity, ProfessionChangedMessage>(512);

    public ProfessionEventDispatcher(IPublisher<ProfessionChangedMessage> publisher)
    {
        _publisher = publisher;
    }

    public void PublishBatch(NativeList<ProfessionChangedMessage> native)
    {
        if (!native.IsCreated || native.Length == 0) return;

        _coalesced.Clear();

        // COALESCE: last write wins per entity
        for (int i = 0; i < native.Length; i++)
        {
            var msg = native[i];

            if (_coalesced.TryGetValue(msg.Entity, out var existing))
            {
                // preserve ORIGINAL oldKind, update everything else
                existing.NewKind      = msg.NewKind;
                existing.TargetHex    = msg.TargetHex;
                existing.TargetEntity = msg.TargetEntity;
                existing.Frame        = msg.Frame;
                existing.Reason       = msg.Reason;

                _coalesced[msg.Entity] = existing;
            }
            else
            {
                _coalesced[msg.Entity] = msg;
            }
        }

        // PUBLISH FINAL
        foreach (var kv in _coalesced)
        {
            _publisher.Publish(kv.Value);
        }
    }

} 6. Bridge System (PURE FLUSH POINT)
[UpdateInGroup(typeof(BehaviorSystemGroup))]
[UpdateAfter(typeof(ProfessionsDomainSystem))]
public partial class ProfessionMessagePipeBridgeSystem : SystemBase
{
IProfessionEventDispatcher \_dispatcher;

    protected override void OnCreate()
    {
        RequireForUpdate<ProfessionsDBSingleton>();

        // resolve once
        var publisher = GlobalMessagePipe.GetPublisher<ProfessionChangedMessage>();
        _dispatcher = new ProfessionEventDispatcher(publisher);
    }

    protected override void OnUpdate()
    {
        ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;

        db.PipelineHandle.Complete();

        var read = db.ReadBuffer;
        if (!read.IsCreated || read.Length == 0) return;

        _dispatcher.PublishBatch(read);
    }

} 7. Usage inside your Dispatch System (REPLACE DIRECT .Add)
var db = SystemAPI.GetSingletonRW<ProfessionsDBSingleton>();
var buffer = db.ValueRW.WriteBuffer;

uint frame = (uint)SystemAPI.Time.ElapsedTime;

// example usage:
ProfessionEventSink.Add(
ref buffer,
entity,
prevKind,
newKind,
bestHex,
bestEntity,
frame,
ProfessionChangeReason.Assigned);
What you now have (no explanation, just facts)
Zero contention (write buffer only)
No main-thread contention until flush
Deterministic frame boundary
Coalesced events (no spam)
Centralized publish point
Extendable to ANY system

# §0 BIG0

> **Domain subsystem template.** The structural contract every simulation domain (Logistics, Professions, Combat, Skills, Needs, …) is built from. §0 exists so new domains inherit "off-main-thread + coalesced + burst-ready" by default instead of each one reinventing the pipeline and getting a different part wrong.

### Motivation

Every domain needs the same plumbing: authoritative state, parallel writes from jobs, a single boundary to the managed world (MessagePipe). Without a template we end up with mixed SystemBase producers calling `IPublisher.Publish` inline from hot loops — which is what drove fps below target. §0 locks the shape so that cost lives in one place (the bridge), not per-producer.

### Template — four parts per domain

| Part                              | Type                   | Role                                                                                                                                  |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `<Domain>DBSingleton`             | `IComponentData`       | Double-buffered event list (`WriteBuffer` / `ReadBuffer`) + any domain-owned native containers + `JobHandle PipelineHandle`.          |
| `<Domain>DomainSystem`            | `ISystem` (OrderFirst) | Owns singleton lifecycle. Each tick: complete `PipelineHandle`, swap buffers, clear the new `WriteBuffer`.                            |
| `<Domain>EventSink`               | `static` helpers       | The **only** way producers append events. Burst-safe, takes `ref NativeList<TMessage>`.                                               |
| `I<Domain>EventDispatcher` + impl | managed class          | Coalesces `ReadBuffer` by entity (last-write-wins, preserve original `OldKind`), publishes via `IPublisher<TMessage>` once per frame. |
| `<Domain>MessagePipeBridgeSystem` | `SystemBase`           | Drains `ReadBuffer`, delegates to dispatcher, nothing else.                                                                           |

### Folder convention

```
ECS/DB/<Domain>/
  Components/   <Domain>DBSingleton.cs + message structs + reason enum
  Messages/     <Domain>EventSink.cs + <Domain>EventDispatcher.cs
  Systems/      <Domain>DomainSystem.cs + <Domain>MessagePipeBridgeSystem.cs + domain logic
```

### Rules (binding)

- Producers never call `IPublisher.Publish` directly — always `<Domain>EventSink.Add`.
- Events are coalesced; subscribers must tolerate missing intermediate states.
- `PipelineHandle` is the sole sync point between jobs and the bridge.
- No shared `DomainEventDispatcher<T>` generic base until ≥3 domains prove the shape is stable.
- Messages are `struct` (not `readonly struct`) so the dispatcher can mutate during coalesce.
- Domain logic systems prefer `ISystem + [BurstCompile]` over `SystemBase`. Keep `SystemBase` only where main-thread access is unavoidable (bridge publish, managed UI hooks).

### Performance levers (the fps story)

§0 is the enabling refactor; the fps wins come from what it unblocks:

- `SystemBase` → `ISystem + Burst` for hot producers (dispatcher scoring, producer ticks).
- Offer / candidate enumeration moves to a parallel job writing a cached singleton `NativeList<TOffer>`, not re-queried per unit.
- `EntityManager.CreateEntityQuery` + `ToEntityArray` per tick → `SystemAPI.Query` with cached type handles.
- Direct `IPublisher.Publish` from hot loops → one coalesced publish per entity per frame via the dispatcher.

Target after §0 lands in Logistics + Professions: **200–300 fps** at current unit counts, with the dispatcher and producers off the main thread except at the bridge boundary.

### Adoption order

1. **§0-A Professions (§16).** Reference implementation. Split `ProfessionDispatchSystem.cs` into the four template files. Replace 4 event-emit sites in `RunDispatch` with `ProfessionEventSink.Add(... Reason)`. No code-motion from `RunDispatch` yet — diff stays reviewable.
2. **§0-B Logistics (§15).** Retrofit `LogisticsDBSingleton` to double-buffer, add `LogisticsEventSink` + `LogisticsEventDispatcher`, rewrite `InventoryMessagePipeBridgeSystem` as the pure flush point. Strip any direct `IPublisher` calls in producers.
3. **§0-C Professions burst pass.** Convert `ProfessionDispatchSystem` from `SystemBase` to `ISystem`, lift offer enumeration into a separate burst system that writes a cached offer singleton. This is where the fps needle actually moves.
4. **§0-D Combat (§17).** First greenfield domain built from §0 — proves the template.
5. **§0-E+ Skills / Needs / ….** Copy-paste-rename.

### Explicitly NOT in §0

- Shared `DomainEventDispatcher<T>` generic base. Wait for domain #3.
- Replacing the Logistics tick-phase pipeline (Reservation → Resolve → Reduce → Commit → Mirror) — that's §15's domain, not §0's. §0 only touches the event-fanout layer.
- Sub-frame event ordering or priority. Coalescing is last-write-wins by entity; subscribers must tolerate it.
- Moving existing producers' internal state into the domain singleton. Only event pipeline moves; per-system state stays local.
