using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Central-storage deposit pass for the player's empire. Any unit
    /// on FactionType.Player that carries an InventorySlot buffer and
    /// happens to stand on one of the 7 capital-claimed hexes drains
    /// its inventory into the capital's own buffer and walks away
    /// empty. Works for goblins today and any future empire creature
    /// (knight quartermasters, soldiers hauling loot from kills, etc.)
    /// without a code change — the query is keyed on the components,
    /// not on UnitType.
    ///
    /// Companion to a future EmpireWithdrawSystem: that pass will run
    /// the other direction, letting units *pull* from storage based
    /// on need-signals produced by yet-to-be-built systems. Candidate
    /// signals:
    ///   • HungerSystem → publishes "give me N food items"
    ///   • CraftingSystem → publishes "give me N wood + N stone"
    ///   • Equipment swaps → publishes "give me a sword"
    /// Until one of those lands, there's no demand to pull against,
    /// so the withdraw system stays unwritten. When it lands, the
    /// contract is: units carry a `DynamicBuffer<PullRequest>` (or
    /// similar), the withdraw pass fulfils as much as storage can
    /// give, and unsatisfied requests remain for later passes.
    ///
    /// Hostile / beast factions are skipped explicitly — even if a
    /// raider goblin wanders onto the capital plaza its loot doesn't
    /// go into our storage.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    public partial class EmpireDepositSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            // Lookups let the inner loop traverse tile → HexOccupant →
            // Building → storage buffer without a second query.
            var hexOccupantLookup   = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup      = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);
            var storageBufferLookup = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);

            foreach (var (movement, faction, inv) in
                SystemAPI.Query<
                    RefRO<UnitMovement>,
                    RefRO<Faction>,
                    DynamicBuffer<InventorySlot>>())
            {
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
                }

                inv.Clear();
            }
        }
    }
}
