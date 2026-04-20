using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops variant-specific loot onto the hex tile when a PassiveAnimal dies; runs before DeathCleanupSystem destroys the entity.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial class WildlifeLootDropSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<DeadTag>();
        }

        protected override void OnUpdate()
        {
            var dropLookup = SystemAPI.GetBufferLookup<ItemDrop>(isReadOnly: false);

            foreach (var (movement, unit, _, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Unit>, RefRO<PassiveAnimalTag>>()
                              .WithAll<DeadTag>()
                              .WithEntityAccess())
            {
                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out var hex)) continue;
                if (!dropLookup.HasBuffer(hex)) continue;

                var buf = dropLookup[hex];
                // Per-kill hash so a single cow's drop counts don't clone
                // across neighbours killed on the same tick.
                uint h = (uint)entity.Index * 0x9E3779B1u ^ (uint)entity.Version * 0x85EBCA77u;
                h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
                float r0 = ((h       ) & 0xFFFFu) / 65535f;
                float r1 = ((h >> 16 ) & 0xFFFFu) / 65535f;

                switch (unit.ValueRO.Type)
                {
                    case UnitType.Chicken:
                        AddStack(buf, (ushort)ItemId.RawChicken, 1);
                        AddStack(buf, (ushort)ItemId.Feather, (ushort)(1 + (int)(r0 * 2.99f)));
                        break;
                    case UnitType.Sheep:
                        AddStack(buf, (ushort)ItemId.RawMutton, 1);
                        AddStack(buf, (ushort)ItemId.Wool, (ushort)(1 + (int)(r0 * 1.99f)));
                        if (r1 < 0.25f) AddStack(buf, (ushort)ItemId.Leather, 1);
                        break;
                    case UnitType.Cow:
                        AddStack(buf, (ushort)ItemId.RawBeef, (ushort)(2 + (int)(r0 * 1.99f)));
                        AddStack(buf, (ushort)ItemId.Leather, (ushort)(1 + (int)(r1 * 1.99f)));
                        break;
                }
            }
        }

        static void AddStack(DynamicBuffer<ItemDrop> buf, ushort id, ushort count)
        {
            if (count == 0) return;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId == id)
                {
                    var s = buf[i];
                    s.Count = (ushort)math.min(ushort.MaxValue, s.Count + count);
                    buf[i] = s;
                    return;
                }
            }
            buf.Add(new ItemDrop { ItemId = id, Count = count });
        }
    }

    /// <summary>Units with an inventory standing on a hex that carries ground loot transfer the whole stack and clear it.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(HarvestSystem))]
    public partial class ItemPickupSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var dropLookup = SystemAPI.GetBufferLookup<ItemDrop>(isReadOnly: false);

            foreach (var (movement, inventory) in
                     SystemAPI.Query<RefRO<UnitMovement>, DynamicBuffer<InventorySlot>>())
            {
                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out var hex)) continue;
                if (!dropLookup.HasBuffer(hex)) continue;

                var drops = dropLookup[hex];
                if (drops.Length == 0) continue;

                for (int i = 0; i < drops.Length; i++)
                    inventory.AddItem(drops[i].ItemId, drops[i].Count);
                drops.Clear();
            }
        }
    }

    /// <summary>Any King or Hunter-role unit dwelling on a wild animal's hex tames it: flip Faction to Player, add TamedTag + OwnerRef.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class TamingSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var priorityLookup = SystemAPI.GetComponentLookup<JobPriorities>(isReadOnly: true);

            // Gather (hex, tamer) pairs for every candidate standing still.
            // DwellTimer > 0 → the unit just arrived via a goal (King click
            // or Hunter job) and is paused here, so tame-on-contact reads
            // as intentional, not drive-by.
            var tamerHexes   = new NativeList<int2>(16, Allocator.Temp);
            var tamerOwners  = new NativeList<Entity>(16, Allocator.Temp);

            foreach (var (movement, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>>().WithAll<KingTag>().WithEntityAccess())
            {
                if (movement.ValueRO.DwellTimer <= 0f) continue;
                tamerHexes.Add(movement.ValueRO.CurrentHex);
                tamerOwners.Add(entity);
            }

            foreach (var (movement, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>>().WithEntityAccess())
            {
                if (!priorityLookup.HasComponent(entity)) continue;
                if (priorityLookup[entity].Hunter == 0) continue;
                if (movement.ValueRO.DwellTimer <= 0f) continue;
                tamerHexes.Add(movement.ValueRO.CurrentHex);
                tamerOwners.Add(entity);
            }

            if (tamerHexes.Length == 0)
            {
                tamerHexes.Dispose();
                tamerOwners.Dispose();
                return;
            }

            var ecb = new EntityCommandBuffer(Allocator.Temp);
            var factionLookup = SystemAPI.GetComponentLookup<Faction>(isReadOnly: false);

            foreach (var (movement, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>>()
                              .WithAll<PassiveAnimalTag>()
                              .WithNone<TamedTag>()
                              .WithEntityAccess())
            {
                var animalHex = movement.ValueRO.CurrentHex;
                Entity owner = Entity.Null;
                for (int i = 0; i < tamerHexes.Length; i++)
                {
                    if (tamerHexes[i].Equals(animalHex)) { owner = tamerOwners[i]; break; }
                }
                if (owner == Entity.Null) continue;

                ecb.AddComponent<TamedTag>(entity);
                ecb.AddComponent(entity, new OwnerRef { Value = owner });
                if (factionLookup.HasComponent(entity))
                    factionLookup[entity] = new Faction { Value = FactionType.Player };
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
            tamerHexes.Dispose();
            tamerOwners.Dispose();
        }
    }

    /// <summary>Passive animals override their Wander goal with a Flee goal when a non-Wildlife unit is within 2 hexes; cleared once safe.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(WanderBehaviorSystem))]
    public partial class WildlifeFleeSystem : SystemBase
    {
        const int FleeRadius = 2;

        protected override void OnUpdate()
        {
            // Snapshot every potential threat (any non-Wildlife unit with a
            // position). Small worlds → O(animals * threats) is cheap; if it
            // ever matters we drop the threats into the spatial hash.
            var threats = new NativeList<int2>(64, Allocator.Temp);
            foreach (var (movement, faction) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Faction>>()
                              .WithNone<PassiveAnimalTag>())
            {
                if (faction.ValueRO.Value == FactionType.Wildlife) continue;
                threats.Add(movement.ValueRO.CurrentHex);
            }

            foreach (var (movementRW, goalRW) in
                     SystemAPI.Query<RefRW<UnitMovement>, RefRW<MovementGoal>>()
                              .WithAll<PassiveAnimalTag>()
                              .WithNone<TamedTag>())
            {
                var here = movementRW.ValueRO.CurrentHex;
                int2 nearest = default;
                int  nearestD = int.MaxValue;
                for (int i = 0; i < threats.Length; i++)
                {
                    int d = HexDistance(here, threats[i]);
                    if (d < nearestD) { nearestD = d; nearest = threats[i]; }
                }

                if (nearestD <= FleeRadius)
                {
                    // Flee direction = current hex + (current - threat) so the
                    // new target moves away along the same axial line.
                    int2 away = new int2(here.x - nearest.x, here.y - nearest.y);
                    if (away.x == 0 && away.y == 0) away = new int2(1, 0);
                    int2 target = here + away * 2;
                    if (goalRW.ValueRO.Priority <= GoalPriority.Flee)
                    {
                        goalRW.ValueRW = new MovementGoal
                        {
                            Kind      = GoalKind.Flee,
                            Priority  = GoalPriority.Flee,
                            TargetHex = target,
                        };
                    }
                }
                else if (goalRW.ValueRO.Kind == GoalKind.Flee)
                {
                    // Safe again — drop the flee goal so WanderBehaviorSystem
                    // rolls a fresh wander target on the next tick.
                    goalRW.ValueRW = new MovementGoal
                    {
                        Kind      = GoalKind.None,
                        Priority  = GoalPriority.None,
                        TargetHex = here,
                    };
                }
            }

            threats.Dispose();
        }

        // Axial hex distance (q, r).
        static int HexDistance(int2 a, int2 b)
        {
            int dq = a.x - b.x;
            int dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }
    }
}
