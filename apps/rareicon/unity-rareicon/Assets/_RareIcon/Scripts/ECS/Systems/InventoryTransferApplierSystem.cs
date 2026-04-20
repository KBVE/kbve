using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Single-threaded applier for PendingItemTransfer entities. Parallel producers (EmpireDepositSystem, BuildingSurplusTransferSystem, future: ProductionSystem output leg) emit transfers via ECB.ParallelWriter; this system drains them at the end of EconomySystemGroup and folds each into the Target's InventorySlot (merging same-ItemId slots to keep the buffer compact). Runs last in the group so every parallel emitter has already committed its ECB.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuildingSurplusTransferSystem))]
    public partial struct InventoryTransferApplierSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<PendingItemTransfer>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);
            var invLookup = SystemAPI.GetBufferLookup<InventorySlot>(false);

            foreach (var (transferRO, entity) in
                     SystemAPI.Query<RefRO<PendingItemTransfer>>().WithEntityAccess())
            {
                var t = transferRO.ValueRO;
                if (invLookup.HasBuffer(t.Target) && t.Delta != 0)
                {
                    var inv = invLookup[t.Target];
                    Apply(inv, t.ItemId, t.Delta);
                }
                ecb.DestroyEntity(entity);
            }
        }

        static void Apply(DynamicBuffer<InventorySlot> inv, ushort itemId, int delta)
        {
            if (delta > 0)
            {
                for (int i = 0; i < inv.Length; i++)
                {
                    if (inv[i].ItemId != itemId) continue;
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + delta, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
                inv.Add(new InventorySlot { ItemId = itemId, Count = (ushort)math.min(delta, ushort.MaxValue) });
                return;
            }

            int remaining = -delta;
            for (int i = 0; i < inv.Length && remaining > 0; i++)
            {
                if (inv[i].ItemId != itemId) continue;
                var slot = inv[i];
                int take = math.min(slot.Count, remaining);
                slot.Count = (ushort)(slot.Count - take);
                inv[i] = slot;
                remaining -= take;
            }
        }
    }
}
