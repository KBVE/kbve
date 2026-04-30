using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Mining Pit <see cref="BuildingTier"/> change — when the pit upgrades to T1 (Quarry) the system appends a Stone → StoneBlock <see cref="ProductionRecipe"/> to its existing recipe buffer so the pit keeps producing raw Stone AND starts dressing some of it into StoneBlock. Tender (Miner) requirement is shared by both recipes via <see cref="ProductionSystem.MiningPitProductionJob"/>'s tender gate. Idempotent — re-runs at the same tier no-op via the recipe-already-present check.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct MiningPitTierServicesSystem : ISystem
    {
        EntityQuery _pitsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _pitsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<MiningPitTag, BuildingTier, ProductionRecipe>()
                .Build(ref state);

            _pitsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_pitsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var entities   = _pitsWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var em         = state.EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e    = entities[i];
                byte tier = tierLookup[e].Value;
                if (tier < 1) continue;
                if (!em.HasBuffer<ProductionRecipe>(e)) continue;

                var recipes = em.GetBuffer<ProductionRecipe>(e);
                if (HasStoneBlockRecipe(recipes)) continue;

                recipes.Add(new ProductionRecipe
                {
                    Input1Id      = (ushort)ItemId.Stone,
                    Input1Amount  = 2,
                    Output1Id     = (ushort)ItemId.StoneBlock,
                    Output1Amount = 1,
                    CycleDuration = 12f,
                    CycleEndsAt   = 0f,
                });
            }
            entities.Dispose();
        }

        static bool HasStoneBlockRecipe(in DynamicBuffer<ProductionRecipe> recipes)
        {
            for (int i = 0; i < recipes.Length; i++)
                if (recipes[i].Output1Id == (ushort)ItemId.StoneBlock) return true;
            return false;
        }
    }
}
