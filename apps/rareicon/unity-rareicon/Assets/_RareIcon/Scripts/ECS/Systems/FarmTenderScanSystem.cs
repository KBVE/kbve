using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes TenderMultiplier.Value = 1 when any Farmer-intent unit stands on the farm's 7-hex footprint; otherwise 0. ProductionSystem hard-gates new Farm cycles on tender > 0 (no Farmer = no production) and additionally halves the duration when tended, so the worker is required to start a cycle and rewarded for staying through it. Prep scan runs as a parallel IJobEntity into NativeParallelHashSet.ParallelWriter, replacing the prior main-thread foreach.</summary>
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
            var tendedHexes = new NativeParallelHashSet<int2>(256, Allocator.TempJob);

            var prepHandle = new CollectFarmerHexesJob
            {
                Writer = tendedHexes.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new FarmTenderJob
            {
                TendedHexes = tendedHexes,
            }.ScheduleParallel(prepHandle);

            state.Dependency = tendedHexes.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CollectFarmerHexesJob : IJobEntity
    {
        public NativeParallelHashSet<int2>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Farmer) return;
            Writer.Add(movement.CurrentHex);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmTenderJob : IJobEntity
    {
        [ReadOnly] public NativeParallelHashSet<int2> TendedHexes;

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
