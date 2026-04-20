using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-cadence recruitment: once per BarracksProduction.CadenceTurns, consume CoinCost BanditCoin + FoodCost food (any FoodItems.IsFood item) from the building's InventorySlot storage and spawn one Soldier on an adjacent hex. Spawn only fires when the full cost is in stock; partial stock waits for the next hauler delivery.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class BarracksProductionSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var em = EntityManager;

            foreach (var (prodRW, buildingRO, storageRO, entity) in
                     SystemAPI.Query<RefRW<BarracksProduction>, RefRO<Building>, DynamicBuffer<InventorySlot>>()
                              .WithAll<BarracksTag>()
                              .WithEntityAccess())
            {
                var prod = prodRW.ValueRO;
                if (currentTurn < prod.LastProducedTurn + prod.CadenceTurns) continue;

                var storage = storageRO;
                if (CountItem(storage, (ushort)ItemId.BanditCoin) < prod.CoinCost) continue;
                if (FoodItems.Count(storage) < prod.FoodCost) continue;

                Consume(ref storage, (ushort)ItemId.BanditCoin, prod.CoinCost);
                ConsumeFood(ref storage, prod.FoodCost);

                int2 rootHex = buildingRO.ValueRO.RootHex;
                int dir = (int)((uint)(entity.Index + (int)currentTurn) % 6u);
                int2 spawnHex = rootHex + HexMeshUtil.HexNeighbor(dir);

                uint rng = (uint)entity.Index * 0x9E3779B1u ^ currentTurn * 0x85EBCA77u;
                rng |= 1u;
                UnitSpawnSystem.SpawnGoblinAt(em, spawnHex, rng,
                    default, FactionType.Player, UnitType.Soldier);

                prod.LastProducedTurn = currentTurn;
                prodRW.ValueRW = prod;
            }
        }

        static int CountItem(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].ItemId == itemId) total += inv[i].Count;
            return total;
        }

        static void Consume(ref DynamicBuffer<InventorySlot> inv, ushort itemId, int amount)
        {
            for (int i = 0; i < inv.Length && amount > 0; i++)
            {
                if (inv[i].ItemId != itemId) continue;
                var slot = inv[i];
                int take = math.min(slot.Count, amount);
                slot.Count = (ushort)(slot.Count - take);
                amount -= take;
                inv[i] = slot;
            }
        }

        static void ConsumeFood(ref DynamicBuffer<InventorySlot> inv, int amount)
        {
            for (int i = 0; i < inv.Length && amount > 0; i++)
            {
                if (!FoodItems.IsFood(inv[i].ItemId)) continue;
                var slot = inv[i];
                int take = math.min(slot.Count, amount);
                slot.Count = (ushort)(slot.Count - take);
                amount -= take;
                inv[i] = slot;
            }
        }
    }
}
