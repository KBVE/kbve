using Unity.Entities;
using Unity.Transforms;
using Unity.Burst;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Efficiently synchronizes SpatialPosition component with LocalTransform for KD-Tree indexing
    /// Only updates positions that have actually moved to reduce overhead
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    [BurstCompile]
    public partial struct SpatialPositionSyncSystem : ISystem
    {
        private const float MovementThreshold = 0.01f; // Only update if moved more than this

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Only update positions that have actually moved (optimization for 100k entities)
            new UpdateSpatialPositionJob
            {
                MovementThresholdSq = MovementThreshold * MovementThreshold
            }.ScheduleParallel();
        }

        [BurstCompile]
        private partial struct UpdateSpatialPositionJob : IJobEntity
        {
            public float MovementThresholdSq;

            private void Execute(in LocalTransform transform, ref SpatialPosition spatial)
            {
                var newPos = transform.Position;
                var distSq = math.distancesq(spatial.Position, newPos);

                // Only update if position changed significantly
                if (distSq > MovementThresholdSq)
                {
                    spatial.UpdatePosition(newPos);
                }
            }
        }
    }
}