using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Hungry Player-faction unit on the Capital pulls one food item from storage into its inventory.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial class EmpireWithdrawSystem : SystemBase
    {
        const float HungerThreshold = 0.30f; // below 30% max energy = hungry

        protected override void OnUpdate()
        {
            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup      = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);
            var storageBufferLookup = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);

            foreach (var (movement, faction, energy, inv) in
                SystemAPI.Query<
                    RefRO<UnitMovement>,
                    RefRO<Faction>,
                    RefRO<Energy>,
                    DynamicBuffer<InventorySlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;

                var e = energy.ValueRO;
                if (e.Max <= 0f) continue;
                if (e.Value / e.Max >= HungerThreshold) continue;

                // Already carrying edible food? Let AutoEatSystem deal
                // with it — no need to withdraw more until that's gone.
                if (HasEdible(inv)) continue;

                // Standing on a capital-claimed hex?
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

        // Find the first edible stack in storage with count > 0, move 1
        // into the unit's inventory. Silent no-op if storage has no
        // food at all — the goblin just stays hungry and wanders off.
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

                // Merge into unit's existing stack or append a new one.
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
