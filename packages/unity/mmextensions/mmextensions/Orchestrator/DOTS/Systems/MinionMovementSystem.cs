using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Handles movement for all minions
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionBehaviorSystem))]
    public partial class MinionMovementSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;

            Entities
                .WithName("UpdateMinionPositions")
                .ForEach((
                    ref LocalTransform transform,
                    ref SpatialPosition spatial,
                    in MinionData minion) =>
                {
                    // Simple movement for now
                    if ((minion.StateFlags & MinionStateFlags.Moving) != 0)
                    {
                        // Update position based on velocity
                        transform.Position += spatial.Velocity * deltaTime;

                        // Update spatial position
                        spatial.UpdatePosition(transform.Position);
                    }
                })
                .ScheduleParallel();
        }
    }
}