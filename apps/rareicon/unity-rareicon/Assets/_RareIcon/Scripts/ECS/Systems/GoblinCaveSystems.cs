using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-turn cave cadence: consume FoodPerGoblin edible items and spawn one Player-faction Looter goblin.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class GoblinCaveProductionSystem : SystemBase
    {
        struct PendingSpawn
        {
            public Entity Cave;
            public int2   Hex;
            public byte   Faction;
        }

        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            CompleteDependency();

            var invLookup = SystemAPI.GetBufferLookup<InventorySlot>(false);
            var em        = EntityManager;

            var caves = new NativeList<PendingSpawn>(4, Allocator.Temp);

            foreach (var (prodRef, buildingRO, entity) in
                     SystemAPI.Query<RefRW<GoblinCaveProduction>, RefRO<Building>>()
                              .WithAll<GoblinCaveTag>()
                              .WithEntityAccess())
            {
                var prod = prodRef.ValueRO;
                uint cadence = prod.CadenceTurns == 0 ? 1u : prod.CadenceTurns;
                if (currentTurn < prod.LastProducedTurn + cadence) continue;

                if (!invLookup.HasBuffer(entity)) continue;
                var storage = invLookup[entity];

                ushort need = prod.FoodPerGoblin == 0 ? (ushort)1 : prod.FoodPerGoblin;
                if (!TryConsumeFood(ref storage, need)) continue;

                prod.LastProducedTurn = currentTurn;
                prodRef.ValueRW = prod;

                caves.Add(new PendingSpawn
                {
                    Cave    = entity,
                    Hex     = buildingRO.ValueRO.RootHex,
                    Faction = buildingRO.ValueRO.OwnerFaction,
                });
            }

            for (int i = 0; i < caves.Length; i++)
            {
                var pending = caves[i];
                byte spawnFaction = pending.Faction == 0 ? FactionType.Player : pending.Faction;
                uint rng = (uint)pending.Cave.Index ^ (currentTurn * 0x9E3779B1u) ^ 0xC0FFEE33u;
                UnitSpawnSystem.SpawnGoblinAt(em, pending.Hex, rng, default, spawnFaction);
            }

            caves.Dispose();
        }

        static bool TryConsumeFood(ref DynamicBuffer<InventorySlot> storage, ushort amount)
        {
            int available = 0;
            for (int i = 0; i < storage.Length; i++)
            {
                if (ItemDB.EnergyValue(storage[i].ItemId) <= 0f) continue;
                available += storage[i].Count;
                if (available >= amount) break;
            }
            if (available < amount) return false;

            int remaining = amount;
            for (int i = 0; i < storage.Length && remaining > 0; i++)
            {
                if (ItemDB.EnergyValue(storage[i].ItemId) <= 0f) continue;
                var slot = storage[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                storage[i] = slot;
                remaining -= take;
            }
            return true;
        }
    }

    /// <summary>Looter on the Capital hex with room in inventory pulls up to PerTripAmount food items when at least one cave has headroom.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial class CapitalFoodPickupSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            CompleteDependency();

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out Entity capital)) return;
            if (!EntityManager.HasBuffer<InventorySlot>(capital)) return;
            if (!EntityManager.HasComponent<Building>(capital)) return;

            int2 capitalHex = EntityManager.GetComponentData<Building>(capital).RootHex;

            if (!AnyCaveHasHeadroom()) return;

            var capitalStorage = EntityManager.GetBuffer<InventorySlot>(capital);
            if (!ItemSlotOps.HasFood(capitalStorage)) return;

            foreach (var (jobIntent, reliefIntent, faction, movement, pack, bags) in
                     SystemAPI.Query<
                         RefRO<JobIntent>,
                         RefRO<ReliefIntent>,
                         RefRO<Faction>,
                         RefRO<UnitMovement>,
                         DynamicBuffer<PackSlot>,
                         DynamicBuffer<EquippedBag>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (!movement.ValueRO.CurrentHex.Equals(capitalHex)) continue;

                // Only goblins explicitly on a Looter→Capital cave-haul mission
                // grab food. Without these checks any Player Looter who happens
                // to walk onto the Capital hex (e.g. coming to Eat / Sleep /
                // deposit) loaded up 50 food and waddled off — JobSystem clears
                // JobIntent the moment a ReliefIntent fires, so gating on
                // JobIntent.Kind == Looter + TargetEntity == capital + no
                // active relief makes the pickup intent-aware instead of
                // pickpocketing every Looter that crosses the tile.
                if (reliefIntent.ValueRO.Kind != ReliefKind.None) continue;
                if (jobIntent.ValueRO.Kind != JobKind.Looter) continue;
                if (jobIntent.ValueRO.TargetEntity != capital) continue;

                int alreadyCarrying = ItemSlotOps.CountFood(pack);
                if (alreadyCarrying >= GoblinCaveHaulConfig.PerTripAmount) continue;

                ushort take = (ushort)(GoblinCaveHaulConfig.PerTripAmount - alreadyCarrying);
                TransferFoodToUnit(capitalStorage, pack, bags, take);
            }
        }

        bool AnyCaveHasHeadroom()
        {
            var invLookup = SystemAPI.GetBufferLookup<InventorySlot>(true);
            foreach (var (prodRO, entity) in
                     SystemAPI.Query<RefRO<GoblinCaveProduction>>()
                              .WithAll<GoblinCaveTag>()
                              .WithEntityAccess())
            {
                if (!invLookup.HasBuffer(entity)) continue;
                ushort cap = prodRO.ValueRO.StorageCap == 0 ? (ushort)200 : prodRO.ValueRO.StorageCap;
                if (ItemSlotOps.CountFood(invLookup[entity]) < cap) return true;
            }
            return false;
        }

        static void TransferFoodToUnit(DynamicBuffer<InventorySlot> src,
                                       DynamicBuffer<PackSlot> dst,
                                       in DynamicBuffer<EquippedBag> bags,
                                       ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < src.Length && remaining > 0; i++)
            {
                var srcSlot = src[i];
                if (srcSlot.Count == 0) continue;
                if (ItemDB.EnergyValue(srcSlot.ItemId) <= 0f) continue;

                int want = srcSlot.Count < remaining ? srcSlot.Count : remaining;
                ushort added = dst.AddItemManaged(bags, srcSlot.ItemId, (ushort)want);
                if (added == 0) continue;

                srcSlot.Count = (ushort)(srcSlot.Count - added);
                src[i] = srcSlot;
                remaining -= added;
            }
        }
    }

    /// <summary>Any Player-faction unit on a cave hex carrying food drains it into the cave's InventorySlot up to StorageCap.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateBefore(typeof(GoblinCaveProductionSystem))]
    public partial class CaveFoodDeliverySystem : SystemBase
    {
        protected override void OnUpdate()
        {
            CompleteDependency();

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true);
            var buildingLookup    = SystemAPI.GetComponentLookup<Building>(true);
            var prodLookup        = SystemAPI.GetComponentLookup<GoblinCaveProduction>(true);
            var invLookup         = SystemAPI.GetBufferLookup<InventorySlot>(false);

            foreach (var (movement, faction, pack) in
                     SystemAPI.Query<
                         RefRO<UnitMovement>,
                         RefRO<Faction>,
                         DynamicBuffer<PackSlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (pack.Length == 0) continue;
                if (!ItemSlotOps.HasFood(pack)) continue;

                int2 hex = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(hex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                if (buildingLookup[building].Type != BuildingType.GoblinCave) continue;
                if (!prodLookup.HasComponent(building)) continue;
                if (!invLookup.HasBuffer(building)) continue;

                var caveStorage = invLookup[building];
                ushort cap      = prodLookup[building].StorageCap == 0
                                  ? (ushort)200
                                  : prodLookup[building].StorageCap;
                int headroom    = cap - ItemSlotOps.CountFood(caveStorage);
                if (headroom <= 0) continue;

                TransferFood(pack, caveStorage, (ushort)math.min(headroom, ushort.MaxValue));
            }
        }

        static void TransferFood(DynamicBuffer<PackSlot> src, DynamicBuffer<InventorySlot> dst, ushort amount)
        {
            int remaining = amount;
            for (int i = 0; i < src.Length && remaining > 0; i++)
            {
                var srcSlot = src[i];
                if (srcSlot.Count == 0) continue;
                if (ItemDB.EnergyValue(srcSlot.ItemId) <= 0f) continue;

                int take = srcSlot.Count < remaining ? srcSlot.Count : remaining;
                srcSlot.Count = (ushort)(srcSlot.Count - take);
                src[i] = srcSlot;

                bool merged = false;
                for (int j = 0; j < dst.Length; j++)
                {
                    if (dst[j].ItemId != srcSlot.ItemId) continue;
                    var dstSlot = dst[j];
                    int sum = dstSlot.Count + take;
                    dstSlot.Count = (ushort)math.min(sum, (int)ushort.MaxValue);
                    dst[j] = dstSlot;
                    merged = true;
                    break;
                }
                if (!merged)
                    dst.Add(new InventorySlot { ItemId = srcSlot.ItemId, Count = (ushort)take });

                remaining -= take;
            }
        }
    }

    public static class GoblinCaveHaulConfig
    {
        public const ushort PerTripAmount = 50;
    }
}
