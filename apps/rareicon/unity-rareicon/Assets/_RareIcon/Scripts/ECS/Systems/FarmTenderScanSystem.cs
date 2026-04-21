using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes TenderMultiplier.Value = 1 when any Farmer-intent unit stands on the farm's 7-hex footprint; otherwise 0. ProductionSystem reads TenderMultiplier when starting a recipe cycle to halve the duration. Main-thread hex-snapshot + parallel per-farm multiplier writes.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct FarmTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes = new NativeHashSet<int2>(16, Allocator.TempJob);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<ProfessionIntent>, RefRO<UnitMovement>>())
            {
                if (intent.ValueRO.Kind != ProfessionKind.Farmer) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            state.Dependency = new FarmTenderJob
            {
                TendedHexes = tendedHexes.AsReadOnly(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmTenderJob : IJobEntity
    {
        [ReadOnly] public NativeHashSet<int2>.ReadOnly TendedHexes;

        void Execute(in Building building, ref TenderMultiplier tender)
        {
            bool isTended = false;
            var root = building.RootHex;
            for (int dq = -1; dq <= 1 && !isTended; dq++)
            for (int dr = -1; dr <= 1 && !isTended; dr++)
            {
                if (dq + dr < -1 || dq + dr > 1) continue;
                if (TendedHexes.Contains(new int2(root.x + dq, root.y + dr))) isTended = true;
            }
            tender.Value = isTended ? 1f : 0f;
        }
    }
}
