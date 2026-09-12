using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches OutpostLedger buffer on fresh OutpostTag entities. Food + Medkit flow into this ledger from Looter haulers; garrisoned Guards draw from it. Structural changes via ECB.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct OutpostInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<OutpostTag>()
                .WithNone<OutpostLedger>()
                .Build(ref state);
            state.RequireForUpdate(_needsInit);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var entities = _needsInit.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
                ecb.AddBuffer<OutpostLedger>(entities[i]);
            entities.Dispose();
        }
    }
}
