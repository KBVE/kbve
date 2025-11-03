using Unity.Entities;
using Unity.Burst;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Lightweight system that syncs EntityData.WorldPos with actual entity positions.
    /// Critical for multiplayer - ensures authoritative position data stays current.
    /// Runs late in SimulationSystemGroup to capture final positions after transforms and physics.
    ///
    /// Note: TransformSystemGroup and PhysicsSystemGroup update within SimulationSystemGroup.
    /// We run at OrderLast to ensure we capture all position updates from this frame.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    public partial struct EntityDataPositionSyncSystem : ISystem
    {
        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Schedule the position sync job to run asynchronously
            // Uses WithChangeFilter to only process entities whose position changed this frame
            var syncJob = new SyncPositionJob();
            state.Dependency = syncJob.ScheduleParallel(state.Dependency);
        }

        /// <summary>
        /// Burst-compiled job that syncs EntityData.WorldPos with LocalToWorld position
        /// Only runs on entities that moved this frame (change filter)
        /// </summary>
        [BurstCompile]
        [WithChangeFilter(typeof(LocalToWorld))]
        private partial struct SyncPositionJob : IJobEntity
        {
            private void Execute(ref EntityComponent entityComponent, in LocalToWorld localToWorld)
            {
                // Update stored EntityData.WorldPos to match current position
                var entityData = entityComponent.Data;
                entityData.WorldPos = localToWorld.Position;
                entityComponent.Data = entityData;
            }
        }
    }
}