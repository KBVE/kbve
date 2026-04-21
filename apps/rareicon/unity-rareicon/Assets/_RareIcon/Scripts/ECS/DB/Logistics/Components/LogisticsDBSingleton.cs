using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Authoritative logistics state: committed balances, in-flight reservations, per-frame deliveries + pending deltas, per-unit pack deliveries. CommittedEvents is populated by LedgerCommitJob with one entry per committed (bank,item) key and drained by InventoryMessagePipeBridgeSystem each frame. PipelineHandle serializes all pipeline phases; each system combines it into state.Dependency before scheduling and stores its new handle back.</summary>
    public struct LogisticsDBSingleton : IComponentData
    {
        public NativeParallelHashMap<LedgerKey, int>                    CurrentAmounts;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations;
        public NativeParallelMultiHashMap<LedgerKey, int>               PendingDeltas;
        public NativeParallelMultiHashMap<Entity, PackDelivery>         PackDeliveries;
        public NativeStream                                             Deliveries;
        public NativeList<InventoryChangedMessage>                      CommittedEvents;
        public JobHandle                                                PipelineHandle;
    }
}
