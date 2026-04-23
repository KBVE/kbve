using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Ticks active RegenBuff components: restores Health.Value by AmountPerSecond * dt each frame, clamps at Health.Max, removes the component via the end-sim ECB when TimeRemaining ≤ 0. Runs in BehaviorSystemGroup after ReliefSystem so consumption-side systems (Medkit, food-at-Barracks) have already added/refreshed the buff this frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial struct RegenBuffSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            if (dt <= 0f) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(state.WorldUnmanaged);

            foreach (var (buffRW, healthRW, entity) in
                     SystemAPI.Query<RefRW<RegenBuff>, RefRW<Health>>().WithEntityAccess())
            {
                ref var buff   = ref buffRW.ValueRW;
                ref var health = ref healthRW.ValueRW;

                buff.TimeRemaining -= dt;
                health.Value = math.min(health.Max, health.Value + buff.AmountPerSecond * dt);

                if (buff.TimeRemaining <= 0f)
                    ecb.RemoveComponent<RegenBuff>(entity);
            }
        }
    }
}
