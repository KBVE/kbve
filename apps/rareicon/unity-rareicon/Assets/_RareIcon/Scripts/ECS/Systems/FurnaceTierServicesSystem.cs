using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Furnace <see cref="BuildingTier"/> change — swaps the <see cref="FurnaceProduction"/> recipe and cadence by tier + variant. T0 keeps the biome-resolved baseline written by <see cref="FurnaceInitSystem"/>. T1 default (variant 0 = Forge): faster cadence + Iron-ore smelt loop. T1 alt (variant 1 = Glassworks): sand + coal → glass + lens. T2 (Foundry): high-tier alloy recipe. Mirrors the Dock / Inn tier-services pattern; change-filter so the work fires once per upgrade, not every frame.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct FurnaceTierServicesSystem : ISystem
    {
        EntityQuery _furnacesWithTier;

        public void OnCreate(ref SystemState state)
        {
            _furnacesWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FurnaceTag, BuildingTier>()
                .Build(ref state);
            _furnacesWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_furnacesWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var entities       = _furnacesWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup     = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var variantLookup  = SystemAPI.GetComponentLookup<BuildingVariant>(true);
            var prodLookup     = SystemAPI.GetComponentLookup<FurnaceProduction>(false);
            var em = state.EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = tierLookup[e].Value;
                byte variant = variantLookup.HasComponent(e) ? variantLookup[e].Value : (byte)0;

                if (tier == 0) continue; // FurnaceInitSystem owns T0 recipe.

                var recipe = ResolveRecipe(tier, variant);
                if (prodLookup.HasComponent(e)) prodLookup[e] = recipe;
                else em.AddComponentData(e, recipe);
            }
            entities.Dispose();
        }

        static FurnaceProduction ResolveRecipe(byte tier, byte variant)
        {
            ushort log     = (ushort)ItemId.Log;
            ushort coal    = (ushort)ItemId.Coal;
            ushort ash     = (ushort)ItemId.Ash;
            ushort sand    = (ushort)ItemId.NaturalSand;
            ushort glass   = (ushort)ItemId.RawGlass;
            ushort ironOre = (ushort)ItemId.IronOre;
            ushort goldBar = (ushort)ItemId.GoldBar;

            // T2 Foundry — heavy alloy smelt, slowest cadence but biggest yield.
            if (tier >= 2)
            {
                return new FurnaceProduction
                {
                    Input1Id = ironOre, Input1Amount = 4,
                    Input2Id = coal,    Input2Amount = 2,
                    Output1Id = goldBar, Output1Amount = 1,
                    Output2Id = ash,     Output2Amount = 2,
                    Output3Id = 0,       Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 12f,
                };
            }

            // T1 Glassworks — sand-based glass + lens crafting loop.
            if (variant == 1)
            {
                return new FurnaceProduction
                {
                    Input1Id = sand, Input1Amount = 3,
                    Input2Id = coal, Input2Amount = 1,
                    Output1Id = glass, Output1Amount = 2,
                    Output2Id = ash,   Output2Amount = 1,
                    Output3Id = 0,     Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 6f,
                };
            }

            // T1 Forge default — log + iron ore → coal + ironingot proxy
            // (we reuse coal/ash slots until a dedicated IronIngot item lands).
            return new FurnaceProduction
            {
                Input1Id = log,     Input1Amount = 4,
                Input2Id = ironOre, Input2Amount = 2,
                Output1Id = coal, Output1Amount = 3,
                Output2Id = ash,  Output2Amount = 2,
                Output3Id = 0,    Output3Amount = 0,
                CycleEndsAt = 0f, CycleDuration = 7f,
            };
        }
    }
}
