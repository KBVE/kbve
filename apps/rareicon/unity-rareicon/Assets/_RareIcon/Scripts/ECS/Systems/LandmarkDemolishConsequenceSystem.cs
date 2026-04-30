using MessagePipe;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Detector for landmark demolitions. Runs in <see cref="InitializationSystemGroup"/> before <see cref="DemolishBuildingSystem"/> so it can capture the target's <see cref="LandmarkRef"/> shared-component slug + root hex while the entity still exists, then publishes a <see cref="LandmarkDemolishedEvent"/> on the MessagePipe bus. <see cref="WorldEventHandler"/> subscribes to that event and runs the per-flavor consequence (shrine zombies, tree timber, vein stone, market coin, curse damage). Decoupled from the consequence so the same channel handles both gameplay-triggered events (this) and scheduler-rolled events (<see cref="WorldEventTriggeredMessage"/>). Stays managed (no <see cref="Unity.Burst.BurstCompileAttribute"/>) — shared-component access + GlobalMessagePipe publish are both non-Burst paths, so ISystem runs as a partial struct without the Burst-direct attribute.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateBefore(typeof(DemolishBuildingSystem))]
    public partial struct LandmarkDemolishDetectorSystem : ISystem
    {
        EntityQuery _requestQuery;

        public void OnCreate(ref SystemState state)
        {
            _requestQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<DemolishRequest>()
                .Build(ref state);
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (_requestQuery.CalculateEntityCount() == 0) return;

            IPublisher<LandmarkDemolishedEvent> pub;
            try { pub = GlobalMessagePipe.GetPublisher<LandmarkDemolishedEvent>(); }
            catch { return; }
            if (pub == null) return;

            var em = state.EntityManager;
            using var arr = _requestQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var reqEntity = arr[i];
                if (!em.HasComponent<DemolishRequest>(reqEntity)) continue;
                var req = em.GetComponentData<DemolishRequest>(reqEntity);
                var target = req.Target;
                if (target == Entity.Null || !em.Exists(target)) continue;
                if (!em.HasComponent<Building>(target)) continue;
                if (em.GetComponentData<Building>(target).Type != BuildingType.Landmark) continue;
                if (!em.HasComponent<LandmarkRef>(target)) continue;

                var lr  = em.GetSharedComponentManaged<LandmarkRef>(target);
                var hex = em.GetComponentData<Building>(target).RootHex;
                pub.Publish(new LandmarkDemolishedEvent(lr.Value, hex));
            }
        }
    }
}
