using Unity.Entities;
using Unity.Burst;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Lightweight system that syncs EntityData.WorldPos with actual entity positions.
    /// Critical for multiplayer - ensures authoritative position data stays current.
    /// Runs after all movement/physics to capture final positions.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(TransformSystemGroup))] // After all position updates
    [UpdateAfter(typeof(Unity.Physics.Systems.PhysicsSystemGroup))] // After physics updates
    public partial struct EntityDataPositionSyncSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            // Only process entities with both EntityComponent and LocalToWorld that have moved
            foreach (var (entityComponent, localToWorld) in SystemAPI.Query<RefRW<EntityComponent>, RefRO<LocalToWorld>>()
                .WithChangeFilter<LocalToWorld>()) // Only entities whose position changed this frame
            {
                // Update stored EntityData.WorldPos to match current position
                var entityData = entityComponent.ValueRO.Data;
                entityData.WorldPos = localToWorld.ValueRO.Position;
                entityComponent.ValueRW.Data = entityData;
            }
        }
    }
}