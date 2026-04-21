# Rareicon Messaging Architecture

> **Status:** Planning. §13 single-writer ledger landed; this is §14 — the clean ECS↔managed boundary via MessagePipe, per-domain pipes, DisposableBag-managed subscriptions. Executes after this doc is signed off.

## 1. Problem

Today the UI layer polls ECS state every frame — `UITreasury.GetBuffer<CapitalLedger>`, `UIBuildingInspector.GetBuffer<*Ledger>`, roster panels scanning Unit queries, HUD recomputing from raw components. This works but:

- **Couples UI to ECS internals** — every ledger rename / split breaks the UI even when the data semantics are identical.
- **No event semantics** — "toast on pickup" / "audio cue on kill" / "XP popup on skill gain" have nowhere to live. Today they're hand-hacked into the producer systems (Activity Feed is the only existing example, and it's Inventory-only).
- **No natural ECS↔managed boundary** — managed subsystems (audio, toast, tooltip, locale text) either get hand-rolled bridges or reach into ECS with main-thread buffer access, hiding sync points.
- **High-volume streams have no aggregation** — combat damage hits could easily be 100+/sec under a raid; they need batch publish, not per-hit polling.

§13 gave us **one writer per ledger** and **simulation-facts-via-NativeQueue**. §14 layers on top: **simulation facts become managed events**, published at the boundary into MessagePipe, per-domain typed pipes, UI subscribes.

## 2. Four-layer model

```
┌─────────────────────────────────────────────────────────────┐
│ L1: Simulation transport  (Burst, worker threads, unmanaged)│
│    NativeQueue<DomainCommand>                               │
│    e.g. NativeQueue<BankTransfer>  (§13 — already shipped)  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ L2: Commit applier      (Burst ISystem, sole RW on state)   │
│    Drains the NativeQueue, applies ledger/component         │
│    mutations, emits post-commit records into               │
│    NativeList<DomainEvent> (persistent, cleared per frame). │
│    e.g. InventoryTransferApplierSystem (§13)                │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ L3: ECS→MessagePipe bridge  (SystemBase, main-thread)       │
│    CompleteDependency on the applier's handle, iterates    │
│    NativeList<DomainEvent>, publishes readonly struct       │
│    messages via injected IPublisher<DomainMessage>.         │
│    Zero-alloc publish path per MessagePipe design.          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ L4: Application subscribers  (VContainer-resolved,          │
│    managed, zero-alloc, DisposableBag-managed)              │
│    UITreasury, UIBuildingInspector, ToastService,           │
│    ActivityFeedService, AudioCueService, HUD, etc. all      │
│    subscribe via ISubscriber<DomainMessage>.                │
└─────────────────────────────────────────────────────────────┘
```

Hot path (L1+L2) is Burst/unmanaged. Boundary (L3) is the only main-thread sync point per domain. Application (L4) is fully managed and never touches ECS directly.

## 3. Per-domain pipes (one bus per domain, not one-global-bus)

| Domain             | L1 NativeQueue                          | L2 Applier                                            | L4 Message(s)                                                                                                 |
| ------------------ | --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Inventory**      | `NativeQueue<BankTransfer>` ✓           | `InventoryTransferApplierSystem` ✓                    | `InventoryChangedMessage`                                                                                     |
| **Combat**         | `NativeQueue<DamageCommand>`            | `DamageApplierSystem`                                 | `UnitDamagedMessage`, `UnitKilledMessage`, `ProjectileHitMessage`, `CombatBatchMessage` (aggregated)          |
| **Units**          | `NativeQueue<UnitLifecycleCommand>`     | `UnitLifecycleApplierSystem`                          | `UnitSpawnedMessage`, `UnitDiedMessage`, `UnitJobChangedMessage`, `UnitPossessedMessage`                      |
| **Buildings**      | `NativeQueue<BuildingLifecycleCommand>` | `BuildingLifecycleApplierSystem`                      | `BuildingPlacedMessage`, `ConstructionCompletedMessage`, `BuildingDestroyedMessage`, `BuildingStaffedMessage` |
| **Skills**         | `NativeQueue<SkillXpGain>`              | `SkillApplierSystem` (applies XP, computes level-ups) | `SkillXpGainedMessage`, `SkillLevelUpMessage`                                                                 |
| **Relief / Needs** | `NativeQueue<ReliefTransition>`         | `ReliefApplierSystem`                                 | `ReliefIntentChangedMessage` (eat / sleep / rest starts + ends)                                               |
| **World**          | `NativeQueue<HexStateDelta>`            | `HexStateApplierSystem`                               | `HexHarvestedMessage`, `HexDepletedMessage`, `HexRegrownMessage`                                              |
| **Activity Feed**  | _(none — L4 aggregator)_                | _(none)_                                              | `ActivityFeedLineMessage` (consumed by `ActivityFeedService`, published by the other bridges)                 |

The **Activity Feed becomes a subscriber**, not a producer. Inventory / combat / unit / building bridges publish their own domain messages; `ActivityFeedService` subscribes to several, translates to human-readable lines. One less crude bus, one more principled consumer.

## 4. Message shape rules

### 4.1 Struct, readonly, zero-alloc

```csharp
public readonly struct InventoryChangedMessage
{
    public readonly Entity Target;
    public readonly ushort ItemId;
    public readonly int    Delta;
    public readonly int    NewCount;  // post-commit; saves subscribers a lookup
    public readonly byte   BankType;  // 0=Capital, 1=Furnace, 2=Farm, 3=Barracks, 4=GoblinCave
}
```

- **`readonly struct`** — no field mutation after construction; MessagePipe boxes nothing on publish.
- **Value types only in the body** — no `string`, no `List<T>`, no managed arrays. If UI needs the item's display name it calls `ItemDB.GetNameKey(ItemId)` on receipt (main-thread, managed, fine).
- **Entity references** — valid until the end of the current frame. Subscribers that need to hold them across frames resolve to a stable key (e.g. Building.RootHex or UnitName) before storing.
- **Post-commit state included** (`NewCount`) — avoids subscribers racing back into ECS to read the ledger they were just told about.

### 4.2 Batch variants for high-volume streams

Combat damage hits can spike to 100+ per frame during a raid. Per-hit publish is fine throughput-wise (MessagePipe is zero-alloc), but subscribers like Toast / Audio may want coalescing:

```csharp
public readonly struct CombatBatchMessage
{
    public readonly int FrameId;
    public readonly int HitCount;
    // Subscribers that need detail: also subscribe to UnitDamagedMessage individually.
    // This message is for aggregate consumers (HUD threat meter, audio bus ducking).
}
```

**Rule:** publish per-event for detail-consumers (Toast, Log), additionally publish per-frame-aggregated for bulk-consumers (HUD, Audio). Low-rate domains (Buildings, Skills) skip the batch variant.

### 4.3 Key-based identity for cross-session consumers

Entity.Index is session-local. If we ever persist UI state or ship messages to Rust for logging, use stable identifiers:

- Unit → `Ulid` (already on UnitIdentity — TBD)
- Building → `Ulid` (TBD, but Building.RootHex + faction is stable today)
- Item stack → the `Uid` we already stamp per stack

Defer the Ulid identity story; today Entity is fine for UI-only subscribers.

## 5. Bridge implementation pattern

Every domain bridge follows this shape:

```csharp
[UpdateInGroup(typeof(EconomySystemGroup))]
[UpdateAfter(typeof(InventoryTransferApplierSystem))]
public partial class InventoryMessagePipeBridgeSystem : SystemBase
{
    IPublisher<InventoryChangedMessage> _publisher;

    protected override void OnCreate()
    {
        // Resolve the publisher via VContainer at OnCreate. RootLifetimeScope
        // registers IPublisher<T>/ISubscriber<T> per-message-type as
        // MessagePipe Singletons. See §6 below.
        _publisher = RootLifetimeScope.Container
            .Resolve<IPublisher<InventoryChangedMessage>>();
    }

    protected override void OnUpdate()
    {
        CompleteDependency();
        var events = SystemAPI.GetSingleton<InventoryChangedEvents>().List;
        for (int i = 0; i < events.Length; i++)
            _publisher.Publish(events[i]);
        events.Clear();
    }
}
```

Where `InventoryChangedEvents` is a Burst-safe singleton holding a `NativeList<InventoryChangedMessage>` that the applier populates immediately after committing each transfer. The bridge clears the list per frame.

**Invariants:**

- Bridge is `SystemBase` (main-thread). Publish path is managed; Burst can't reach `IPublisher`.
- Bridge runs **after** the applier, **before** any `PresentationSystemGroup` consumer that might read updated state.
- `CompleteDependency()` is the one explicit sync point per domain per frame. Scoped, not global.
- Applier populates the event list in-place while it already holds RW on the ledger — zero extra cost.

## 6. VContainer + MessagePipe wiring

MessagePipe's Unity integration uses builder syntax. One-line registration per message type at the root scope:

```csharp
public class RootLifetimeScope : LifetimeScope
{
    protected override void Configure(IContainerBuilder builder)
    {
        var options = builder.RegisterMessagePipe();

        // Inventory pipe
        builder.RegisterMessageBroker<InventoryChangedMessage>(options);

        // Combat pipe
        builder.RegisterMessageBroker<UnitDamagedMessage>(options);
        builder.RegisterMessageBroker<UnitKilledMessage>(options);
        builder.RegisterMessageBroker<CombatBatchMessage>(options);

        // Units pipe
        builder.RegisterMessageBroker<UnitSpawnedMessage>(options);
        builder.RegisterMessageBroker<UnitDiedMessage>(options);
        builder.RegisterMessageBroker<UnitJobChangedMessage>(options);

        // Buildings, Skills, Relief, World — same pattern.
    }
}
```

**Scope:** All message brokers registered at the **root** scope (session-wide). Scene-local messages (pause menu events, title-screen actions) can register at a child scope if needed.

## 7. Subscriber lifecycle — DisposableBag discipline

Every subscriber must dispose. The rule:

```csharp
public class UITreasury : IDisposable
{
    readonly DisposableBagBuilder _bag;

    [Inject]
    public UITreasury(ISubscriber<InventoryChangedMessage> sub)
    {
        _bag = DisposableBag.CreateBuilder();
        sub.Subscribe(OnInventoryChanged).AddTo(_bag);
    }

    void OnInventoryChanged(InventoryChangedMessage msg)
    {
        if (msg.BankType != BankType.Capital) return;
        // Update the treasury panel.
    }

    public void Dispose() => _bag.Build().Dispose();
}
```

**Rules:**

- Every `Subscribe` goes to a `DisposableBag`.
- Every class that subscribes implements `IDisposable`.
- VContainer auto-disposes on scene/lifetime tear-down.
- **CI / lint check:** grep for `sub.Subscribe(` without `.AddTo(` in UI layer — flag as error.

## 8. Frame timing

```
TickN:
  InitializationSystemGroup (ItemDBBootstrap, FarmInit, etc.)
  SimulationSystemGroup:
    BehaviorSystemGroup           — producers enqueue commands
    MovementSystemGroup           — unit movement
    CombatSystemGroup             — damage producers enqueue DamageCommand
    EconomySystemGroup:
      (producers)                  — more enqueues
      InventoryTransferApplierSystem  [L2, OrderLast]
      InventoryMessagePipeBridge      [L3, UpdateAfter(Applier)]
      DamageApplierSystem             [L2]
      CombatMessagePipeBridge         [L3]
      ... (per domain)
    CleanupSystemGroup            — DeadTag reaping after events published
  PresentationSystemGroup          — Rendering / UI sync
  UI Update loop (MonoBehaviours) — subscribers receive on main thread
```

Each applier/bridge pair is tight: the applier runs, Dep handle produced, bridge runs on the same frame with CompleteDependency. UI subscribers receive within the same frame they were published.

## 9. Performance + safety acceptance bar

Before a domain's pipe is considered "done":

**Performance:**

- [ ] `_publisher.Publish(msg)` is zero-alloc (MessagePipe default broker path).
- [ ] `NativeList<DomainEvent>` capacity tuned to avoid growth in a busy-tick (init with reasonable default, e.g. `capacityInit = 64`).
- [ ] High-rate streams ship a batch variant (`CombatBatchMessage`) in addition to per-event.
- [ ] Profiler shows bridge `OnUpdate` < 0.1ms at peak tick (~200 events/frame).

**Safety:**

- [ ] Applier is the sole RW writer of the domain's ECS state (same rule as §13).
- [ ] Bridge completes `state.Dependency` exactly once; no other system Completes on the domain's components.
- [ ] Every subscriber uses `DisposableBag`.
- [ ] Grep check: zero `IPublisher<T>.Publish` calls from inside Burst code (compile error anyway, but lint it).
- [ ] Grep check: zero `ISubscriber<T>.Subscribe(...)` without `.AddTo(` in `Assets/_RareIcon/Scripts/UI` / `Services`.

**Observability:**

- [ ] Every domain publishes to a named subscriber `DebugRecorder` that buffers the last N messages for in-game console inspection.
- [ ] Subscriber leak detection: `RootLifetimeScope.Dispose` logs any non-disposed bag.

## 10. Pilot — Inventory first

Inventory already has L1 (`NativeQueue<BankTransfer>`) and L2 (`InventoryTransferApplierSystem`) as of §13. Remaining scope for the pilot:

**Step 1 — Event record + singleton**

- `readonly struct InventoryChangedMessage { Entity Target; ushort ItemId; int Delta; int NewCount; byte BankType; }` in `Messages/InventoryMessages.cs`.
- `struct InventoryChangedEvents : IComponentData { public NativeList<InventoryChangedMessage> List; }` allocated alongside `BankTransferQueue` in `ItemDBBootstrapSystem`.

**Step 2 — Applier populates the list**

- `InventoryTransferApplierSystem.ApplyBankTransfersJob` writes an `InventoryChangedMessage` per transfer after each `Apply(...)` call. Burst-safe — it's a `NativeList` write.

**Step 3 — Bridge**

- New `InventoryMessagePipeBridgeSystem` (SystemBase, `UpdateAfter(InventoryTransferApplierSystem)`): completes dep, iterates list, publishes, clears.

**Step 4 — VContainer registration**

- `RootLifetimeScope.Configure` adds `builder.RegisterMessagePipe()` + `RegisterMessageBroker<InventoryChangedMessage>(options)`.

**Step 5 — Convert UI consumers**

- `UITreasury` stops polling `GetBuffer<CapitalLedger>`; subscribes to `InventoryChangedMessage` + filters `BankType == Capital`.
- `UIBuildingInspector` same pattern, filter by target entity.
- `UIBuildingPalette` affordability check: this one still needs to poll (it evaluates against current state for enable/disable); keep `GetBuffer` there, document the exception.

**Step 6 — Retire ActivityFeedWriterSystem**

- Its feed-line emissions for deposit/pickup/craft become `ActivityFeedService` subscribers of `InventoryChangedMessage`. Burst-side `ActivityFeedWriterSystem` + native list stay as a temporary pass-through, or delete if all emissions are inventory-driven.

**Step 7 — Acceptance**

- Run §9 checklist against the Inventory pipe.
- Playtest: pickup / deposit / consume updates HUD live without `GetBuffer` polling in the panel.

Pilot estimate: 1 focused session.

## 11. Rollout after pilot

Once Inventory pilot proves the pattern (performance + safety + subscriber DX all land), roll the other domains in this order:

1. **Skills** — simplest (XP gain → level up derived in applier). Good second candidate.
2. **Units** — lifecycle (spawn/die). Medium complexity; replaces raw `DeadTag` polling.
3. **Buildings** — lifecycle + construction complete. Low rate, low risk.
4. **Combat** — last because highest volume; needs batch variant and careful profiling.
5. **Relief / Needs** — low priority, nice-to-have for toast UX.
6. **World** — hex regrow + depletion events for minimap / tooltip refresh.

Each rollout is ~half a session. `ActivityFeedService` becomes the de-facto consumer taxonomy: any time we add a new feed line, add a new subscriber.

## 12. Bridge back-pressure + recording (future)

The `NativeList<DomainEvent>` in the applier is shared mutable state; the bridge clears it every frame. If the game ever hitches and the bridge runs on frame N but the applier has already populated for frame N+1, we lose events. Mitigations:

- **Double-buffer** — applier writes to list A, bridge reads/clears list A, next frame the applier writes to list B, bridge reads B. Rotate.
- **Ring buffer** — fixed capacity, consumer-owns-read-cursor. Overwrites oldest on full; loses detail but never hitches.
- **Unbounded `NativeQueue<DomainEvent>`** — same pattern as L1. Simpler, just another MPSC queue.

Defer until profiling shows a real problem. Start with simple `NativeList + Clear` on main-thread bridge.

For debugging, every bridge writes its last N messages to a `DomainEventRecorder` (managed ring buffer, editor-only) so we can scrub through "what fired this frame" in a dev console.

## 13. Integration with existing infrastructure

- **R3** (already installed via Cysharp UPM) — MessagePipe subscribers can convert to `Observable<T>` via the R3 bridge for operator chains (throttle, distinct, buffer). Useful for things like "debounce rapid deposits into one toast".
- **ZString** (already installed) — subscriber-side string formatting for UI labels stays zero-alloc.
- **UniTask** — async subscribers (e.g. "wait for next UnitKilledMessage with Faction==Hostile") handled via the `IAsyncSubscriber<T>` variant.
- **VContainer** — already wired; adding message brokers is a one-liner.
- **ActivityFeedService** — current crude v1 of this pattern; becomes the reference consumer post-migration.
- **Rust FFI** — a dedicated "FfiRecorderSubscriber" could forward events to the Rust persistence layer for save/replay. Out of scope for first pass, but the message shapes are designed to serialize cleanly (no managed refs).

## 14. Open decisions to lock before implementation

- [ ] **Event list storage:** `NativeList<T>` on a singleton (simple) vs `NativeQueue<T>` (double-draining pattern, symmetric with L1)?
    - Pick: `NativeList<T>`. Bridge consumes sequentially, applier appends. Simpler than MPSC.
- [ ] **Per-domain bridge vs shared bridge:** one bridge system per domain (clear, verbose) or one mega-bridge that polls every domain's event list?
    - Pick: per-domain. Easier to reason about frame timing; cheap because idle bridges early-out on empty list.
- [ ] **Subscriber registration timing:** VContainer constructor-inject (current Rareicon pattern) vs service locator?
    - Pick: VContainer constructor-inject. Already how every service wires.
- [ ] **Message namespace:** `RareIcon.Messages.Inventory` vs flat `RareIcon`?
    - Pick: `RareIcon.Messages` + one file per domain (`InventoryMessages.cs`, `CombatMessages.cs`).
- [ ] **Aggregator timing:** per-frame batch messages published same-tick as per-event ones, or one frame delayed?
    - Pick: same tick, after per-event publish. Subscribers that care about detail get detail; subscribers that care about summary get summary from the same frame.

---

_Author: drafted during the §13 single-writer ledger + §14 MessagePipe layering conversation. Executes after sign-off._
