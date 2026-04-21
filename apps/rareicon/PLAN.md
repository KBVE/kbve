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
| §17+  | Subsequent domains (Combat, Skills, etc.)              | Future — reuse `ECS/DB/<Domain>/` pattern                                         |

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

## §14 — MessagePipe boundary (planned)

Detailed plan in [MESSAGING.md](MESSAGING.md). Four-layer model (NativeQueue → Burst applier → SystemBase bridge → MessagePipe subscribers). Per-domain typed pipes, DisposableBag discipline. Shipped for Logistics (§15-C); Professions (§16) follows the same pattern.

## §12 / §13 — shipped

Full write-up: [INVENTORY.md](INVENTORY.md). Summary: unit-side `PackSlot` split, per-bank ledger buffers (Capital/Farm/Furnace/Barracks/GoblinCave), ULID-keyed stacks, `BankLedgerBase` shared-layout via `Reinterpret<T>`, `InventoryTransferApplierSystem` as the single writer drain, `BankTransfer` as the transport record.

## Reference

- [INVENTORY.md](INVENTORY.md) — §12 / §13 implementation record.
- [MESSAGING.md](MESSAGING.md) — §14 MessagePipe boundary plan.
- [MAINTHREAD.md](MAINTHREAD.md) — main-thread budget notes.
