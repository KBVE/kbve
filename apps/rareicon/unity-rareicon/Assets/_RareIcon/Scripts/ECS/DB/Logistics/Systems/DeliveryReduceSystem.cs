using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Phase 3: drains the Deliveries stream and accumulates per-destination positive deltas into PendingDeltas. Skips records whose Dest.Bank is Entity.Null (out-of-DB pack-side recipient).</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup))]
    [UpdateAfter(typeof(ReservationResolveSystem))]
    public partial struct DeliveryReduceSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            state.Dependency = new DeliveryReduceJob
            {
                DeliveryReader = db.Deliveries.AsReader(),
                PendingDeltas  = db.PendingDeltas.AsParallelWriter(),
            }.Schedule(dep);

            db.PipelineHandle = state.Dependency;
        }
    }

    [BurstCompile]
    public struct DeliveryReduceJob : IJob
    {
        public NativeStream.Reader                                       DeliveryReader;
        public NativeParallelMultiHashMap<LedgerKey, int>.ParallelWriter PendingDeltas;

        public void Execute()
        {
            int forEachCount = DeliveryReader.ForEachCount;
            for (int b = 0; b < forEachCount; b++)
            {
                int count = DeliveryReader.BeginForEachIndex(b);
                for (int i = 0; i < count; i++)
                {
                    var d = DeliveryReader.Read<DeliveryRecord>();
                    if (d.Dest.Bank == Entity.Null) continue;
                    if (d.Granted <= 0) continue;
                    PendingDeltas.Add(d.Dest, d.Granted);
                }
                DeliveryReader.EndForEachIndex();
            }
        }
    }
}
