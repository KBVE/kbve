using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
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
    [UpdateAfter(typeof(JobSystem))]
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
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;
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

    /// <summary>Per-animal turn-cadence production: Chicken+Cow every 2 turns (Egg / Milk), Sheep every 10 (Wool). Each cycle consumes 1 Carrot from the host farm's InventorySlot and emits 1 output; out of carrots → LastProducedTurn stays put so the animal catches up when feed returns. Burst ISystem + single-worker Schedule — multiple animals on the same farm serialize on the shared farm buffer, no racing.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmDepositSystem))]
    public partial struct FarmLivestockProductionSystem : ISystem
    {
        NativeQueue<BankTransfer> _queue;

        public void OnCreate(ref SystemState state)
        {
            var bus = state.World.GetExistingSystemManaged<BankTransferQueueSystem>()
                      ?? state.World.CreateSystemManaged<BankTransferQueueSystem>();
            _queue = bus.AllocateProducerQueue();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var handle = new FarmLivestockProductionJob
            {
                CurrentTurn = currentTurn,
                UnitLookup  = SystemAPI.GetComponentLookup<Unit>(true),
                FarmLookup  = SystemAPI.GetBufferLookup<FarmLedger>(true),
                Queue       = _queue.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.World.GetExistingSystemManaged<BankTransferQueueSystem>().AddJobHandleForProducer(handle);
            state.Dependency = handle;
        }
    }

    [BurstCompile]
    public partial struct FarmLivestockProductionJob : IJobEntity
    {
        public uint CurrentTurn;

        [ReadOnly] public ComponentLookup<Unit>    UnitLookup;
        [ReadOnly] public BufferLookup<FarmLedger> FarmLookup;

        public NativeQueue<BankTransfer>.ParallelWriter Queue;

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

            Queue.Enqueue(new BankTransfer { Target = host, ItemId = (ushort)ItemId.Carrot, Delta = -1 });
            Queue.Enqueue(new BankTransfer { Target = host, ItemId = outputId,              Delta =  1 });
            prod.LastProducedTurn += cadence;
        }

        static bool TryGetRecipe(byte species, out ushort outputId, out uint cadence)
        {
            switch (species)
            {
                case UnitType.Chicken: outputId = (ushort)ItemId.Egg;  cadence = 2;  return true;
                case UnitType.Cow:     outputId = (ushort)ItemId.Milk; cadence = 2;  return true;
                case UnitType.Sheep:   outputId = (ushort)ItemId.Wool; cadence = 10; return true;
                default:               outputId = 0;                   cadence = 0;  return false;
            }
        }
    }

}
