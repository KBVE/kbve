using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial struct JobMovementExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }
        [BurstCompile] public void OnUpdate(ref SystemState state) { }
    }
}
