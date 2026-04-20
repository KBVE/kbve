using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase transport for Looter / Farmer haulers targeting a Barracks: on the Capital hex with an empty inventory, pick up 1 BanditCoin or 1 food item; on the Barracks root hex, deposit matching carried items into the Barracks' InventorySlot buffer, respecting StorageCapacity. Main-thread SystemBase — shared buffers + low unit counts make bursted scheduling marginal.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial class BarracksSupplyDepositSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            var capitalInv = EntityManager.GetBuffer<InventorySlot>(capital);

            foreach (var (intent, movement, inventoryRO) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>, DynamicBuffer<InventorySlot>>())
            {
                var inventory = inventoryRO;

                if (intent.ValueRO.Kind != JobKind.Looter) continue;
                var target = intent.ValueRO.TargetEntity;
                if (target == Entity.Null) continue;
                if (!SystemAPI.HasComponent<BarracksTag>(target)) continue;
                if (!SystemAPI.HasComponent<StorageCapacity>(target)) continue;
                if (!SystemAPI.HasComponent<BarracksProduction>(target)) continue;

                var here = movement.ValueRO.CurrentHex;
                var rootHex = SystemAPI.GetComponent<Building>(target).RootHex;
                var prod = SystemAPI.GetComponent<BarracksProduction>(target);
                ushort cap = SystemAPI.GetComponent<StorageCapacity>(target).Total;

                if (here.Equals(rootHex))
                {
                    var storage = SystemAPI.GetBuffer<InventorySlot>(target);
                    DepositSupply(inventory, storage, cap);
                    continue;
                }

                if (IsOnCapital(here, capital))
                {
                    var storage = SystemAPI.GetBuffer<InventorySlot>(target);
                    int total = StorageTotal(storage);
                    if (total >= cap) continue;

                    int coinShortfall = math.max(0, prod.CoinCost - StorageCount(storage, (ushort)ItemId.BanditCoin));
                    int foodShortfall = math.max(0, prod.FoodCost - FoodItems.Count(storage));

                    if (coinShortfall > 0) TryPickupOne(capitalInv, inventory, (ushort)ItemId.BanditCoin);
                    else if (foodShortfall > 0) TryPickupFood(capitalInv, inventory);
                }
            }
        }

        bool IsOnCapital(int2 here, Entity capital)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return false;
            if (!hexLookup.Lookup.TryGetValue(here, out var tile)) return false;
            if (!SystemAPI.HasComponent<HexOccupant>(tile)) return false;
            return SystemAPI.GetComponent<HexOccupant>(tile).Building == capital;
        }

        static int StorageTotal(DynamicBuffer<InventorySlot> inv)
        {
            int t = 0;
            for (int i = 0; i < inv.Length; i++) t += inv[i].Count;
            return t;
        }

        static int StorageCount(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            int t = 0;
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].ItemId == itemId) t += inv[i].Count;
            return t;
        }

        static void TryPickupOne(DynamicBuffer<InventorySlot> capInv,
                                 DynamicBuffer<InventorySlot> unitInv,
                                 ushort itemId)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].ItemId != itemId || capInv[i].Count == 0) continue;
                var slot = capInv[i];
                slot.Count -= 1;
                capInv[i] = slot;
                MergeOrAdd(unitInv, itemId, 1);
                return;
            }
        }

        static void TryPickupFood(DynamicBuffer<InventorySlot> capInv,
                                  DynamicBuffer<InventorySlot> unitInv)
        {
            for (int i = 0; i < capInv.Length; i++)
            {
                if (capInv[i].Count == 0) continue;
                if (!FoodItems.IsFood(capInv[i].ItemId)) continue;
                ushort id = capInv[i].ItemId;
                var slot = capInv[i];
                slot.Count -= 1;
                capInv[i] = slot;
                MergeOrAdd(unitInv, id, 1);
                return;
            }
        }

        static void DepositSupply(DynamicBuffer<InventorySlot> unitInv,
                                  DynamicBuffer<InventorySlot> storage,
                                  ushort capacity)
        {
            int remaining = capacity - StorageTotal(storage);
            if (remaining <= 0) return;

            for (int i = 0; i < unitInv.Length && remaining > 0; i++)
            {
                if (unitInv[i].Count == 0) continue;
                ushort id = unitInv[i].ItemId;
                if (id != (ushort)ItemId.BanditCoin && !FoodItems.IsFood(id)) continue;

                int take = math.min(unitInv[i].Count, remaining);
                var uslot = unitInv[i];
                uslot.Count = (ushort)(uslot.Count - take);
                unitInv[i] = uslot;
                remaining -= take;
                MergeOrAdd(storage, id, (ushort)take);
            }
        }

        static void MergeOrAdd(DynamicBuffer<InventorySlot> inv, ushort itemId, ushort amount)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId == itemId)
                {
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }
}
