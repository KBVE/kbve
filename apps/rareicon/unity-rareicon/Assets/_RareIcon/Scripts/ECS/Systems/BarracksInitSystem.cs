using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches BarracksLedger + BarracksProduction + StorageCapacity + arrow-craft recipe + SurplusExport to any Barracks missing them.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct BarracksInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag>()
                .WithNone<BarracksProduction>()
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
                ecb.AddBuffer<BarracksLedger>(e);
                ecb.AddComponent(e, new BarracksProduction
                {
                    LastProducedTurn = 0,
                    CadenceTurns     = 1,
                    CoinCost         = 20,
                    FoodCost         = 20,
                });
                ecb.AddComponent(e, new StorageCapacity { Total = 200 });

                // Arrow recipe: inputs pulled from Capital, outputs held as a forward arsenal in
                // BarracksLedger; SurplusExport floor 20 drains the overflow back to Capital.
                var recipes = ecb.AddBuffer<ProductionRecipe>(e);
                recipes.Add(new ProductionRecipe
                {
                    Input1Id         = (ushort)ItemId.WoodLog,     Input1Amount  = 1,
                    Input2Id         = (ushort)ItemId.CactiNeedle, Input2Amount  = 1,
                    Input3Id         = (ushort)ItemId.Stone,       Input3Amount  = 1,
                    Output1Id        = (ushort)ItemId.Arrow,       Output1Amount = 10,
                    CycleDuration    = 18f,
                    CycleEndsAt      = 0f,
                    PullsFromCapital = 1,
                });

                var exports = ecb.AddBuffer<SurplusExport>(e);
                exports.Add(new SurplusExport { ItemId = (ushort)ItemId.Arrow, Floor = 20 });
            }
            entities.Dispose();
        }
    }
}
