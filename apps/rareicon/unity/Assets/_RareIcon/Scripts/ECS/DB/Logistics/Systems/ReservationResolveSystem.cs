using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [UpdateInGroup(typeof(LogisticsEndGroup), OrderFirst = true)]
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
                PackDeliveries = db.PackDeliveries.AsParallelWriter(),
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
        public NativeParallelMultiHashMap<Entity, PackDelivery>.ParallelWriter      PackDeliveries;
        public NativeStream.Writer                                                  DeliveryWriter;

        public void Execute()
        {
            DeliveryWriter.BeginForEachIndex(0);

            var unique = Reservations.GetUniqueKeyArray(Allocator.Temp);
            var keys = unique.Item1;
            int keyCount = unique.Item2;

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

                    switch ((ReservationIntent)r.Intent)
                    {
                        case ReservationIntent.Pickup:
                        case ReservationIntent.Refill:
                        {
                            if (available <= 0) break;
                            int grant = math.min(r.Amount, available);
                            available -= grant;
                            PendingDeltas.Add(key, -grant);
                            PackDeliveries.Add(r.Requester, new PackDelivery
                            {
                                ItemId  = key.ItemId,
                                Granted = grant,
                                Intent  = r.Intent,
                            });
                            break;
                        }

                        case ReservationIntent.Consume:
                        {
                            if (available <= 0) break;
                            int grant = math.min(r.Amount, available);
                            available -= grant;
                            PendingDeltas.Add(key, -grant);
                            break;
                        }

                        case ReservationIntent.Deposit:
                        case ReservationIntent.Produce:
                        {
                            PendingDeltas.Add(key, r.Amount);
                            break;
                        }

                        case ReservationIntent.Surplus:
                        default:
                        {
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
                            break;
                        }
                    }
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
                var cur    = list[i];
                ulong curK = SortKey(cur);
                int j      = i - 1;
                while (j >= 0 && SortKey(list[j]) > curK)
                {
                    list[j + 1] = list[j];
                    j--;
                }
                list[j + 1] = cur;
            }
        }

        static ulong SortKey(in ReservationRecord r)
            => ((ulong)(byte)~r.Priority << 56)
             | ((ulong)r.Tick             << 24)
             | ((ulong)((uint)r.Requester.Index & 0x00FFFFFFu));
    }
}
