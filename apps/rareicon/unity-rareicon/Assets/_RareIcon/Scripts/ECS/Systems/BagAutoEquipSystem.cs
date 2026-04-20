using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Moves bag items (Pouch/Bag/Pack) from a unit's InventorySlot buffer into its EquippedBag buffer, up to InventoryUtil.MaxEquippedBags.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BagAutoEquipSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new AutoEquipJob().ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    partial struct AutoEquipJob : IJobEntity
    {
        void Execute(DynamicBuffer<InventorySlot> inv, DynamicBuffer<EquippedBag> bags)
        {
            if (bags.Length >= InventoryUtil.MaxEquippedBags) return;

            for (int i = 0; i < inv.Length; i++)
            {
                ushort itemId = inv[i].ItemId;
                if (!InventoryUtil.IsBag(itemId)) continue;
                if (inv[i].Count == 0) continue;

                bags.Add(new EquippedBag { ItemId = itemId });

                var slot = inv[i];
                slot.Count = (ushort)(slot.Count - 1);
                if (slot.Count == 0)
                {
                    inv.RemoveAt(i);
                    i--;
                }
                else
                {
                    inv[i] = slot;
                }

                if (bags.Length >= InventoryUtil.MaxEquippedBags) return;
            }
        }
    }
}
