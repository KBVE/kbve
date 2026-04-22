using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes <see cref="TenderMultiplier"/>.Value = 1 when any Craftsman-intent unit stands on a Dock's hex; otherwise 0. <see cref="DockProductionSystem"/> reads the multiplier to halve the boat-build cadence while the dock is manned. Mirrors <see cref="FarmTenderScanSystem"/>.</summary>
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
            var tendedHexes = new NativeHashSet<int2>(8, Allocator.TempJob);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<UnitMovement>>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Craftsman) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            state.Dependency = new DockTenderJob
            {
                TendedHexes = tendedHexes.AsReadOnly(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(DockTag))]
    public partial struct DockTenderJob : IJobEntity
    {
        [ReadOnly] public NativeHashSet<int2>.ReadOnly TendedHexes;

        void Execute(in Building building, ref TenderMultiplier tender)
        {
            tender.Value = TendedHexes.Contains(building.RootHex) ? 1f : 0f;
        }
    }
}
