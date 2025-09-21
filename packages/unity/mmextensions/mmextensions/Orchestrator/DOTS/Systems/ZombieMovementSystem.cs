using Unity.Burst;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Simple zombie movement system - makes zombies wander around
    /// Following Age-of-Sprites simple approach
    /// </summary>
    [BurstCompile]
    public partial struct ZombieMovementSystem : ISystem
    {
        [BurstCompile]
        private partial struct ZombieMoveJob : IJobEntity
        {
            public float DeltaTime;
            public float Time;

            private void Execute(ref LocalTransform transform, ref ZombieDirection direction, in ZombieSpeed speed)
            {
                // Much more chaotic movement - change direction frequently!
                var seed = (uint)(math.abs(transform.Position.x * 1000) + math.abs(transform.Position.y * 1000) + Time * 100);
                var random = new Unity.Mathematics.Random(seed);

                // Randomly change direction 2% of the time for performance with 1k+ entities
                if (random.NextFloat() < 0.02f)
                {
                    direction.value = random.NextFloat2Direction();
                }

                // Add some random wobble to the movement (reduced for performance)
                float2 wobble = random.NextFloat2(-0.3f, 0.3f);
                float2 finalDirection = math.normalize(direction.value + wobble);

                // Apply chaotic movement (keep Z at 1)
                var newPosition = transform.Position + new float3(
                    finalDirection.x * speed.value * DeltaTime,
                    finalDirection.y * speed.value * DeltaTime,
                    0
                );
                newPosition.z = 1; // Ensure Z stays at 1
                transform.Position = newPosition;
            }
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var moveJob = new ZombieMoveJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime,
                Time = (float)SystemAPI.Time.ElapsedTime
            };

            state.Dependency = moveJob.ScheduleParallel(state.Dependency);
        }
    }
}