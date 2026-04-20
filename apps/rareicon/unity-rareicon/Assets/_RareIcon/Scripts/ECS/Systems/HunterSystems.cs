using System.Collections.Generic;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Global farm tuning. Per-item floors (Carrot etc.) now live per-entity on StorageReserve, so only the cross-farm livestock cap remains here.</summary>
    public static class FarmRanchConfig
    {
        public const int LivestockCapPerFarm = 100;
    }

    /// <summary>Hunter-job units with no active goal target the nearest untamed PassiveAnimalTag within range; writes a Hunt MovementGoal so pathing takes over.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial class WildlifeHuntBehaviorSystem : SystemBase
    {
        const int HuntRadius = 8;

        protected override void OnUpdate()
        {
            var animals    = new NativeList<int2>(64, Allocator.Temp);
            var animalEnts = new NativeList<Entity>(64, Allocator.Temp);

            foreach (var (movement, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>>()
                              .WithAll<PassiveAnimalTag>()
                              .WithNone<TamedTag>()
                              .WithEntityAccess())
            {
                animals.Add(movement.ValueRO.CurrentHex);
                animalEnts.Add(entity);
            }

            if (animals.Length == 0)
            {
                animals.Dispose();
                animalEnts.Dispose();
                return;
            }

            foreach (var (priorities, movement, goalRW) in
                     SystemAPI.Query<RefRO<JobPriorities>, RefRO<UnitMovement>, RefRW<MovementGoal>>())
            {
                if (priorities.ValueRO.Hunter == 0) continue;
                if (goalRW.ValueRO.Priority > GoalPriority.Hunt) continue;

                var here = movement.ValueRO.CurrentHex;
                int bestDist = int.MaxValue;
                int2 bestHex = here;
                bool found = false;
                for (int i = 0; i < animals.Length; i++)
                {
                    int d = HexDistance(here, animals[i]);
                    if (d > HuntRadius) continue;
                    if (d < bestDist) { bestDist = d; bestHex = animals[i]; found = true; }
                }

                if (!found) continue;
                goalRW.ValueRW = new MovementGoal
                {
                    Kind      = GoalKind.Hunt,
                    Priority  = GoalPriority.Hunt,
                    TargetHex = bestHex,
                };
            }

            animals.Dispose();
            animalEnts.Dispose();
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

    /// <summary>Tamed animal standing on a Farm hex shelters into it: ShelteredInside + DisableRendering + LivestockProduction. Per-animal Entity + state (HP, name, lineage) persists for future breeding / release. Cap counted via sheltered entities pointing at each farm.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class FarmDepositSystem : SystemBase
    {
        readonly Dictionary<Entity, int>           _livestockPerFarm = new();
        readonly List<(Entity Animal, Entity Farm)> _toShelter       = new();

        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup    = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);

            _livestockPerFarm.Clear();
            foreach (var shelter in SystemAPI.Query<RefRO<ShelteredInside>>())
            {
                var host = shelter.ValueRO.Host;
                _livestockPerFarm[host] = _livestockPerFarm.TryGetValue(host, out var c) ? c + 1 : 1;
            }

            _toShelter.Clear();
            foreach (var (movement, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>>()
                              .WithAll<PassiveAnimalTag, TamedTag>()
                              .WithNone<ShelteredInside>()
                              .WithEntityAccess())
            {
                var hex = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(hex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                if (buildingLookup[building].Type != BuildingType.Farm) continue;

                int count = _livestockPerFarm.TryGetValue(building, out var c) ? c : 0;
                if (count >= FarmRanchConfig.LivestockCapPerFarm) continue;

                _toShelter.Add((entity, building));
                _livestockPerFarm[building] = count + 1;
            }

            for (int i = 0; i < _toShelter.Count; i++)
            {
                var animal = _toShelter[i].Animal;
                var farm   = _toShelter[i].Farm;
                EntityManager.AddComponentData(animal, new ShelteredInside { Host = farm });
                EntityManager.AddComponent<DisableRendering>(animal);
                EntityManager.AddComponentData(animal, new LivestockProduction
                {
                    LastProducedTurn = currentTurn,
                });
            }
        }
    }

    /// <summary>Per-animal turn-cadence production: Chicken+Cow every 2 turns (Egg / Milk), Sheep every 10 (Wool). Each cycle consumes 1 Carrot from the host farm's InventorySlot storage and emits 1 output; if no carrots, the animal's LastProducedTurn stays put so it catches up when feed returns.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmDepositSystem))]
    public partial class FarmLivestockProductionSystem : SystemBase
    {
        readonly Dictionary<Entity, List<Entity>> _animalsByFarm = new();

        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            _animalsByFarm.Clear();
            foreach (var (shelter, entity) in
                     SystemAPI.Query<RefRO<ShelteredInside>>()
                              .WithAll<LivestockProduction>()
                              .WithEntityAccess())
            {
                var host = shelter.ValueRO.Host;
                if (!_animalsByFarm.TryGetValue(host, out var list))
                {
                    list = new List<Entity>();
                    _animalsByFarm[host] = list;
                }
                list.Add(entity);
            }

            var storageLookup = SystemAPI.GetBufferLookup<InventorySlot>(false);
            var unitLookup    = SystemAPI.GetComponentLookup<Unit>(true);
            var prodLookup    = SystemAPI.GetComponentLookup<LivestockProduction>(false);

            foreach (var kv in _animalsByFarm)
            {
                var farm = kv.Key;
                if (!storageLookup.HasBuffer(farm)) continue;
                var storage = storageLookup[farm];

                var animals = kv.Value;
                for (int i = 0; i < animals.Count; i++)
                {
                    var animal = animals[i];
                    if (!unitLookup.HasComponent(animal) || !prodLookup.HasComponent(animal)) continue;

                    byte species = unitLookup[animal].Type;
                    if (!TryGetRecipe(species, out ushort outputId, out uint cadence)) continue;

                    var prod = prodLookup[animal];
                    if (currentTurn < prod.LastProducedTurn + cadence) continue;

                    if (!TryConsume(ref storage, (ushort)ItemId.Carrot, 1)) continue;
                    AddStorage(ref storage, outputId, 1);

                    prod.LastProducedTurn += cadence;
                    prodLookup[animal] = prod;
                }
            }
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
