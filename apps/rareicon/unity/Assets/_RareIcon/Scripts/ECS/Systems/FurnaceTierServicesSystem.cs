using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Furnace <see cref="BuildingTier"/> change — swaps the <see cref="FurnaceProduction"/> recipe + cadence and rebakes <see cref="BuildingHealth"/> per tier + variant. T0 keeps the biome-resolved baseline written by <see cref="FurnaceInitSystem"/>; T1 default (Forge), T1 alt 1 (Glassworks), T2 (Foundry). Off-main-thread via parallel <see cref="FurnaceRebakeJob"/>; structural <see cref="FurnaceProduction"/> add/set goes through an end-of-frame ECB so chunk layout doesn't change mid-job.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct FurnaceTierServicesSystem : ISystem
    {
        EntityQuery _furnacesWithTier;

        public void OnCreate(ref SystemState state)
        {
            _furnacesWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FurnaceTag, BuildingTier, BuildingHealth>()
                .Build(ref state);
            _furnacesWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_furnacesWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new FurnaceRebakeJob
            {
                VariantLookup = SystemAPI.GetComponentLookup<BuildingVariant>(true),
                ProdLookup    = SystemAPI.GetComponentLookup<FurnaceProduction>(true),
                Ecb           = ecb,
            }.ScheduleParallel(_furnacesWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct FurnaceRebakeJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<BuildingVariant>   VariantLookup;
        [ReadOnly] public ComponentLookup<FurnaceProduction> ProdLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in BuildingTier tier,
                     ref BuildingHealth hp)
        {
            byte t = tier.Value;
            byte v = VariantLookup.HasComponent(entity) ? VariantLookup[entity].Value : (byte)0;

            ushort newMax = ResolveMaxHp(t, v);
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMax;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMax), 0, newMax);

            if (t == 0) return;

            var recipe = ResolveRecipe(t, v);
            if (ProdLookup.HasComponent(entity))
                Ecb.SetComponent(chunkIdx, entity, recipe);
            else
                Ecb.AddComponent(chunkIdx, entity, recipe);
        }

        static ushort ResolveMaxHp(byte tier, byte variant)
        {
            if (tier == 0) return 300;
            if (tier >= 2) return 540;
            return variant == 1 ? (ushort)320 : (ushort)420;
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
