using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes TenderMultiplier.Value = 1 when any Farmer-intent unit stands on the farm's 7-hex footprint; otherwise 0. ProductionSystem reads TenderMultiplier when starting a recipe cycle to halve the duration.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial struct FarmTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes = new NativeHashSet<int2>(16, Allocator.Temp);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>())
            {
                if (intent.ValueRO.Kind != JobKind.Farmer) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            foreach (var (building, tender) in
                     SystemAPI.Query<RefRO<Building>, RefRW<TenderMultiplier>>()
                              .WithAll<FarmTag>())
            {
                bool isTended = false;
                var root = building.ValueRO.RootHex;
                for (int dq = -1; dq <= 1 && !isTended; dq++)
                for (int dr = -1; dr <= 1 && !isTended; dr++)
                {
                    if (dq + dr < -1 || dq + dr > 1) continue;
                    if (tendedHexes.Contains(new int2(root.x + dq, root.y + dr))) isTended = true;
                }
                tender.ValueRW.Value = isTended ? 1f : 0f;
            }

            tendedHexes.Dispose();
        }
    }
}
