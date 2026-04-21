using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Fades BloodDecal alpha via (remaining/life)² and destroys past DespawnAtAbsSeconds; async ECB via EndSimulationEntityCommandBufferSystem.</summary>
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
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new BloodDecalDecayJob
            {
                AbsNow = abs,
                Ecb    = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BloodDecalDecayJob : IJobEntity
    {
        public float AbsNow;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in BloodDecal decal,
                     ref BloodDecalFadeVisual fade)
        {
            float life = decal.DespawnAtAbsSeconds - decal.SpawnedAtAbsSeconds;
            if (life <= 0f)
            {
                Ecb.DestroyEntity(chunkIdx, entity);
                return;
            }

            float remaining = decal.DespawnAtAbsSeconds - AbsNow;
            if (remaining <= 0f)
            {
                Ecb.DestroyEntity(chunkIdx, entity);
                return;
            }

            float t = math.saturate(remaining / life);
            fade.Value = t * t;
        }
    }
}
