using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Strips <see cref="MoraleBuff"/> components once <see cref="WorldClock"/>.TurnIndex reaches the buff's <see cref="MoraleBuff.ExpiresAtTurn"/>. Cheap iteration — only buffed units are touched, and the work scales with active buff count, not with the unit pool size.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct MoraleBuffExpirySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<MoraleBuff>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            foreach (var (buff, entity) in
                     SystemAPI.Query<RefRO<MoraleBuff>>().WithEntityAccess())
            {
                if (turn >= buff.ValueRO.ExpiresAtTurn)
                    ecb.RemoveComponent<MoraleBuff>(entity);
            }
        }
    }
}
