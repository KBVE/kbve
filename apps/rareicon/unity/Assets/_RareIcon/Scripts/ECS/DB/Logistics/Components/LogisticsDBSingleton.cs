using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Authoritative logistics state: committed balances, in-flight reservations, per-frame deliveries + pending deltas, per-unit pack deliveries. §0 double-buffer: LedgerCommitJob appends to WriteBuffer; LogisticsDomainSystem swaps WriteBuffer↔ReadBuffer each tick so InventoryMessagePipeBridgeSystem drains ReadBuffer with zero write contention. PipelineHandle serialises all pipeline phases; each system combines it into state.Dependency before scheduling and stores its new handle back.</summary>
    public struct LogisticsDBSingleton : IComponentData
    {
        public NativeParallelHashMap<LedgerKey, int>                    CurrentAmounts;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations;
        public NativeParallelMultiHashMap<LedgerKey, int>               PendingDeltas;
        public NativeParallelMultiHashMap<Entity, PackDelivery>         PackDeliveries;
        public NativeStream                                             Deliveries;
        public NativeList<InventoryChangedMessage>                      WriteBuffer;
        public NativeList<InventoryChangedMessage>                      ReadBuffer;
        public JobHandle                                                PipelineHandle;
    }
}
