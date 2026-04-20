using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>Auto-shelters the idle King onto the Capital footprint (hidden + suspended) and processes UI-published ReleaseShelterRequest entities. Sheltered units keep their Entity + state; only render / movement / collision / command participation pauses. Burst ISystem: release + destroy run ScheduleParallel via ECB, shelter-king pass runs ScheduleParallel with readonly HexLookup/Occupant/Capital lookups.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct ShelterSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ProcessReleases(ref state);
            AutoShelterKing(ref state);
        }

        void ProcessReleases(ref SystemState state)
        {
            var hosts = new NativeList<Entity>(4, Allocator.TempJob);
            foreach (var req in SystemAPI.Query<RefRO<ReleaseShelterRequest>>())
                hosts.Add(req.ValueRO.Host);

            if (hosts.Length == 0)
            {
                hosts.Dispose();
                return;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new ReleaseShelterJob
            {
                Hosts = hosts.AsDeferredJobArray(),
                Ecb   = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new DestroyReleaseRequestJob
            {
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = hosts.Dispose(state.Dependency);
        }

        void AutoShelterKing(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new AutoShelterKingJob
            {
                HexLookup      = hexLookup.Lookup,
                OccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                CapitalLookup  = SystemAPI.GetComponentLookup<CapitalTag>(true),
                CooldownLookup = SystemAPI.GetComponentLookup<ShelterCooldown>(true),
                Ecb            = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(ShelteredInside))]
    public partial struct ReleaseShelterJob : IJobEntity
    {
        [ReadOnly] public NativeArray<Entity> Hosts;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in ShelteredInside shelter,
                     in UnitMovement movement)
        {
            for (int i = 0; i < Hosts.Length; i++)
            {
                if (shelter.Host != Hosts[i]) continue;

                Ecb.RemoveComponent<ShelteredInside>(chunkIdx, entity);
                Ecb.RemoveComponent<DisableRendering>(chunkIdx, entity);
                Ecb.AddComponent(chunkIdx, entity, new ShelterCooldown
                {
                    WanderStepAtRelease = movement.WanderStep,
                });
                return;
            }
        }
    }

    [BurstCompile]
    [WithAll(typeof(ReleaseShelterRequest))]
    public partial struct DestroyReleaseRequestJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx)
        {
            Ecb.DestroyEntity(chunkIdx, entity);
        }
    }

    [BurstCompile]
    [WithAll(typeof(KingTag), typeof(ControlledUnitTag))]
    [WithNone(typeof(ShelteredInside))]
    public partial struct AutoShelterKingJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>      HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>     OccupantLookup;
        [ReadOnly] public ComponentLookup<CapitalTag>      CapitalLookup;
        [ReadOnly] public ComponentLookup<ShelterCooldown> CooldownLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in UnitMovement movement,
                     in MovementGoal goal)
        {
            if (goal.Kind != GoalKind.None) return;
            if (!movement.CurrentHex.Equals(movement.TargetHex)) return;

            if (CooldownLookup.HasComponent(entity))
            {
                var cd = CooldownLookup[entity];
                if (cd.WanderStepAtRelease == movement.WanderStep) return;
            }

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!OccupantLookup.HasComponent(tile)) return;

            var building = OccupantLookup[tile].Building;
            if (building == Entity.Null) return;
            if (!CapitalLookup.HasComponent(building)) return;

            Ecb.AddComponent(chunkIdx, entity, new ShelteredInside { Host = building });
            Ecb.AddComponent<DisableRendering>(chunkIdx, entity);
        }
    }
}
