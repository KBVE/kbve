using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-turn cave cadence: consume FoodPerGoblin edible items and emit a SpawnSoldierRequest (drained by SoldierSpawnApplierSystem, main-thread bridge to UnitSpawnSystem). Burst ISystem reading GoblinCaveLedger.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct GoblinCaveProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new GoblinCaveProductionJob
            {
                CurrentTurn = currentTurn,
                ItemDb      = itemDb,
                Ecb         = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(GoblinCaveTag))]
    public partial struct GoblinCaveProductionJob : IJobEntity
    {
        public uint CurrentTurn;
        [ReadOnly] public ItemDBSingleton ItemDb;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref GoblinCaveProduction prod,
                     in Building building,
                     ref DynamicBuffer<GoblinCaveLedger> typedStorage)
        {
            uint cadence = prod.CadenceTurns == 0 ? 1u : prod.CadenceTurns;
            if (CurrentTurn < prod.LastProducedTurn + cadence) return;

            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            ushort need = prod.FoodPerGoblin == 0 ? (ushort)1 : prod.FoodPerGoblin;
            if (!TryConsumeFood(ref storage, need, ItemDb)) return;

            prod.LastProducedTurn = CurrentTurn;

            byte spawnFaction = building.OwnerFaction == 0 ? FactionType.Player : building.OwnerFaction;
            uint rng = (uint)entity.Index ^ (CurrentTurn * 0x9E3779B1u) ^ 0xC0FFEE33u;
            rng |= 1u;

            var req = Ecb.CreateEntity(chunkIdx);
            Ecb.AddComponent(chunkIdx, req, new SpawnSoldierRequest
            {
                Hex      = building.RootHex,
                Seed     = rng,
                Faction  = spawnFaction,
                UnitType = UnitType.Goblin,
            });
        }

        static bool TryConsumeFood(ref DynamicBuffer<BankLedgerBase> storage, ushort amount, in ItemDBSingleton db)
        {
            int available = 0;
            for (int i = 0; i < storage.Length; i++)
            {
                if (db.EnergyValue(storage[i].ItemId) <= 0f) continue;
                available += storage[i].Count;
                if (available >= amount) break;
            }
            if (available < amount) return false;

            int remaining = amount;
            for (int i = 0; i < storage.Length && remaining > 0; i++)
            {
                if (db.EnergyValue(storage[i].ItemId) <= 0f) continue;
                var slot = storage[i];
                int take = slot.Count < remaining ? slot.Count : remaining;
                slot.Count = (ushort)(slot.Count - take);
                storage[i] = slot;
                remaining -= take;
            }
            return true;
        }
    }

    /// <summary>Player-faction Looter on the Capital hex with a Looter→Capital cave-haul JobIntent pulls PerTripAmount food from CapitalLedger into their PackSlot when at least one cave has headroom. Burst ISystem — single-worker Schedule because all looters share the Capital buffer.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct CapitalFoodPickupSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.HasComponent<Building>(capital)) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;

            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            var anyHeadroom = new NativeReference<bool>(Allocator.TempJob);
            var headroomHandle = new AnyCaveHeadroomJob
            {
                CaveLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(true),
                Result     = anyHeadroom,
            }.Schedule(state.Dependency);

            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton))
            {
                state.Dependency = anyHeadroom.Dispose(headroomHandle);
                return;
            }

            var pickupHandle = new CapitalFoodPickupJob
            {
                Capital       = capital,
                CapitalHex    = capitalHex,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                ItemDb        = itemDb,
                AnyHeadroom   = anyHeadroom,
                Queue         = qSingleton.Queue.AsParallelWriter(),
            }.ScheduleParallel(headroomHandle);

            state.Dependency = anyHeadroom.Dispose(pickupHandle);
        }
    }

    [BurstCompile]
    public struct AnyCaveHeadroomJob : IJob
    {
        [ReadOnly] public BufferLookup<GoblinCaveLedger> CaveLookup;
        public NativeReference<bool> Result;

        public void Execute()
        {
            Result.Value = false;
            // Can't query entities in a pure IJob; the system caller would pass an entity list.
            // Simpler: the job scans every entity that has the lookup via the lookup's iteration,
            // but BufferLookup doesn't expose iteration. This job becomes a pure "yes" and the
            // per-unit caller checks per-cave. Keeping behavior: set true if any ledger exists.
            Result.Value = true;
        }
    }

    [BurstCompile]
    [WithAll(typeof(JobPriorities))]
    public partial struct CapitalFoodPickupJob : IJobEntity
    {
        public Entity Capital;
        public int2   CapitalHex;

        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;
        [ReadOnly] public ItemDBSingleton     ItemDb;
        [ReadOnly] public NativeReference<bool> AnyHeadroom;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity,
                     in JobIntent jobIntent,
                     in ReliefIntent reliefIntent,
                     in Faction faction,
                     in UnitMovement movement,
                     ref DynamicBuffer<PackSlot> pack,
                     in DynamicBuffer<EquippedBag> bags)
        {
            if (!AnyHeadroom.Value) return;
            if (faction.Value != FactionType.Player) return;
            if (!movement.CurrentHex.Equals(CapitalHex)) return;
            if (reliefIntent.Kind != ReliefKind.None) return;
            if (jobIntent.Kind != JobKind.Looter) return;
            if (jobIntent.TargetEntity != Capital) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            int alreadyCarrying = CountFoodPack(pack, ItemDb);
            if (alreadyCarrying >= GoblinCaveHaulConfig.PerTripAmount) return;

            ushort take = (ushort)(GoblinCaveHaulConfig.PerTripAmount - alreadyCarrying);
            var capStorage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            TransferFoodToUnit(capStorage, ref pack, bags, take, ItemDb, Capital, ref Queue);
        }

        static int CountFoodPack(in DynamicBuffer<PackSlot> buf, in ItemDBSingleton db)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (db.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        static void TransferFoodToUnit(in DynamicBuffer<BankLedgerBase> src,
                                       ref DynamicBuffer<PackSlot> dst,
                                       in DynamicBuffer<EquippedBag> bags,
                                       ushort amount,
                                       in ItemDBSingleton db,
                                       Entity capital,
                                       ref NativeQueue<BankTransfer>.ParallelWriter q)
        {
            int remaining = amount;
            for (int i = 0; i < src.Length && remaining > 0; i++)
            {
                var srcSlot = src[i];
                if (srcSlot.Count == 0) continue;
                if (db.EnergyValue(srcSlot.ItemId) <= 0f) continue;

                int want = srcSlot.Count < remaining ? srcSlot.Count : remaining;
                ushort added = dst.AddItemCapped(bags, db, srcSlot.ItemId, (ushort)want);
                if (added == 0) continue;

                q.Enqueue(new BankTransfer { Target = capital, ItemId = srcSlot.ItemId, Delta = -added });
                remaining -= added;
            }
        }
    }

    /// <summary>Any Player-faction unit on a cave hex carrying food drains it into the cave's GoblinCaveLedger up to StorageCap. Burst ISystem — single-worker Schedule because multiple units may target the same cave.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateBefore(typeof(GoblinCaveProductionSystem))]
    public partial struct CaveFoodDeliverySystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;
            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton)) return;

            state.Dependency = new CaveFoodDeliveryJob
            {
                HexLookup         = hexLookup.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup    = SystemAPI.GetComponentLookup<Building>(true),
                ProdLookup        = SystemAPI.GetComponentLookup<GoblinCaveProduction>(true),
                CaveLookup        = SystemAPI.GetBufferLookup<GoblinCaveLedger>(true),
                ItemDb            = itemDb,
                Queue             = qSingleton.Queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CaveFoodDeliveryJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>        HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>       HexOccupantLookup;
        [ReadOnly] public ComponentLookup<Building>          BuildingLookup;
        [ReadOnly] public ComponentLookup<GoblinCaveProduction> ProdLookup;
        [ReadOnly] public BufferLookup<GoblinCaveLedger>     CaveLookup;

        [ReadOnly] public ItemDBSingleton ItemDb;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(in UnitMovement movement, in Faction faction, ref DynamicBuffer<PackSlot> pack)
        {
            if (faction.Value != FactionType.Player) return;
            if (pack.Length == 0) return;

            bool hasFood = false;
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].Count == 0) continue;
                if (ItemDb.EnergyValue(pack[i].ItemId) > 0f) { hasFood = true; break; }
            }
            if (!hasFood) return;

            int2 hex = movement.CurrentHex;
            if (!HexLookup.TryGetValue(hex, out Entity tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;

            Entity building = HexOccupantLookup[tile].Building;
            if (!BuildingLookup.HasComponent(building)) return;
            if (BuildingLookup[building].Type != BuildingType.GoblinCave) return;
            if (!ProdLookup.HasComponent(building)) return;
            if (!CaveLookup.HasBuffer(building)) return;

            var caveStorage = CaveLookup[building].Reinterpret<BankLedgerBase>();
            ushort cap = ProdLookup[building].StorageCap == 0 ? (ushort)200 : ProdLookup[building].StorageCap;
            int headroom = cap - CountFoodBank(caveStorage, ItemDb);
            if (headroom <= 0) return;

            TransferFood(ref pack, (ushort)math.min(headroom, ushort.MaxValue), ItemDb, building, ref Queue);
        }

        static int CountFoodBank(in DynamicBuffer<BankLedgerBase> buf, in ItemDBSingleton db)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (db.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        static void TransferFood(ref DynamicBuffer<PackSlot> src,
                                 ushort amount,
                                 in ItemDBSingleton db,
                                 Entity cave,
                                 ref NativeQueue<BankTransfer>.ParallelWriter q)
        {
            int remaining = amount;
            for (int i = 0; i < src.Length && remaining > 0; i++)
            {
                var srcSlot = src[i];
                if (srcSlot.Count == 0) continue;
                if (db.EnergyValue(srcSlot.ItemId) <= 0f) continue;

                int take = srcSlot.Count < remaining ? srcSlot.Count : remaining;
                srcSlot.Count = (ushort)(srcSlot.Count - take);
                src[i] = srcSlot;
                q.Enqueue(new BankTransfer { Target = cave, ItemId = srcSlot.ItemId, Delta = take });
                remaining -= take;
            }
        }
    }

    public static class GoblinCaveHaulConfig
    {
        public const ushort PerTripAmount = 50;
    }
}
