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

    /// <summary>Hunter-job units with no active goal target the nearest untamed PassiveAnimalTag within range; writes a Hunt MovementGoal so pathing takes over. Burst ISystem: main-thread gathers animal hex positions into a TempJob NativeList (each hunter only writes its own MovementGoal), then ScheduleParallel runs the per-hunter pick.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial struct WildlifeHuntBehaviorSystem : ISystem
    {
        const int HuntRadius = 8;

        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var animals = new NativeList<int2>(64, Allocator.TempJob);
            foreach (var movement in
                     SystemAPI.Query<RefRO<UnitMovement>>()
                              .WithAll<PassiveAnimalTag>()
                              .WithNone<TamedTag>())
            {
                animals.Add(movement.ValueRO.CurrentHex);
            }

            if (animals.Length == 0)
            {
                animals.Dispose();
                return;
            }

            state.Dependency = new WildlifeHuntJob
            {
                Animals    = animals.AsDeferredJobArray(),
                HuntRadius = HuntRadius,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = animals.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct WildlifeHuntJob : IJobEntity
    {
        [ReadOnly] public NativeArray<int2> Animals;
        public int HuntRadius;

        void Execute(in JobPriorities priorities, in UnitMovement movement, ref MovementGoal goal)
        {
            if (priorities.Hunter == 0) return;
            if (goal.Priority > GoalPriority.Hunt) return;

            var here = movement.CurrentHex;
            int bestDist = int.MaxValue;
            int2 bestHex = here;
            bool found = false;
            for (int i = 0; i < Animals.Length; i++)
            {
                int d = HexDistance(here, Animals[i]);
                if (d > HuntRadius) continue;
                if (d < bestDist) { bestDist = d; bestHex = Animals[i]; found = true; }
            }

            if (!found) return;
            goal = new MovementGoal
            {
                Kind      = GoalKind.Hunt,
                Priority  = GoalPriority.Hunt,
                TargetHex = bestHex,
            };
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dq = a.x - b.x, dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }
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
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmDepositSystem))]
    public partial struct FarmLivestockProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            state.Dependency = new FarmLivestockProductionJob
            {
                CurrentTurn = currentTurn,
                UnitLookup  = SystemAPI.GetComponentLookup<Unit>(true),
                InvLookup   = SystemAPI.GetBufferLookup<InventorySlot>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct FarmLivestockProductionJob : IJobEntity
    {
        public uint CurrentTurn;

        [ReadOnly] public ComponentLookup<Unit> UnitLookup;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity,
                     in ShelteredInside shelter,
                     ref LivestockProduction prod)
        {
            if (!UnitLookup.HasComponent(entity)) return;
            byte species = UnitLookup[entity].Type;
            if (!TryGetRecipe(species, out ushort outputId, out uint cadence)) return;
            if (CurrentTurn < prod.LastProducedTurn + cadence) return;

            var host = shelter.Host;
            if (!InvLookup.HasBuffer(host)) return;
            var storage = InvLookup[host];

            if (!TryConsume(ref storage, (ushort)ItemId.Carrot, 1)) return;
            AddStorage(ref storage, outputId, 1);
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

        static bool TryConsume(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId != itemId) continue;
                if (storage[i].Count < amount) return false;
                var slot = storage[i];
                slot.Count = (ushort)(slot.Count - amount);
                storage[i] = slot;
                return true;
            }
            return false;
        }

        static void AddStorage(ref DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            for (int i = 0; i < storage.Length; i++)
            {
                if (storage[i].ItemId == itemId)
                {
                    var slot = storage[i];
                    slot.Count = (ushort)math.min(slot.Count + amount, ushort.MaxValue);
                    storage[i] = slot;
                    return;
                }
            }
            storage.Add(new InventorySlot { ItemId = itemId, Count = amount });
        }
    }

}
