using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Destroys buildings whose BuildingHealth hit 0 and releases HexOccupant on every footprint tile. Filter + destroy happens in a Burst IJobEntity so the dependency chain handles sync with BuildingRepairSystem writes; no main-thread reads of BuildingHealth.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct BuildingDeathSystem : ISystem
    {
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<BuildingHealth>();
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookupSingleton)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            bool hasEvents = false;
            var events = default(NativeList<BuildingEvent>.ParallelWriter);
            if (SystemAPI.HasSingleton<BuildingsDBSingleton>())
            {
                var db = SystemAPI.GetSingleton<BuildingsDBSingleton>();
                if (db.Events.IsCreated)
                {
                    int query = SystemAPI.QueryBuilder().WithAll<BuildingHealth, Building>().Build().CalculateEntityCount();
                    int needed = db.Events.Length + query;
                    if (db.Events.Capacity < needed) db.Events.Capacity = needed;
                    events = db.Events.AsParallelWriter();
                    hasEvents = true;
                }
            }

            state.Dependency = new BuildingDeathJob
            {
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                Ecb               = ecb.AsParallelWriter(),
                Events            = events,
                HasEvents         = hasEvents,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BuildingDeathJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;
        public NativeList<BuildingEvent>.ParallelWriter Events;
        public bool HasEvents;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in BuildingHealth hp,
                     in Building building)
        {
            if (hp.Value > 0) return;

            Ecb.DestroyEntity(chunkIdx, entity);

            if (HasEvents)
            {
                Events.AddNoResize(new BuildingEvent
                {
                    Kind         = BuildingEventKind.Destroyed,
                    Entity       = entity,
                    Type         = building.Type,
                    RootHex      = building.RootHex,
                    OwnerFaction = building.OwnerFaction,
                });
            }

            // Capital footprint is the 7-hex flower; every other building
            // claims just its root hex. Hardcoded here because BuildingDB
            // returns a managed int2[] that Burst can't reach.
            FreeHex(chunkIdx, building.RootHex);
            if (building.Type == BuildingType.Capital)
            {
                FreeHex(chunkIdx, building.RootHex + new int2( 1,  0));
                FreeHex(chunkIdx, building.RootHex + new int2(-1,  0));
                FreeHex(chunkIdx, building.RootHex + new int2( 0,  1));
                FreeHex(chunkIdx, building.RootHex + new int2( 0, -1));
                FreeHex(chunkIdx, building.RootHex + new int2( 1, -1));
                FreeHex(chunkIdx, building.RootHex + new int2(-1,  1));
            }
        }

        void FreeHex(int chunkIdx, int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;
            Ecb.RemoveComponent<HexOccupant>(chunkIdx, tile);
        }
    }
}
