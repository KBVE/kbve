using Unity.Entities;
using Unity.Physics;
using Unity.Burst;
using Unity.Transforms;
using Unity.Mathematics;

public partial struct PositionRotationLocking2DSystem : ISystem
{
    [BurstCompile]
    [WithAll(typeof(PhysicsVelocity), typeof(LocalTransform))]
    private partial struct Constrain2DAxisJob : IJobEntity
    {
        private void Execute(ref PhysicsVelocity velocity, ref LocalTransform transform)
        {
            velocity.Angular = new float3(0f, 0f, 0f);
            transform.Position.z = 0;
            transform.Rotation = quaternion.identity;
        }
    }

    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        var constrainJob = new Constrain2DAxisJob();
        state.Dependency = constrainJob.ScheduleParallelByRef(state.Dependency);
    }
}
