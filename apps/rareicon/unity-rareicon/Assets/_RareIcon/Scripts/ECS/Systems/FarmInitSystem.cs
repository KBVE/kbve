using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Ensures every FarmTag entity carries the default farm composition — Compost → Carrot ProductionRecipe, FarmLedger, SurplusExport list (keep 8 Carrots locally for livestock feed, ship everything else), TenderMultiplier, FarmLivestock buffer. ISystem + Burst; structural changes go through ECB so OnUpdate stays off the main thread.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct FarmInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FarmTag>()
                .WithNone<ProductionRecipe>()
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
                ecb.AddBuffer<FarmLedger>(e);

                var recipes = ecb.AddBuffer<ProductionRecipe>(e);
                recipes.Add(new ProductionRecipe
                {
                    Input1Id         = (ushort)ItemId.Compost, Input1Amount = 1,
                    Output1Id        = (ushort)ItemId.Carrot,  Output1Amount = 1,
                    CycleDuration    = 8f,
                    CycleEndsAt      = 0f,
                    PullsFromCapital = 1,
                });

                var exports = ecb.AddBuffer<SurplusExport>(e);
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Carrot, Floor = 8 });
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Egg,    Floor = 0 });
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Milk,   Floor = 0 });
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Wool,   Floor = 0 });
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Meat,   Floor = 0 });

                ecb.AddComponent(e, new TenderMultiplier { Value = 0f });
                ecb.AddBuffer<FarmLivestock>(e);
            }
            entities.Dispose();
        }
    }
}
