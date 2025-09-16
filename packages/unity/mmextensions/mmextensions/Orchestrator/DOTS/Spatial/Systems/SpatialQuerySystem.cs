using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// Handles spatial queries for minions
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(SpatialIndexingSystem))]
    public partial class SpatialQuerySystem : SystemBase
    {
        protected override void OnUpdate()
        {
            // Process spatial query requests
            Entities
                .WithName("ProcessSpatialQueries")
                .ForEach((
                    Entity entity,
                    ref DynamicBuffer<SpatialQueryResult> results,
                    in SpatialQueryRequest request,
                    in SpatialPosition position) =>
                {
                    results.Clear();

                    // Simple brute force for now
                    // In production, use KDTree from SpatialIndexingSystem
                })
                .ScheduleParallel();
        }
    }
}