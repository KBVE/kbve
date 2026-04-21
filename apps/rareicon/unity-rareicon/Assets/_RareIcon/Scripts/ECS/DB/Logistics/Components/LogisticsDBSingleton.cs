using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Authoritative logistics state: committed balances, in-flight reservations, per-frame deliveries + pending deltas.</summary>
    public struct LogisticsDBSingleton : IComponentData
    {
        public NativeParallelHashMap<LedgerKey, int>                    CurrentAmounts;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations;
        public NativeParallelMultiHashMap<LedgerKey, int>               PendingDeltas;
        public NativeStream                                             Deliveries;
    }
}
