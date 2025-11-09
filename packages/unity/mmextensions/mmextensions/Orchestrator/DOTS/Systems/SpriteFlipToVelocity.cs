using Unity.Entities;
using Unity.Physics;
using Unity.Burst;
using Unity.Mathematics;
using Unity.Transforms;
using NSprites;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public partial struct SpriteFlipToVelocity : ISystem
    {
        [BurstCompile]
        [WithAll(typeof(SpriteFlipVelocityTag), typeof(PhysicsVelocity), typeof(Scale2D))]
        private partial struct FlipSpritesToVelocityDirectionJob : IJobEntity
        {
            public float SpriteFlipVelocityThreshold;

            private void Execute(SpriteFlipVelocityTag flipTag, ref PhysicsVelocity velocity, ref Scale2D scale2D)
            {
                float absX = math.abs(scale2D.value.x);
                if (velocity.Linear.x > SpriteFlipVelocityThreshold) scale2D.value.x = absX;
                else if (velocity.Linear.x < -SpriteFlipVelocityThreshold) scale2D.value.x = -absX;
            }
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var flipSpritesJob = new FlipSpritesToVelocityDirectionJob()
            {
                SpriteFlipVelocityThreshold = 2f
            };

            state.Dependency = flipSpritesJob.ScheduleParallelByRef(state.Dependency);
        }
    }
}
