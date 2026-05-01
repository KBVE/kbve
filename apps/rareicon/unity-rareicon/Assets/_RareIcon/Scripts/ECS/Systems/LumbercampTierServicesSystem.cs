using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Lumbercamp <see cref="BuildingTier"/> change — when the camp upgrades to T1 (Sawmill) the system appends a Log → Timber <see cref="ProductionRecipe"/> to its existing recipe buffer so the camp keeps producing raw Log AND starts converting some of it into Timber. Tender (Lumberjack) requirement is shared by both recipes via <see cref="ProductionSystem.LumbercampProductionJob"/>'s tender gate. Idempotent — re-runs at the same tier are no-ops because the recipe-already-present check guards the buffer append.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct LumbercampTierServicesSystem : ISystem
    {
        EntityQuery _campsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _campsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<LumbercampTag, BuildingTier, ProductionRecipe>()
                .Build(ref state);

            _campsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_campsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var entities    = _campsWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup  = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var em          = state.EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e    = entities[i];
                byte tier = tierLookup[e].Value;
                if (tier < 1) continue;
                if (!em.HasBuffer<ProductionRecipe>(e)) continue;

                var recipes = em.GetBuffer<ProductionRecipe>(e);
                if (HasTimberRecipe(recipes)) continue;

                recipes.Add(new ProductionRecipe
                {
                    Input1Id      = (ushort)ItemId.Log,
                    Input1Amount  = 2,
                    Output1Id     = (ushort)ItemId.Timber,
                    Output1Amount = 1,
                    CycleDuration = 10f,
                    CycleEndsAt   = 0f,
                });
            }
            entities.Dispose();
        }

        static bool HasTimberRecipe(in DynamicBuffer<ProductionRecipe> recipes)
        {
            for (int i = 0; i < recipes.Length; i++)
                if (recipes[i].Output1Id == (ushort)ItemId.Timber) return true;
            return false;
        }
    }
}
