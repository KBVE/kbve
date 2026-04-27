using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>Global farm tuning. Per-item floors (Carrot etc.) now live per-entity on StorageReserve, so only the cross-farm livestock cap remains here.</summary>
    public static class FarmRanchConfig
    {
        public const int LivestockCapPerFarm = 100;
    }

    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct WildlifeHuntBehaviorSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }
        [BurstCompile] public void OnUpdate(ref SystemState state) { }
    }

    /// <summary>Tamed animals chase their OwnerRef's hex; runs before WanderBehaviorSystem so a Follow goal blocks the wander re-roll, but yields to Flee / player Order / Return.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(WanderBehaviorSystem))]
    [UpdateAfter(typeof(WildlifeFleeSystem))]
    public partial struct FollowOwnerSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new FollowOwnerJob
            {
                MovementLookup = SystemAPI.GetComponentLookup<UnitMovement>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(TamedTag))]
    [WithNone(typeof(ShelteredInside))]
    public partial struct FollowOwnerJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<UnitMovement> MovementLookup;

        void Execute(in OwnerRef ownerRef, ref MovementGoal goal, in UnitMovement movement)
        {
            var owner = ownerRef.Value;
            if (owner == Entity.Null || !MovementLookup.HasComponent(owner)) return;
            if (goal.Priority > GoalPriority.Wander) return;

            var ownerHex = MovementLookup[owner].CurrentHex;
            if (movement.CurrentHex.Equals(ownerHex)) return;

            goal = new MovementGoal
            {
                Kind      = GoalKind.Follow,
                Priority  = GoalPriority.Wander,
                TargetHex = ownerHex,
            };
        }
    }

    /// <summary>Tamed animal standing on a Farm hex shelters into it: ShelteredInside + DisableRendering + LivestockProduction. Per-animal Entity + state (HP, name, lineage) persists for future breeding / release. Cap counted via sheltered entities pointing at each farm. Burst ISystem + single-worker Schedule so per-farm cap accounting stays consistent with structural-change ECB emits.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FarmDepositSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup)) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var livestockPerFarm = new NativeHashMap<Entity, int>(32, Allocator.TempJob);
            foreach (var shelter in SystemAPI.Query<RefRO<ShelteredInside>>())
            {
                var host = shelter.ValueRO.Host;
                livestockPerFarm[host] = livestockPerFarm.TryGetValue(host, out var c) ? c + 1 : 1;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new FarmDepositJob
            {
                CurrentTurn        = currentTurn,
                HexLookup          = hexLookup.Lookup,
                OccupantLookup     = SystemAPI.GetComponentLookup<HexOccupant>(true),
                BuildingLookup     = SystemAPI.GetComponentLookup<Building>(true),
                LivestockPerFarm   = livestockPerFarm,
                Ecb                = ecb,
            }.Schedule(state.Dependency);

            state.Dependency = livestockPerFarm.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(PassiveAnimalTag), typeof(TamedTag))]
    [WithNone(typeof(ShelteredInside))]
    public partial struct FarmDepositJob : IJobEntity
    {
        public uint CurrentTurn;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      OccupantLookup;
        [ReadOnly] public ComponentLookup<Building>         BuildingLookup;

        public NativeHashMap<Entity, int> LivestockPerFarm;
        public EntityCommandBuffer        Ecb;

        void Execute(Entity entity, in UnitMovement movement)
        {
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;

            Entity building = OccupantLookup[tile].Building;
            if (!BuildingLookup.HasComponent(building)) return;
            if (BuildingLookup[building].Type != BuildingType.Farm) return;

            int count = LivestockPerFarm.TryGetValue(building, out var c) ? c : 0;
            if (count >= FarmRanchConfig.LivestockCapPerFarm) return;

            LivestockPerFarm[building] = count + 1;

            Ecb.AddComponent(entity, new ShelteredInside { Host = building });
            Ecb.AddComponent<DisableRendering>(entity);
            Ecb.AddComponent(entity, new LivestockProduction { LastProducedTurn = CurrentTurn });
        }
    }

    /// <summary>Per-animal turn-cadence production: Chicken+Cow every 2 turns (Egg / FreshMilk), Sheep every 10 (Wool). Each cycle submits Consume(Carrot) + Produce(output) reservations against the host farm.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmDepositSystem))]
    public partial struct FarmLivestockProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new FarmLivestockProductionJob
            {
                CurrentTurn  = currentTurn,
                Tick         = tick,
                UnitLookup   = SystemAPI.GetComponentLookup<Unit>(true),
                FarmLookup   = SystemAPI.GetBufferLookup<FarmLedger>(true),
                Reservations = db.Reservations.AsParallelWriter(),
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct FarmLivestockProductionJob : IJobEntity
    {
        public uint CurrentTurn;
        public uint Tick;

        [ReadOnly] public ComponentLookup<Unit>    UnitLookup;
        [ReadOnly] public BufferLookup<FarmLedger> FarmLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity,
                     in ShelteredInside shelter,
                     ref LivestockProduction prod)
        {
            if (!UnitLookup.HasComponent(entity)) return;
            byte species = UnitLookup[entity].Type;
            if (!TryGetRecipe(species, out ushort outputId, out uint cadence)) return;
            if (CurrentTurn < prod.LastProducedTurn + cadence) return;

            var host = shelter.Host;
            if (!FarmLookup.HasBuffer(host)) return;
            var storage = FarmLookup[host].Reinterpret<BankLedgerBase>();

            if (BankLedgerOps.CountOf(storage, (ushort)ItemId.Carrot) < 1) return;

            Reservations.Add(ReservationOps.Key(host, (ushort)ItemId.Carrot), ReservationOps.Consume(host, 1, Tick));
            Reservations.Add(ReservationOps.Key(host, outputId),              ReservationOps.Produce(host, 1, Tick));
            prod.LastProducedTurn += cadence;
        }

        static bool TryGetRecipe(byte species, out ushort outputId, out uint cadence)
        {
            switch (species)
            {
                case UnitType.Chicken: outputId = (ushort)ItemId.Egg;  cadence = 2;  return true;
                case UnitType.Cow:     outputId = (ushort)ItemId.FreshMilk; cadence = 2;  return true;
                case UnitType.Sheep:   outputId = (ushort)ItemId.Wool; cadence = 10; return true;
                default:               outputId = 0;                   cadence = 0;  return false;
            }
        }
    }

}
