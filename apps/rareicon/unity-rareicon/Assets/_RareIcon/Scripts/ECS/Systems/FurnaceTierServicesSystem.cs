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
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var entities       = _furnacesWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup     = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var variantLookup  = SystemAPI.GetComponentLookup<BuildingVariant>(true);
            var prodLookup     = SystemAPI.GetComponentLookup<FurnaceProduction>(false);
            var hpLookup       = SystemAPI.GetComponentLookup<BuildingHealth>(true);
            var em = state.EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = tierLookup[e].Value;
                byte variant = variantLookup.HasComponent(e) ? variantLookup[e].Value : (byte)0;

                ApplyMaxHealth(ecb, e, tier, variant, hpLookup);

                if (tier == 0) continue;

                var recipe = ResolveRecipe(tier, variant);
                if (prodLookup.HasComponent(e)) prodLookup[e] = recipe;
                else em.AddComponentData(e, recipe);
            }
            entities.Dispose();
        }

        static void ApplyMaxHealth(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                                   ComponentLookup<BuildingHealth> hpLookup)
        {
            if (!hpLookup.HasComponent(e)) return;
            ushort newMax = tier switch
            {
                0 => 300,
                2 => 540,
                _ => (variant == 1) ? (ushort)320 : (ushort)420,
            };
            var hp = hpLookup[e];
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMax;
            hp.Value = (ushort)Unity.Mathematics.math.clamp((int)Unity.Mathematics.math.round(ratio * newMax), 0, newMax);
            ecb.SetComponent(e, hp);
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
