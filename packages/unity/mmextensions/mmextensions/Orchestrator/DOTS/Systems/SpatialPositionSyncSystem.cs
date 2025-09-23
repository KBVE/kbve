using Unity.Entities;
using Unity.Transforms;
using Unity.Burst;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Synchronizes SpatialPosition component with LocalTransform for KD-Tree indexing
    /// This ensures the spatial index has up-to-date positions for all moving entities
    /// TEMPORARILY DISABLED - causing system ordering issues
    /// </summary>
    [BurstCompile]
    [DisableAutoCreation]
    public partial struct SpatialPositionSyncSystem : ISystem
    {
        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Update SpatialPosition for all entities that have both components
            foreach (var (transform, spatial) in
                SystemAPI.Query<RefRO<LocalTransform>, RefRW<SpatialPosition>>())
            {
                spatial.ValueRW.Position = transform.ValueRO.Position;
            }
        }
    }
}