using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Op kind for <see cref="HexIndexRequest"/>. Add inserts a fresh mapping; Remove drops it; Clear wipes the entire index (used by WorldReset flows, not routine gameplay).</summary>
    public enum HexIndexOp : byte
    {
        Add    = 0,
        Remove = 1,
        Clear  = 2,
    }

    /// <summary>One pending mutation on the HexDB lookup. Producers (HexChunkSystem spawn/despawn paths, unit teleport, admin commands) append to <see cref="HexDBSingleton.Pending"/> on the main thread; <see cref="HexDomainSystem"/> drains the buffer in a Burst job each tick so every reader pays zero sync-point cost. Blittable — safe across the main/Burst boundary.</summary>
    public struct HexIndexRequest
    {
        public int2   Coord;
        public Entity Entity;
        public HexIndexOp Op;
    }

    /// <summary>Event kinds emitted by the HexDB drain. Add = a hex entered the index; Remove = a hex left. Clear is not emitted as an event (rare admin flow; subscribers regenerate from Lookup directly).</summary>
    public enum HexEventKind : byte
    {
        Added   = 0,
        Removed = 1,
    }

    /// <summary>One lifecycle event produced inside <see cref="HexDomainSystem"/>'s drain. Consumed later the same frame by <see cref="HexBridgeSystem"/> on the main thread, which publishes <c>HexChangedMessage</c> via GlobalMessagePipe for managed UI / gameplay reactors.</summary>
    public struct HexEvent
    {
        public HexEventKind Kind;
        public int2         Coord;
        public Entity       Entity;
    }

    /// <summary>
    /// Authoritative Hex domain state.
    ///
    /// <para><c>Lookup</c> is the coord → entity index every downstream
    /// system reads (pathing, harvest, targeting, UI hover). Never write
    /// to it directly — enqueue into <c>Pending</c> via
    /// <see cref="HexDB"/> helpers and let <see cref="HexDomainSystem"/>
    /// apply the change inside its Burst drain job. That way DOTS's job
    /// dependency graph tracks the read-vs-write edges automatically and
    /// no caller stalls the scheduler with a manual
    /// GetSingletonRW-as-barrier hack.</para>
    ///
    /// <para>Both containers use <see cref="Allocator.Persistent"/>
    /// because they outlive individual frames. <c>Pending</c> is
    /// capped at a soft ceiling; if a burst of spawns exceeds it the
    /// system logs + continues (map just accepts the growth, capacity
    /// bumps automatically).</para>
    ///
    /// <para>Future offloaded hex tile management (streaming ring /
    /// persistence hydrate / authority-swap chunk loads) plugs in here
    /// by emitting HexIndexRequests from a worker-thread job instead of
    /// the main-thread HexChunkSystem. Lookup itself never crosses
    /// threads outside the job graph.</para>
    /// </summary>
    public struct HexDBSingleton : IComponentData
    {
        public NativeHashMap<int2, Entity> Lookup;
        public NativeList<HexIndexRequest> Pending;

        /// <summary>Single-buffer event channel: drain appends during Initialization, bridge drains during Presentation. No cross-frame contention since producers + consumers never run at the same phase.</summary>
        public NativeList<HexEvent> Events;
    }
}
