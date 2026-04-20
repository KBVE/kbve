using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Destroys GroundArrow entities once WorldClock.AbsSeconds passes their DespawnAtAbsSeconds; Looter pickups remove them earlier.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct GroundArrowDecaySystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<GroundArrow>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float abs = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (arrow, entity) in
                     SystemAPI.Query<RefRO<GroundArrow>>().WithEntityAccess())
            {
                if (abs >= arrow.ValueRO.DespawnAtAbsSeconds)
                    ecb.DestroyEntity(entity);
            }

            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }
}
