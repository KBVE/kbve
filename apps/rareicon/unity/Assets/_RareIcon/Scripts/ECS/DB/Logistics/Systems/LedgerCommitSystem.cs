using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 4: sole writer of CurrentAmounts. Walks unique keys in PendingDeltas, sums values per key, applies the result clamped at zero. Runs as a single IJob to keep the authoritative map single-writer.</summary>
    [UpdateInGroup(typeof(LogisticsEndGroup))]
    [UpdateAfter(typeof(DeliveryReduceSystem))]
    public partial struct LedgerCommitSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            state.Dependency = new LedgerCommitJob
            {
                PendingDeltas  = db.PendingDeltas,
                CurrentAmounts = db.CurrentAmounts,
                WriteBuffer    = db.WriteBuffer,
            }.Schedule(dep);

            db.PipelineHandle = state.Dependency;
        }
    }

    [BurstCompile]
    public struct LedgerCommitJob : IJob
    {
        [ReadOnly] public NativeParallelMultiHashMap<LedgerKey, int> PendingDeltas;
        public NativeParallelHashMap<LedgerKey, int>                 CurrentAmounts;
        public NativeList<InventoryChangedMessage>                   WriteBuffer;

        public void Execute()
        {
            var unique = PendingDeltas.GetUniqueKeyArray(Allocator.Temp);
            var keys = unique.Item1;
            int keyCount = unique.Item2;

            for (int k = 0; k < keyCount; k++)
            {
                var key = keys[k];
                int sum = 0;
                if (PendingDeltas.TryGetFirstValue(key, out var v, out var it))
                {
                    do { sum += v; }
                    while (PendingDeltas.TryGetNextValue(out v, ref it));
                }
                if (sum == 0) continue;

                CurrentAmounts.TryGetValue(key, out var current);
                int updated = math.max(0, current + sum);
                CurrentAmounts[key] = updated;

                LogisticsEventSink.Add(ref WriteBuffer, key.Bank, key.ItemId, sum, updated);
            }

            keys.Dispose();
        }
    }
}
