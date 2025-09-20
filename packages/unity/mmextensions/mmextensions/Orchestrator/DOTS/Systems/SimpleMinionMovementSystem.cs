using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Simple movement system for testing sprite position updates
    /// Makes minions wander randomly to verify NSprites follows transform changes
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [BurstCompile]
    public partial struct SimpleMinionMovementSystem : ISystem
    {
        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var deltaTime = SystemAPI.Time.DeltaTime;
            var elapsedTime = (float)SystemAPI.Time.ElapsedTime;

            // Move all minions in a simple pattern to test sprite following
            foreach (var (transform, localToWorld, minionData) in
                SystemAPI.Query<RefRW<LocalTransform>, RefRW<LocalToWorld>, RefRO<MinionData>>())
            {
                // Simple circular movement pattern for testing
                float radius = 5f + minionData.ValueRO.Level; // Different radius per level
                float speed = minionData.ValueRO.Speed * 0.5f; // Use minion's speed stat

                // Calculate new position in a circle
                float angle = elapsedTime * speed * 0.2f + minionData.ValueRO.Health * 0.01f; // Offset by health for variety
                float3 newPosition = new float3(
                    math.cos(angle) * radius,
                    0f,
                    math.sin(angle) * radius
                );

                // Add some random wandering on top of circular motion
                var random = new Unity.Mathematics.Random((uint)(minionData.ValueRO.Health + elapsedTime * 1000));
                newPosition += new float3(
                    random.NextFloat(-1f, 1f) * 0.1f,
                    0f,
                    random.NextFloat(-1f, 1f) * 0.1f
                );

                // Update transform position
                transform.ValueRW.Position = newPosition;

                // Optional: rotate to face movement direction
                quaternion rotation = quaternion.identity;
                if (math.lengthsq(newPosition) > 0.01f)
                {
                    rotation = quaternion.LookRotationSafe(
                        math.normalize(newPosition),
                        math.up()
                    );
                    transform.ValueRW.Rotation = rotation;
                }

                // Force update LocalToWorld for NSprites
                localToWorld.ValueRW.Value = float4x4.TRS(newPosition, rotation, new float3(1f));
            }
        }
    }
}