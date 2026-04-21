using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 2: for each distinct source LedgerKey, sorts reservations by (Priority DESC, Tick ASC, Requester.Index ASC), grants up to available balance, writes source-side negative deltas into PendingDeltas and emits a DeliveryRecord per grant into the Deliveries stream.</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup))]
    [UpdateAfter(typeof(LogisticsDomainSystem))]
    public partial struct ReservationResolveSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            state.Dependency = new ReservationResolveJob
            {
                Reservations   = db.Reservations,
                CurrentAmounts = db.CurrentAmounts,
                PendingDeltas  = db.PendingDeltas.AsParallelWriter(),
                DeliveryWriter = db.Deliveries.AsWriter(),
            }.Schedule(dep);

            db.PipelineHandle = state.Dependency;
        }
    }

    [BurstCompile]
    public struct ReservationResolveJob : IJob
    {
        [ReadOnly] public NativeParallelMultiHashMap<LedgerKey, ReservationRecord> Reservations;
        [ReadOnly] public NativeParallelHashMap<LedgerKey, int>                    CurrentAmounts;
        public NativeParallelMultiHashMap<LedgerKey, int>.ParallelWriter            PendingDeltas;
        public NativeStream.Writer                                                  DeliveryWriter;

        public void Execute()
        {
            DeliveryWriter.BeginForEachIndex(0);

            var uniqueKeys = Reservations.GetUniqueKeyArray(Allocator.Temp);
            var keys = uniqueKeys.Item1;
            int keyCount = uniqueKeys.Item2;

            var bucket = new NativeList<ReservationRecord>(8, Allocator.Temp);

            for (int k = 0; k < keyCount; k++)
            {
                var key = keys[k];

                CurrentAmounts.TryGetValue(key, out var available);

                bucket.Clear();
                if (Reservations.TryGetFirstValue(key, out var rec, out var it))
                {
                    do { bucket.Add(rec); }
                    while (Reservations.TryGetNextValue(out rec, ref it));
                }

                SortByPriority(bucket);

                for (int i = 0; i < bucket.Length; i++)
                {
                    var r = bucket[i];
                    if (r.Amount <= 0) continue;
                    if (available <= 0) break;

                    int grant = math.min(r.Amount, available);
                    available -= grant;

                    PendingDeltas.Add(key, -grant);

                    DeliveryWriter.Write(new DeliveryRecord
                    {
                        Source    = key,
                        Dest      = new LedgerKey { Bank = r.Dest, ItemId = key.ItemId },
                        Requester = r.Requester,
                        Granted   = grant,
                        Intent    = r.Intent,
                    });
                }
            }

            bucket.Dispose();
            keys.Dispose();

            DeliveryWriter.EndForEachIndex();
        }

        static void SortByPriority(NativeList<ReservationRecord> list)
        {
            for (int i = 1; i < list.Length; i++)
            {
                var cur = list[i];
                int j = i - 1;
                while (j >= 0 && Compare(cur, list[j]) < 0)
                {
                    list[j + 1] = list[j];
                    j--;
                }
                list[j + 1] = cur;
            }
        }

        static int Compare(in ReservationRecord a, in ReservationRecord b)
        {
            if (a.Priority != b.Priority) return b.Priority - a.Priority;
            if (a.Tick != b.Tick) return a.Tick < b.Tick ? -1 : 1;
            return a.Requester.Index - b.Requester.Index;
        }
    }
}
