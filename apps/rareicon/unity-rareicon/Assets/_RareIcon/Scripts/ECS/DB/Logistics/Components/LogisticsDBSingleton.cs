using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Authoritative logistics state: committed balances, in-flight reservations, per-frame deliveries + pending deltas. PipelineHandle is the serialized handle across all pipeline phases; each system combines it into state.Dependency before scheduling and stores its new handle back.</summary>
    public struct LogisticsDBSingleton : IComponentData
    {
        public NativeParallelHashMap<LedgerKey, int>                    CurrentAmounts;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations;
        public NativeParallelMultiHashMap<LedgerKey, int>               PendingDeltas;
        public NativeStream                                             Deliveries;
        public JobHandle                                                PipelineHandle;
    }
}
