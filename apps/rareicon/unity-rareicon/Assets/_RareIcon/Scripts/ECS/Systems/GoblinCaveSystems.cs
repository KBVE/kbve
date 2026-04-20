using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Per-turn production cadence for every GoblinCaveTag entity: if the
    /// cave's InventorySlot buffer holds at least FoodPerGoblin edible items
    /// (ItemDB.EnergyValue > 0), consume them and spawn one Player-faction
    /// Goblin at the cave's RootHex with default JobPriorities (Looter = 3).
    ///
    /// Cadence is anchored to WorldClock.TurnIndex — no fractional cycles,
    /// one goblin per cadence turn at most. If storage is too low the turn
    /// skips and LastProducedTurn stays put so we catch up the instant a
    /// hauler lands more rations.
    /// </summary>
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

            // Complete any pending RW jobs on InventorySlot (e.g. FurnaceTickJob)
            // before we take a main-thread BufferLookup on the same type.
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

            // Spawn outside the iteration — SpawnGoblinAt does structural
            // changes that would invalidate the ongoing Query otherwise.
            for (int i = 0; i < caves.Length; i++)
            {
                var pending = caves[i];
                byte spawnFaction = pending.Faction == 0 ? FactionType.Player : pending.Faction;

                // RNG seed derived from (cave entity, turn) so two caves
                // producing on the same turn don't share a seed.
                uint rng = (uint)pending.Cave.Index ^ (currentTurn * 0x9E3779B1u) ^ 0xC0FFEE33u;
                UnitSpawnSystem.SpawnGoblinAt(em, pending.Hex, rng, default, spawnFaction);
            }

            caves.Dispose();
        }

        /// <summary>Drains `amount` total food units (RestoreEnergy > 0) from `storage` across slots in buffer order. Returns false and leaves storage untouched if the total available is below `amount`.</summary>
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

    /// <summary>
    /// Looter-driven food haul leg 1: a Looter (JobPriorities.Looter > 0)
    /// standing on the Capital's claimed hex withdraws up to
    /// GoblinCaveHaulConfig.PerTripAmount food from Capital storage into
    /// its own InventorySlot buffer — but only if the empire actually
    /// needs that food (at least one Goblin Cave has headroom). Otherwise
    /// the Looter's normal loop (deposit → forage → return) plays out.
    ///
    /// Updates after EmpireDepositSystem so any loot the Looter just
    /// dropped at Capital is already in the treasury and available to
    /// hand back as ration freight.
    /// </summary>
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

            // Skip the whole pass if no cave is hungry — looters should
            // stay on their default loop rather than spin Capital → Capital.
            if (!AnyCaveHasHeadroom()) return;

            var capitalStorage = EntityManager.GetBuffer<InventorySlot>(capital);
            if (!AnyFoodInBuffer(capitalStorage)) return;

            foreach (var (priorities, faction, movement, inv) in
                     SystemAPI.Query<
                         RefRO<JobPriorities>,
                         RefRO<Faction>,
                         RefRO<UnitMovement>,
                         DynamicBuffer<InventorySlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (priorities.ValueRO.Looter == 0) continue;
                if (!movement.ValueRO.CurrentHex.Equals(capitalHex)) continue;

                // Don't top up over the trip amount — Looter isn't a truck,
                // it carries one run at a time.
                int alreadyCarrying = CountFood(inv);
                if (alreadyCarrying >= GoblinCaveHaulConfig.PerTripAmount) continue;

                ushort take = (ushort)(GoblinCaveHaulConfig.PerTripAmount - alreadyCarrying);
                TransferFood(capitalStorage, inv, take);
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
                if (CountFood(invLookup[entity]) < cap) return true;
            }
            return false;
        }

        static bool AnyFoodInBuffer(DynamicBuffer<InventorySlot> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (ItemDB.EnergyValue(buf[i].ItemId) > 0f) return true;
            }
            return false;
        }

        static int CountFood(DynamicBuffer<InventorySlot> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (ItemDB.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        // Moves up to `amount` food units from src → dst in src's slot
        // order. Merges into an existing dst slot with matching ItemId,
        // otherwise appends. Deterministic-but-arbitrary which food ships first.
        static void TransferFood(DynamicBuffer<InventorySlot> src, DynamicBuffer<InventorySlot> dst, ushort amount)
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

    /// <summary>
    /// Looter-driven food haul leg 2: any Player-faction unit standing on
    /// a Goblin Cave's root hex with carried food drains its food into the
    /// cave's InventorySlot buffer up to StorageCap. Non-food items are
    /// left on the unit (they'll get dumped at Capital via EmpireDeposit).
    ///
    /// Not restricted to Looters — if a Farmer or anyone else happens to
    /// be on the cave hex with food, we accept the drop. The filter is
    /// "carried food + cave needs food", not "role match".
    /// </summary>
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

            foreach (var (movement, faction, inv) in
                     SystemAPI.Query<
                         RefRO<UnitMovement>,
                         RefRO<Faction>,
                         DynamicBuffer<InventorySlot>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (inv.Length == 0) continue;
                if (!AnyFoodInBuffer(inv)) continue;

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
                int headroom    = cap - CountFood(caveStorage);
                if (headroom <= 0) continue;

                TransferFood(inv, caveStorage, (ushort)math.min(headroom, ushort.MaxValue));
            }
        }

        static bool AnyFoodInBuffer(DynamicBuffer<InventorySlot> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (ItemDB.EnergyValue(buf[i].ItemId) > 0f) return true;
            }
            return false;
        }

        static int CountFood(DynamicBuffer<InventorySlot> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (ItemDB.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        static void TransferFood(DynamicBuffer<InventorySlot> src, DynamicBuffer<InventorySlot> dst, ushort amount)
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

    /// <summary>Shared tuning for the Looter cave-haul loop.</summary>
    public static class GoblinCaveHaulConfig
    {
        /// <summary>Max food units a Looter carries per Capital → cave run. Matches default FoodPerGoblin (one trip = one goblin's worth).</summary>
        public const ushort PerTripAmount = 50;
    }
}
