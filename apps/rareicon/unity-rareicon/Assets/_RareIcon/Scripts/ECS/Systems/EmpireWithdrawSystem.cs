using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player unit on a Capital-claimed hex pulls one edible from storage into its inventory.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial class EmpireWithdrawSystem : SystemBase
    {
        const float HungerTrigger = 0.50f;

        protected override void OnUpdate()
        {
            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup      = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);
            var storageBufferLookup = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);

            foreach (var (movement, faction, hunger, inv) in
                SystemAPI.Query<
                    RefRO<UnitMovement>,
                    RefRO<Faction>,
                    RefRO<Hunger>,
                    DynamicBuffer<InventorySlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;

                var h = hunger.ValueRO;
                if (h.Max <= 0f) continue;
                if (h.Value / h.Max < HungerTrigger) continue;

                if (HasEdible(inv)) continue;

                int2 hex = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(hex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                if (buildingLookup[building].Type != BuildingType.Capital) continue;
                if (!storageBufferLookup.HasBuffer(building)) continue;

                var storage = storageBufferLookup[building];
                PullOneFoodItem(storage, inv);
            }
        }

        static bool HasEdible(DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count > 0 && ItemDB.IsEdible(inv[i].ItemId))
                    return true;
            }
            return false;
        }

        static void PullOneFoodItem(
            DynamicBuffer<InventorySlot> storage,
            DynamicBuffer<InventorySlot> unitInv)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                var slot = storage[i];
                if (slot.Count == 0) continue;
                if (!ItemDB.IsEdible(slot.ItemId)) continue;

                slot.Count -= 1;
                storage[i] = slot;

                bool merged = false;
                for (int j = 0; j < unitInv.Length; j++)
                {
                    if (unitInv[j].ItemId == slot.ItemId)
                    {
                        var u = unitInv[j];
                        u.Count = (ushort)math.min(u.Count + 1, ushort.MaxValue);
                        unitInv[j] = u;
                        merged = true;
                        break;
                    }
                }
                if (!merged)
                {
                    unitInv.Add(new InventorySlot { ItemId = slot.ItemId, Count = 1 });
                }
                return;
            }
        }
    }
}
