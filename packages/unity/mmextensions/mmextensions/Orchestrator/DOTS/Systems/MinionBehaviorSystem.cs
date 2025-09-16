using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Handles AI behavior for minions
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class MinionBehaviorSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float elapsedTime = (float)SystemAPI.Time.ElapsedTime;

            Entities
                .WithName("UpdateMinionBehavior")
                .ForEach((
                    ref MinionData minion,
                    ref SpatialPosition spatial,
                    in LocalTransform transform) =>
                {
                    // Simple behavior patterns based on type
                    switch (minion.Type)
                    {
                        case MinionType.Basic:
                            // Simple patrol behavior
                            if ((minion.StateFlags & MinionStateFlags.Moving) == 0)
                            {
                                minion.StateFlags |= MinionStateFlags.Moving;
                                spatial.Velocity = new float3(
                                    math.sin(elapsedTime) * minion.Speed,
                                    0,
                                    math.cos(elapsedTime) * minion.Speed
                                );
                            }
                            break;

                        case MinionType.Fast:
                            // Rapid movement
                            minion.StateFlags |= MinionStateFlags.Moving;
                            break;

                        case MinionType.Tank:
                            // Slow, defensive movement
                            if ((minion.StateFlags & MinionStateFlags.Aggro) != 0)
                            {
                                minion.StateFlags |= MinionStateFlags.Moving;
                            }
                            break;
                    }
                })
                .ScheduleParallel();
        }
    }
}