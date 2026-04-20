using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Fades BloodDecal alpha over its lifetime and destroys it once past DespawnAtAbsSeconds (reads WorldClock for cross-unload consistency).</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct BloodDecalDecaySystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BloodDecal>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float abs = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (decal, fade, entity) in
                SystemAPI.Query<RefRO<BloodDecal>, RefRW<BloodDecalFadeVisual>>().WithEntityAccess())
            {
                var d = decal.ValueRO;
                float life = d.DespawnAtAbsSeconds - d.SpawnedAtAbsSeconds;
                if (life <= 0f)
                {
                    ecb.DestroyEntity(entity);
                    continue;
                }

                float remaining = d.DespawnAtAbsSeconds - abs;
                if (remaining <= 0f)
                {
                    ecb.DestroyEntity(entity);
                    continue;
                }

                float t = math.saturate(remaining / life);
                fade.ValueRW.Value = t * t;
            }

            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }
}
