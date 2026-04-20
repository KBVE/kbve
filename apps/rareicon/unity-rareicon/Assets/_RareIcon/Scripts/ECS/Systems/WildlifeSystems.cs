using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops variant-specific loot onto the hex tile when a PassiveAnimal dies; runs before DeathCleanupSystem destroys the entity. Parallel Burst — each kill appends via ECB.ParallelWriter, multiple same-hex deaths don't race.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct WildlifeLootDropSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<DeadTag>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new WildlifeLootDropJob
            {
                HexLookup  = hexLookup.Lookup,
                DropLookup = SystemAPI.GetBufferLookup<ItemDrop>(true),
                Ecb        = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(DeadTag), typeof(PassiveAnimalTag))]
    public partial struct WildlifeLootDropJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;
        [ReadOnly] public BufferLookup<ItemDrop>      DropLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in UnitMovement movement,
                     in Unit unit)
        {
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hex)) return;
            if (!DropLookup.HasBuffer(hex)) return;

            uint h = (uint)entity.Index * 0x9E3779B1u ^ (uint)entity.Version * 0x85EBCA77u;
            h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
            float r0 = ((h       ) & 0xFFFFu) / 65535f;
            float r1 = ((h >> 16 ) & 0xFFFFu) / 65535f;

            switch (unit.Type)
            {
                case UnitType.Chicken:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.RawChicken, 1);
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Feather,
                        (ushort)(1 + (int)(r0 * 2.99f)));
                    break;
                case UnitType.Sheep:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.RawMutton, 1);
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Wool,
                        (ushort)(1 + (int)(r0 * 1.99f)));
                    if (r1 < 0.25f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.Leather, 1);
                    break;
                case UnitType.Cow:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.RawBeef,
                        (ushort)(2 + (int)(r0 * 1.99f)));
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Leather,
                        (ushort)(1 + (int)(r1 * 1.99f)));
                    break;
            }
        }

        static void Append(EntityCommandBuffer.ParallelWriter ecb, int chunkIdx,
                           Entity hex, ushort itemId, ushort count)
        {
            if (count == 0) return;
            ecb.AppendToBuffer(chunkIdx, hex, new ItemDrop { ItemId = itemId, Count = count });
        }
    }

    /// <summary>Units with an inventory standing on a hex that carries ground loot transfer the whole stack and clear it. Burst ISystem, single-worker Schedule — two units on the same loot hex in the same tick are rare but would race on both the hex drop buffer and their own inventories if parallelized; serialize instead.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(HarvestSystem))]
    public partial struct ItemPickupSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            state.Dependency = new ItemPickupJob
            {
                HexLookup  = hexLookup.Lookup,
                DropLookup = SystemAPI.GetBufferLookup<ItemDrop>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ItemPickupJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;

        [NativeDisableParallelForRestriction]
        public BufferLookup<ItemDrop> DropLookup;

        void Execute(in UnitMovement movement, in Faction faction, ref DynamicBuffer<InventorySlot> inventory)
        {
            if (faction.Value != FactionType.Player) return;
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hex)) return;
            if (!DropLookup.HasBuffer(hex)) return;

            var drops = DropLookup[hex];
            if (drops.Length == 0) return;

            for (int i = 0; i < drops.Length; i++)
                inventory.AddItem(drops[i].ItemId, drops[i].Count);
            drops.Clear();
        }
    }

    /// <summary>Any King or Hunter-role unit dwelling on a wild animal's hex tames it: flip Faction to Player, add TamedTag + OwnerRef. Main thread snapshots (hex, owner) pairs into NativeLists; Burst ISystem job runs in parallel over each untamed animal, emits component-add commands via ECB.ParallelWriter.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct TamingSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var priorityLookup = SystemAPI.GetComponentLookup<JobPriorities>(true);

            var tamerHexes  = new NativeList<int2>(16, Allocator.TempJob);
            var tamerOwners = new NativeList<Entity>(16, Allocator.TempJob);

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

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new TamingJob
            {
                TamerHexes  = tamerHexes.AsDeferredJobArray(),
                TamerOwners = tamerOwners.AsDeferredJobArray(),
                Ecb         = ecb,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = tamerHexes.Dispose(state.Dependency);
            state.Dependency = tamerOwners.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(PassiveAnimalTag))]
    [WithNone(typeof(TamedTag))]
    public partial struct TamingJob : IJobEntity
    {
        [ReadOnly] public NativeArray<int2>   TamerHexes;
        [ReadOnly] public NativeArray<Entity> TamerOwners;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in UnitMovement movement)
        {
            var animalHex = movement.CurrentHex;
            Entity owner = Entity.Null;
            for (int i = 0; i < TamerHexes.Length; i++)
            {
                if (TamerHexes[i].Equals(animalHex)) { owner = TamerOwners[i]; break; }
            }
            if (owner == Entity.Null) return;

            Ecb.AddComponent<TamedTag>(chunkIdx, entity);
            Ecb.AddComponent(chunkIdx, entity, new OwnerRef { Value = owner });
            Ecb.SetComponent(chunkIdx, entity, new Faction { Value = FactionType.Player });
        }
    }

    /// <summary>Passive animals override their Wander goal with a Flee goal when a non-Wildlife unit is within 2 hexes; cleared once safe. Main-thread snapshots threats into a NativeList then hands off to a Burst IJobEntity that mutates animal goals off-thread.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(WanderBehaviorSystem))]
    public partial struct WildlifeFleeSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var threats = new NativeList<int2>(64, Allocator.TempJob);
            foreach (var (movement, faction) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Faction>>()
                              .WithNone<PassiveAnimalTag>())
            {
                if (faction.ValueRO.Value == FactionType.Wildlife) continue;
                threats.Add(movement.ValueRO.CurrentHex);
            }

            state.Dependency = new WildlifeFleeJob
            {
                Threats = threats.AsDeferredJobArray(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = threats.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(PassiveAnimalTag))]
    [WithNone(typeof(TamedTag))]
    public partial struct WildlifeFleeJob : IJobEntity
    {
        const int FleeRadius = 2;

        [ReadOnly] public NativeArray<int2> Threats;

        void Execute(in UnitMovement movement, ref MovementGoal goal)
        {
            var here = movement.CurrentHex;
            int2 nearest = default;
            int  nearestD = int.MaxValue;
            for (int i = 0; i < Threats.Length; i++)
            {
                int d = HexDistance(here, Threats[i]);
                if (d < nearestD) { nearestD = d; nearest = Threats[i]; }
            }

            if (nearestD <= FleeRadius)
            {
                int2 away = new int2(here.x - nearest.x, here.y - nearest.y);
                if (away.x == 0 && away.y == 0) away = new int2(1, 0);
                int2 target = here + away * 2;
                if (goal.Priority <= GoalPriority.Flee)
                {
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.Flee,
                        Priority  = GoalPriority.Flee,
                        TargetHex = target,
                    };
                }
            }
            else if (goal.Kind == GoalKind.Flee)
            {
                goal = new MovementGoal
                {
                    Kind      = GoalKind.None,
                    Priority  = GoalPriority.None,
                    TargetHex = here,
                };
            }
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dq = a.x - b.x;
            int dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }
    }
}
