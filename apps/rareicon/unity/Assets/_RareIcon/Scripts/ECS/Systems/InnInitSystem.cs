using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches InnLedger buffer + SurplusExport draining (Looters pull food from Capital to refill) on fresh InnTag entities. Structural changes via ECB.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct InnInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag>()
                .WithNone<InnLedger>()
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
            {
                var e = entities[i];
                ecb.AddBuffer<InnLedger>(e);
            }
            entities.Dispose();
        }
    }
}
