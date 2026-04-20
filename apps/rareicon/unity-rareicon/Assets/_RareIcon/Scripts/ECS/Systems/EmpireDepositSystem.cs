using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains a Player-faction unit's inventory into the Capital's storage buffer when standing on a claimed hex. BanditCoin is withheld whenever any Barracks is below its StorageCapacity — the carrier keeps the coins for a Capital→Barracks supply run instead of cycling them through the central treasury.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class EmpireDepositSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            // Lookups let the inner loop traverse tile → HexOccupant →
            // Building → storage buffer without a second query.
            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup      = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);
            var storageBufferLookup = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);

            bool anyBarracksUnderstocked = false;
            foreach (var (cap, storage) in
                     SystemAPI.Query<RefRO<StorageCapacity>, DynamicBuffer<InventorySlot>>()
                              .WithAll<BarracksTag>())
            {
                int total = 0;
                for (int i = 0; i < storage.Length; i++) total += storage[i].Count;
                if (total < cap.ValueRO.Total) { anyBarracksUnderstocked = true; break; }
            }

            foreach (var (movement, faction, invRO) in
                SystemAPI.Query<
                    RefRO<UnitMovement>,
                    RefRO<Faction>,
                    DynamicBuffer<InventorySlot>>())
            {
                // Shadow the foreach iter var — DynamicBuffer wraps a
                // pointer so the alias hits the same backing data, but
                // C# won't let us call the indexer setter on the iter
                // var directly.
                var inv = invRO;

                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (inv.Length == 0) continue;

                // Cheap pre-check — bail before any lookups if the unit
                // is carrying nothing. Empty goblins shouldn't cost the
                // frame anything.
                bool hasLoot = false;
                for (int i = 0; i < inv.Length; i++)
                {
                    if (inv[i].Count > 0) { hasLoot = true; break; }
                }
                if (!hasLoot) continue;

                // Is the unit's current hex claimed by a Capital?
                int2 hex = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(hex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                if (buildingLookup[building].Type != BuildingType.Capital) continue;
                if (!storageBufferLookup.HasBuffer(building)) continue;

                var storage = storageBufferLookup[building];

                // Merge into same-ItemId slots, append otherwise. No
                // capacity cap on the capital yet — add one here if we
                // start gating behaviours on "storage full".
                for (int i = 0; i < inv.Length; i++)
                {
                    ushort itemId = inv[i].ItemId;
                    ushort count  = inv[i].Count;
                    if (itemId == 0 || count == 0) continue;

                    // Reserve coins for the Barracks supply run whenever
                    // any Barracks has capacity. BarracksSupplyJobSystem
                    // will pick the unit up next tick and route it there.
                    if (anyBarracksUnderstocked && itemId == (ushort)ItemId.BanditCoin) continue;

                    bool merged = false;
                    for (int j = 0; j < storage.Length; j++)
                    {
                        if (storage[j].ItemId == itemId)
                        {
                            var slot = storage[j];
                            int sum = slot.Count + count;
                            slot.Count = (ushort)math.min(sum, ushort.MaxValue);
                            storage[j] = slot;
                            merged = true;
                            break;
                        }
                    }
                    if (!merged)
                    {
                        storage.Add(new InventorySlot { ItemId = itemId, Count = count });
                    }

                    var src = inv[i];
                    src.Count = 0;
                    inv[i] = src;
                }
            }
        }
    }
}
