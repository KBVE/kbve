using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 5: drains per-unit PackDeliveries into each unit's DynamicBuffer&lt;PackSlot&gt;. Runs once per frame immediately after LedgerCommitSystem. Single writer for pack buffers inside the logistics pipeline.</summary>
    [UpdateInGroup(typeof(LogisticsEndGroup))]
    [UpdateAfter(typeof(LedgerCommitSystem))]
    public partial struct PackApplySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            state.Dependency = new PackApplyJob
            {
                PackDeliveries = db.PackDeliveries,
                PackLookup     = SystemAPI.GetBufferLookup<PackSlot>(false),
            }.Schedule(dep);

            db.PipelineHandle = state.Dependency;
        }
    }

    [BurstCompile]
    public struct PackApplyJob : IJob
    {
        [ReadOnly] public NativeParallelMultiHashMap<Entity, PackDelivery> PackDeliveries;
        public BufferLookup<PackSlot>                                      PackLookup;

        public void Execute()
        {
            var unique = PackDeliveries.GetUniqueKeyArray(Allocator.Temp);
            var keys = unique.Item1;
            int keyCount = unique.Item2;

            for (int k = 0; k < keyCount; k++)
            {
                var requester = keys[k];
                if (!PackLookup.HasBuffer(requester)) continue;

                var pack = PackLookup[requester];

                if (PackDeliveries.TryGetFirstValue(requester, out var d, out var it))
                {
                    do
                    {
                        if (d.Granted <= 0) continue;
                        AddToPack(pack, d.ItemId, d.Granted);
                    }
                    while (PackDeliveries.TryGetNextValue(out d, ref it));
                }
            }

            keys.Dispose();
        }

        static void AddToPack(DynamicBuffer<PackSlot> pack, ushort itemId, int amount)
        {
            int capped = math.min(amount, ushort.MaxValue);
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].ItemId != itemId) continue;
                var slot = pack[i];
                int merged = math.min(slot.Count + capped, (int)ushort.MaxValue);
                slot.Count = (ushort)merged;
                pack[i] = slot;
                return;
            }
            pack.Add(new PackSlot
            {
                Uid    = default,
                ItemId = itemId,
                Count  = (ushort)capped,
            });
        }
    }
}
