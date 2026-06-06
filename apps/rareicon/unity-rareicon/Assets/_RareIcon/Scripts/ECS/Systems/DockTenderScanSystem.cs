using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes <see cref="TenderMultiplier"/>.Value = 1 when any Craftsman-intent unit stands on a Dock's hex; otherwise 0. <see cref="DockProductionSystem"/> reads the multiplier to halve the boat-build cadence while the dock is manned. Prep scan runs as a parallel IJobEntity into NativeParallelHashSet.ParallelWriter, replacing the prior main-thread foreach.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct DockTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes = new NativeParallelHashSet<int2>(256, Allocator.TempJob);

            var prepHandle = new CollectCraftsmanHexesJob
            {
                Writer = tendedHexes.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new DockTenderJob
            {
                TendedHexes = tendedHexes,
            }.ScheduleParallel(prepHandle);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CollectCraftsmanHexesJob : IJobEntity
    {
        public NativeParallelHashSet<int2>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Craftsman) return;
            Writer.Add(movement.CurrentHex);
        }
    }

    [BurstCompile]
    [WithAll(typeof(DockTag))]
    public partial struct DockTenderJob : IJobEntity
    {
        [ReadOnly] public NativeParallelHashSet<int2> TendedHexes;

        void Execute(in Building building, ref TenderMultiplier tender)
        {
            tender.Value = TendedHexes.Contains(building.RootHex) ? 1f : 0f;
        }
    }
}
