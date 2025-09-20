using Unity.Entities;
using Unity.Burst;
using Unity.Transforms;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// System to synchronize WorldPosition2D with LocalTransform for NSprites rendering
    /// Based on Age-of-Sprites pattern where 2D positions need to stay in sync with transforms
    /// </summary>
    [UpdateInGroup(typeof(TransformSystemGroup))]
    [UpdateAfter(typeof(LocalToWorldSystem))]
    public partial class WorldPosition2DSyncSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            // Sync WorldPosition2D with LocalTransform for all entities that have both
            Entities
                .WithName("SyncWorldPosition2D")
                .ForEach((ref WorldPosition2D worldPos, in LocalTransform transform) =>
                {
                    // Update 2D position from 3D transform (using X and Z for 2D plane)
                    worldPos.Value = new float2(transform.Position.x, transform.Position.z);
                })
                .ScheduleParallel();
        }
    }
}