using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Phase 5 scaffold — advances Hunger / Fatigue / Health on units
    /// stored in the Rust ghost-unit FFI while their owning chunk is
    /// offline.
    ///
    /// <para>Goal: when the player returns to a long-abandoned region,
    /// wild animals have grown hungry + starved, hostile patrol squads
    /// have moved to new patrol anchors, tamed livestock have produced
    /// eggs/milk proportional to offline time. Matches the building
    /// ghost-sim pattern in <see cref="BuildingsGhostSimSystem"/>.</para>
    ///
    /// <para>Blocked on Rust FFI schema extension — <c>FfiGhostUnit</c>
    /// currently exposes only {id, type, position, health, 4 inv slots}.
    /// Hunger/Fatigue/Energy + their Max + PerSecond fields need to be
    /// added to the struct before this system can advance them. Once the
    /// schema lands, OnUpdate walks every chunk offset under the world's
    /// streaming center (configurable), drains into a <c>NativeArray</c>,
    /// applies <c>WorldClock.AbsSeconds</c> delta per field, pushes the
    /// mutated records back via <c>SaveUnit</c>.</para>
    ///
    /// <para>Threading: the drain/push is per-chunk and lock-free on the
    /// Rust side (internally <c>Arc&lt;Mutex&lt;_&gt;&gt;</c>), so the
    /// C# job runs as <c>IJob.Schedule</c> on a worker thread. Zero
    /// main-thread contention — consistent with the rest of the
    /// parallel-world architecture.</para>
    ///
    /// <para>Server-only in multiplayer: unit ghost state is
    /// authority-owned; clients observe live units via NetCode
    /// replication when the chunk streams in.</para>
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ServerSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitsGhostSimSystem : SystemBase
    {
        protected override void OnCreate()
        {
            // Disable until the FFI schema extension lands. Flip back
            // on by removing this line + implementing OnUpdate.
            Enabled = false;
        }

        protected override void OnUpdate()
        {
            // TODO(rust-ffi): iterate chunks within streaming radius,
            // pull FfiGhostUnit batches via NativeWorld.TakeUnitsInChunk,
            // advance Hunger/Fatigue/Energy inside a Burst IJob using
            // WorldClock.AbsSeconds delta, push results back via SaveUnit.
        }
    }
}
