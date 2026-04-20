using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Destroys buildings whose BuildingHealth hit 0 and releases HexOccupant on every footprint tile. Footprints are resolved on main thread into a NativeArray so the job doesn't touch BuildingDB's managed tables.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct BuildingDeathSystem : ISystem
    {
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<BuildingHealth>();
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!HexHoverSystem.HexLookup.IsCreated) return;

            // Resolve dead buildings + their footprint hexes on main thread
            // (BuildingDB.GetFootprint returns a managed int2[]) so the job
            // stays Burst-safe with a flat blittable buffer.
            using var deadQuery = state.EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<BuildingHealth>(),
                ComponentType.ReadOnly<Building>());
            using var candidates = deadQuery.ToEntityArray(Allocator.TempJob);

            var hpLookup   = SystemAPI.GetComponentLookup<BuildingHealth>(true);
            var buildLookup = SystemAPI.GetComponentLookup<Building>(true);

            var deadEntities = new NativeList<Entity>(candidates.Length, Allocator.TempJob);
            var deadHexes    = new NativeList<int2>(candidates.Length * 7, Allocator.TempJob);
            for (int i = 0; i < candidates.Length; i++)
            {
                var e = candidates[i];
                if (hpLookup[e].Value > 0) continue;
                var b = buildLookup[e];
                deadEntities.Add(e);

                var footprint = BuildingDB.GetFootprint(b.Type);
                for (int f = 0; f < footprint.Length; f++)
                    deadHexes.Add(b.RootHex + footprint[f]);
            }

            if (deadEntities.Length == 0)
            {
                deadEntities.Dispose();
                deadHexes.Dispose();
                return;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new BuildingDeathJob
            {
                DeadEntities      = deadEntities.AsDeferredJobArray(),
                DeadHexes         = deadHexes.AsDeferredJobArray(),
                HexLookup         = HexHoverSystem.HexLookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                Ecb               = ecb,
            }.Schedule(state.Dependency);

            state.Dependency = deadEntities.Dispose(state.Dependency);
            state.Dependency = deadHexes.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public struct BuildingDeathJob : Unity.Jobs.IJob
    {
        [ReadOnly] public NativeArray<Entity>           DeadEntities;
        [ReadOnly] public NativeArray<int2>             DeadHexes;
        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;

        public EntityCommandBuffer Ecb;

        public void Execute()
        {
            for (int i = 0; i < DeadEntities.Length; i++)
                Ecb.DestroyEntity(DeadEntities[i]);

            for (int i = 0; i < DeadHexes.Length; i++)
            {
                if (!HexLookup.TryGetValue(DeadHexes[i], out var tile)) continue;
                if (!HexOccupantLookup.HasComponent(tile)) continue;
                Ecb.RemoveComponent<HexOccupant>(tile);
            }
        }
    }
}
