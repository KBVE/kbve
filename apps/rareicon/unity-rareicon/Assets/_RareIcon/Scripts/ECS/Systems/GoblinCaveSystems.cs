using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-turn cave cadence: submits Consume reservations against the cave's own ledger summing to FoodPerGoblin across available food items, and emits a SpawnSoldierRequest (drained by SoldierSpawnApplierSystem). Reads the cave's GoblinCaveLedger RO to pick food items; the actual decrement goes through the logistics pipeline.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct GoblinCaveProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new GoblinCaveProductionJob
            {
                CurrentTurn  = currentTurn,
                Tick         = tick,
                ItemDb       = itemDb,
                Reservations = db.Reservations.AsParallelWriter(),
                Ecb          = ecb,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(GoblinCaveTag))]
    public partial struct GoblinCaveProductionJob : IJobEntity
    {
        public uint CurrentTurn;
        public uint Tick;
        [ReadOnly] public ItemDBSingleton ItemDb;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref GoblinCaveProduction prod,
                     in Building building,
                     in DynamicBuffer<GoblinCaveLedger> typedStorage)
        {
            uint cadence = prod.CadenceTurns == 0 ? 1u : prod.CadenceTurns;
            if (CurrentTurn < prod.LastProducedTurn + cadence) return;

            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            ushort need = prod.FoodPerGoblin == 0 ? (ushort)1 : prod.FoodPerGoblin;
            if (!HasFood(storage, need, ItemDb)) return;

            EmitFoodConsumes(entity, storage, need, ItemDb, Tick, ref Reservations);
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

        static bool HasFood(in DynamicBuffer<BankLedgerBase> storage, ushort amount, in ItemDBSingleton db)
        {
            int available = 0;
            for (int i = 0; i < storage.Length; i++)
            {
                if (db.EnergyValue(storage[i].ItemId) <= 0f) continue;
                available += storage[i].Count;
                if (available >= amount) return true;
            }
            return false;
        }

        static void EmitFoodConsumes(Entity cave,
                                     in DynamicBuffer<BankLedgerBase> storage,
                                     ushort amount,
                                     in ItemDBSingleton db,
                                     uint tick,
                                     ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res)
        {
            int remaining = amount;
            for (int i = 0; i < storage.Length && remaining > 0; i++)
            {
                if (db.EnergyValue(storage[i].ItemId) <= 0f) continue;
                int take = storage[i].Count < remaining ? storage[i].Count : remaining;
                if (take <= 0) continue;
                res.Add(ReservationOps.Key(cave, storage[i].ItemId), ReservationOps.Consume(cave, take, tick));
                remaining -= take;
            }
        }
    }

    /// <summary>Player-faction Looter on the Capital hex with a Looter→Capital cave-haul ProfessionIntent submits a Pickup reservation against Capital for PerTripAmount food. PackApplySystem applies the granted items to the unit's pack.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireDepositSystem))]
    public partial struct CapitalFoodPickupSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;
            if (!SystemAPI.HasComponent<Building>(capital)) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;

            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;
            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new CapitalFoodPickupJob
            {
                Capital       = capital,
                CapitalHex    = capitalHex,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                ItemDb        = itemDb,
                Reservations  = db.Reservations.AsParallelWriter(),
                Tick          = tick,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    [WithAll(typeof(ProfessionPriorities))]
    public partial struct CapitalFoodPickupJob : IJobEntity
    {
        public Entity Capital;
        public int2   CapitalHex;
        public uint   Tick;

        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;
        [ReadOnly] public ItemDBSingleton             ItemDb;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity,
                     in ProfessionIntent jobIntent,
                     in ReliefIntent reliefIntent,
                     in Faction faction,
                     in UnitMovement movement,
                     in DynamicBuffer<PackSlot> pack)
        {
            if (faction.Value != FactionType.Player) return;
            if (!movement.CurrentHex.Equals(CapitalHex)) return;
            if (reliefIntent.Kind != ReliefKind.None) return;
            if (jobIntent.Kind != ProfessionKind.Looter) return;
            if (jobIntent.TargetEntity != Capital) return;
            if (!CapitalLookup.HasBuffer(Capital)) return;

            int alreadyCarrying = CountFoodPack(pack, ItemDb);
            int wanted = GoblinCaveHaulConfig.PerTripAmount - alreadyCarrying;
            if (wanted <= 0) return;

            var capStorage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            int remaining = wanted;
            for (int i = 0; i < capStorage.Length && remaining > 0; i++)
            {
                var slot = capStorage[i];
                if (slot.Count == 0) continue;
                if (ItemDb.EnergyValue(slot.ItemId) <= 0f) continue;

                int take = slot.Count < remaining ? slot.Count : remaining;
                Reservations.Add(ReservationOps.Key(Capital, slot.ItemId), ReservationOps.Pickup(entity, take, Tick));
                remaining -= take;
            }
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
    }

    /// <summary>Any Player-faction unit on a cave hex carrying food pre-debits its own pack and submits Deposit reservations against the cave's ledger. StorageCap enforced before emission.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateBefore(typeof(GoblinCaveProductionSystem))]
    public partial struct CaveFoodDeliverySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var itemDb)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new CaveFoodDeliveryJob
            {
                HexLookup         = hexLookup.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup    = SystemAPI.GetComponentLookup<Building>(true),
                ProdLookup        = SystemAPI.GetComponentLookup<GoblinCaveProduction>(true),
                CaveLookup        = SystemAPI.GetBufferLookup<GoblinCaveLedger>(true),
                ItemDb            = itemDb,
                Reservations      = db.Reservations.AsParallelWriter(),
                Tick              = tick,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
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
        public uint Tick;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in UnitMovement movement, in Faction faction, ref DynamicBuffer<PackSlot> pack)
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

            int remaining = math.min(headroom, ushort.MaxValue);
            for (int i = 0; i < pack.Length && remaining > 0; i++)
            {
                var srcSlot = pack[i];
                if (srcSlot.Count == 0) continue;
                if (ItemDb.EnergyValue(srcSlot.ItemId) <= 0f) continue;

                int take = srcSlot.Count < remaining ? srcSlot.Count : remaining;
                srcSlot.Count = (ushort)(srcSlot.Count - take);
                pack[i] = srcSlot;

                Reservations.Add(ReservationOps.Key(building, srcSlot.ItemId), ReservationOps.Deposit(entity, take, Tick));
                remaining -= take;
            }
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
    }

    public static class GoblinCaveHaulConfig
    {
        public const ushort PerTripAmount = 50;
    }
}
