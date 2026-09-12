using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Moves bag items (Pouch/Bag/Pack) from a unit's PackSlot buffer into its EquippedBag buffer, up to <see cref="InventoryUtil.MaxEquippedBags"/>. Change-filtered on PackSlot — the job only runs for entities whose pack actually shifted since last tick, so the system stays asleep when nobody picked anything up.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BagAutoEquipSystem : ISystem
    {
        EntityQuery _query;

        public void OnCreate(ref SystemState state)
        {
            _query = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<PackSlot, EquippedBag>()
                .Build(ref state);
            _query.SetChangedVersionFilter(ComponentType.ReadOnly<PackSlot>());
            state.RequireForUpdate(_query);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new AutoEquipJob().ScheduleParallel(_query, state.Dependency);
        }
    }

    [BurstCompile]
    partial struct AutoEquipJob : IJobEntity
    {
        void Execute(DynamicBuffer<PackSlot> inv, DynamicBuffer<EquippedBag> bags)
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
