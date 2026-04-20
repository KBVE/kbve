using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Caps Carrot reserve a farm holds back for livestock feed; anything above drains to Capital each tick.</summary>
    public static class FarmRanchConfig
    {
        public const int CarrotReserve       = 8;    // carrots kept locally per farm (livestock feed)
        public const int LivestockCapPerFarm = 100;  // total animals across all species
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
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(WanderBehaviorSystem))]
    [UpdateAfter(typeof(WildlifeFleeSystem))]
    public partial class FollowOwnerSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var movementLookup = SystemAPI.GetComponentLookup<UnitMovement>(isReadOnly: true);

            foreach (var (ownerRef, goalRW, movement) in
                     SystemAPI.Query<RefRO<OwnerRef>, RefRW<MovementGoal>, RefRO<UnitMovement>>()
                              .WithAll<TamedTag>())
            {
                var owner = ownerRef.ValueRO.Value;
                if (owner == Entity.Null || !movementLookup.HasComponent(owner)) continue;
                if (goalRW.ValueRO.Priority > GoalPriority.Wander) continue;

                var ownerHex = movementLookup[owner].CurrentHex;
                if (movement.ValueRO.CurrentHex.Equals(ownerHex)) continue;

                goalRW.ValueRW = new MovementGoal
                {
                    Kind      = GoalKind.Follow,
                    Priority  = GoalPriority.Wander,
                    TargetHex = ownerHex,
                };
            }
        }
    }

    /// <summary>Tamed animal standing on a Farm hex collapses into the farm's FarmLivestock buffer: destroy entity, increment count, stamp LastProducedTurn so it doesn't produce until the next eligible cadence.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class FarmDepositSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup    = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);
            var livestockLookup   = SystemAPI.GetBufferLookup<FarmLivestock>(isReadOnly: false);

            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (movement, unit, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Unit>>()
                              .WithAll<PassiveAnimalTag, TamedTag>()
                              .WithEntityAccess())
            {
                var hex = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(hex, out Entity tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (!buildingLookup.HasComponent(building)) continue;
                if (buildingLookup[building].Type != BuildingType.Farm) continue;
                if (!livestockLookup.HasBuffer(building)) continue;

                var buf = livestockLookup[building];
                int total = 0;
                for (int i = 0; i < buf.Length; i++) total += buf[i].Count;
                if (total >= FarmRanchConfig.LivestockCapPerFarm) continue;

                byte species = unit.ValueRO.Type;
                int idx = -1;
                for (int i = 0; i < buf.Length; i++)
                {
                    if (buf[i].UnitType == species) { idx = i; break; }
                }
                if (idx >= 0)
                {
                    var slot = buf[idx];
                    slot.Count = (ushort)(slot.Count + 1);
                    buf[idx] = slot;
                }
                else
                {
                    buf.Add(new FarmLivestock
                    {
                        UnitType         = species,
                        Count            = 1,
                        LastProducedTurn = currentTurn,
                    });
                }

                ecb.DestroyEntity(entity);
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }

    /// <summary>Turn-cadence livestock production: Chicken+Cow every 2 turns, Sheep every 10; food-gated on the farm's Carrot reserve.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmDepositSystem))]
    public partial class FarmLivestockProductionSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            foreach (var (livestock, storage) in
                     SystemAPI.Query<DynamicBuffer<FarmLivestock>, DynamicBuffer<FarmStorage>>()
                              .WithAll<FarmTag>())
            {
                for (int i = 0; i < livestock.Length; i++)
                {
                    var entry = livestock[i];
                    if (entry.Count == 0) continue;

                    if (!TryProduce(entry, currentTurn,
                                    out ushort outputId, out ushort outputCount, out uint turnsElapsed))
                        continue;

                    if (!TryConsume(ref storage, (ushort)ItemId.Carrot, entry.Count)) continue;

                    AddStorage(ref storage, outputId, (ushort)(outputCount * entry.Count));
                    entry.LastProducedTurn += turnsElapsed;
                    livestock[i] = entry;
                }
            }
        }

        static bool TryProduce(FarmLivestock entry, uint currentTurn,
                               out ushort outputId, out ushort outputCount, out uint turnsElapsed)
        {
            outputId = 0; outputCount = 0; turnsElapsed = 0;
            uint cadence;
            switch (entry.UnitType)
            {
                case UnitType.Chicken: outputId = (ushort)ItemId.Egg;  cadence = 2;  break;
                case UnitType.Cow:     outputId = (ushort)ItemId.Milk; cadence = 2;  break;
                case UnitType.Sheep:   outputId = (ushort)ItemId.Wool; cadence = 10; break;
                default:                                                     return false;
            }

            if (currentTurn < entry.LastProducedTurn + cadence) return false;
            turnsElapsed = currentTurn - entry.LastProducedTurn;
            outputCount = (ushort)(turnsElapsed / cadence);
            turnsElapsed = outputCount * cadence;
            return outputCount > 0;
        }

        static bool TryConsume(ref DynamicBuffer<FarmStorage> storage, ushort itemId, ushort amount)
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

        static void AddStorage(ref DynamicBuffer<FarmStorage> storage, ushort itemId, ushort amount)
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
            storage.Add(new FarmStorage { ItemId = itemId, Count = amount });
        }
    }

    /// <summary>Drains FarmStorage into the Capital each tick, retaining a small Carrot reserve so livestock can still feed on the next production cycle.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(FarmLivestockProductionSystem))]
    public partial class FarmSurplusTransferSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity capital = Entity.Null;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (b.ValueRO.Type == BuildingType.Capital) { capital = e; break; }
            }
            if (capital == Entity.Null) return;
            if (!SystemAPI.HasBuffer<InventorySlot>(capital)) return;

            var capitalStorage = SystemAPI.GetBuffer<InventorySlot>(capital);

            foreach (var storage in SystemAPI.Query<DynamicBuffer<FarmStorage>>().WithAll<FarmTag>())
            {
                for (int i = 0; i < storage.Length; i++)
                {
                    var slot = storage[i];
                    if (slot.Count == 0) continue;

                    // Carrots: retain reserve, ship the rest.
                    ushort move;
                    if (slot.ItemId == (ushort)ItemId.Carrot)
                    {
                        if (slot.Count <= FarmRanchConfig.CarrotReserve) continue;
                        move = (ushort)(slot.Count - FarmRanchConfig.CarrotReserve);
                    }
                    else
                    {
                        move = slot.Count;
                    }

                    AddCapital(capitalStorage, slot.ItemId, move);
                    slot.Count = (ushort)(slot.Count - move);
                    storage[i] = slot;
                }
            }
        }

        static void AddCapital(DynamicBuffer<InventorySlot> storage, ushort itemId, ushort amount)
        {
            if (amount == 0) return;
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
