using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Lifecycle event kinds emitted by the Buildings domain. Kept narrow — bespoke state (production cycle ticks, reservation deltas, etc.) stays on the per-type systems and is not broadcast through the general event channel.</summary>
    public enum BuildingEventKind : byte
    {
        Spawned              = 0,
        ConstructionComplete = 1,
        TierChanged          = 2,
        Damaged              = 3,
        Repaired             = 4,
        Destroyed            = 5,
        Demolished           = 6,
    }

    /// <summary>One lifecycle event produced by the per-type systems during the frame. Consumed later the same frame by <see cref="BuildingsBridgeSystem"/> on the main thread for MessagePipe publishing. Burst-friendly + blittable.</summary>
    public struct BuildingEvent
    {
        public BuildingEventKind Kind;
        public Entity Entity;
        public byte   Type;           // BuildingType
        public int2   RootHex;
        public byte   OwnerFaction;
        public byte   Tier;           // Post-change tier (for TierChanged); 0 for others
        public int    HealthDelta;    // signed; populated for Damaged / Repaired
        public ushort HealthCurrent;  // post-mutation value
    }

    /// <summary>Serialized record of a building in an unloaded chunk. Phase 4 ghost-sim simulator advances per-record state at low cadence; reload path reads the record + applies accrued deltas when the chunk streams back in. All fields blittable so the list crosses the worker-thread boundary cleanly. Ledger stored inline as 4 (ItemId, Count) slots — 99%+ of real-world buildings fit in 4 distinct items; overflow simply truncates (loss acceptable for offline state).</summary>
    public struct UnloadedBuildingRecord
    {
        public byte   Type;
        public int2   RootHex;
        public byte   OwnerFaction;
        public ushort Health;
        public ushort HealthMax;
        public byte   Tier;
        public uint   LastTickTurn;
        public float  AccruedProduction;
        public float  AccruedInput;
        public byte   Flags;

        /// <summary>Seconds remaining on the active ProductionRecipe cycle at snapshot time; decays while offline. Hydrate restores CycleEndsAt = now + this value so a Farm that was 2 s away from completing its cycle resumes on the 2 s mark instead of starting fresh.</summary>
        public float RecipeCycleRemaining;

        /// <summary>Inline ledger snapshot — 4 slots of (ItemId, Count). Preserves the per-type ledger across unload so stored resources aren't lost. See <c>HexChunkSystem.SnapshotBuildingsInChunk</c> for the per-type buffer→slot mapping.</summary>
        public ushort Slot0Id; public ushort Slot0Count;
        public ushort Slot1Id; public ushort Slot1Count;
        public ushort Slot2Id; public ushort Slot2Count;
        public ushort Slot3Id; public ushort Slot3Count;

        /// <summary>Combat snapshot — copied from the live <see cref="MeleeAttack"/> / <see cref="RangedAttack"/> / <see cref="SpellCast"/> component at unload time, for tower / keep / castle types that auto-fire. Ghost-sim combat reads this without needing the managed component back. <see cref="AttackKind"/> dispatches against <see cref="CombatAttackKind"/>; non-attacking buildings leave the kind at <see cref="CombatAttackKind.None"/>.</summary>
        public float  AttackDamage;
        public float  AttackRange;
        public float  AttackCooldown;
        public float  TimeSinceAttack;
        public byte   AttackKind;
        public byte   TargetMode;
    }

    /// <summary>Flag bits for <see cref="UnloadedBuildingRecord.Flags"/>.</summary>
    public static class UnloadedBuildingFlags
    {
        public const byte HadRecipe     = 1 << 0;
        public const byte InHostileTerritory = 1 << 1;
        public const byte Reserved2     = 1 << 2;
        public const byte Reserved3     = 1 << 3;
    }

    /// <summary>
    /// Authoritative Buildings domain state.
    ///
    /// <para><c>Events</c> is the MessagePipe bridge channel — per-type
    /// systems enqueue lifecycle events during their existing Burst
    /// jobs; <see cref="BuildingsBridgeSystem"/> drains it on the main
    /// thread during Presentation and publishes via
    /// <see cref="MessagePipe.GlobalMessagePipe"/>.</para>
    ///
    /// <para><c>Unloaded</c> is the offline-chunk registry (Phase 4).
    /// Today it's allocated but not populated — reserved for the
    /// ghost-simulation pass where unloaded buildings accumulate
    /// production / health deltas on a worker thread instead of
    /// unloading + rebuilding from scratch every reload.</para>
    ///
    /// <para>Both containers use
    /// <see cref="Allocator.Persistent"/> since they outlive frames.
    /// Single-buffer Events is race-free because producer
    /// (per-type systems, Sim/Cleanup phases) and consumer
    /// (Bridge, Presentation) never run concurrently within a frame.</para>
    /// </summary>
    public struct BuildingsDBSingleton : IComponentData
    {
        public NativeList<BuildingEvent>          Events;
        public NativeList<UnloadedBuildingRecord> Unloaded;

        /// <summary>Combined writer handle for <see cref="Events"/>. Each producer system reads this, combines into <c>state.Dependency</c>, schedules its parallel writer, then writes the new handle back. Bridge consumer Completes it before draining. Replaces the framework's auto-chaining for ParallelWriter handles, which doesn't track across systems.</summary>
        public JobHandle EventsWriteHandle;
    }
}
