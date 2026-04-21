using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Resolves the underlying hex biome for newly-spawned Furnace entities
    /// and attaches the right recipe components.
    ///
    /// Recipe matrix (input cost is uniform 5 Wood; some biomes also
    /// require sand or yield bonus outputs):
    ///   Sand   : 5 Wood + 1 Sand → 2 Coal + 1 Ash + 1 Raw Glass (7s)
    ///   Grass  : 5 Wood          → 2 Coal + 2 Ash               (10s)
    ///   Default: 5 Wood          → 2 Coal + 1 Ash               (10s)
    ///   Forest : default recipe + PassiveProduction (+2 Coal / 30s)
    ///
    /// ISystem + Burst; structural changes queue through ECB so the
    /// update stays off the main thread. Biome resolution reads
    /// ComponentLookup&lt;BiomeType&gt; + HexLookupSingleton — both job-safe.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct FurnaceInitSystem : ISystem
    {
        EntityQuery _needsInit;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _needsInit = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<FurnaceTag, Building>()
                .WithNone<FurnaceProduction>()
                .Build(ref state);
            state.RequireForUpdate(_needsInit);
            state.RequireForUpdate<HexLookupSingleton>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var hexLookup    = SystemAPI.GetSingleton<HexLookupSingleton>().Lookup;
            var biomeLookup  = SystemAPI.GetComponentLookup<BiomeType>(true);
            var buildingLookup = SystemAPI.GetComponentLookup<Building>(true);

            var entities = _needsInit.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var entity = entities[i];
                if (!buildingLookup.HasComponent(entity)) continue;

                var building = buildingLookup[entity];
                byte biome = ResolveBiome(building.RootHex, hexLookup, biomeLookup);
                AttachRecipe(ecb, entity, biome);
                ecb.AddBuffer<FurnaceLedger>(entity);
            }
            entities.Dispose();
        }

        static byte ResolveBiome(int2 rootHex,
                                 NativeHashMap<int2, Entity> hexLookup,
                                 ComponentLookup<BiomeType> biomeLookup)
        {
            if (!hexLookup.TryGetValue(rootHex, out var hexEntity))
                return BiomeGenerator.BIOME_OCEAN;
            if (!biomeLookup.HasComponent(hexEntity))
                return BiomeGenerator.BIOME_OCEAN;
            return biomeLookup[hexEntity].Value;
        }

        static void AttachRecipe(EntityCommandBuffer ecb, Entity entity, byte biome)
        {
            ushort wood  = (ushort)ItemId.WoodLog;
            ushort coal  = (ushort)ItemId.Coal;
            ushort ash   = (ushort)ItemId.Ash;
            ushort sand  = (ushort)ItemId.NaturalSand;
            ushort glass = (ushort)ItemId.RawGlass;

            FurnaceProduction prod = biome switch
            {
                BiomeGenerator.BIOME_SAND => new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = sand, Input2Amount = 1,
                    Output1Id = coal,  Output1Amount = 2,
                    Output2Id = ash,   Output2Amount = 1,
                    Output3Id = glass, Output3Amount = 1,
                    CycleEndsAt = 0f, CycleDuration = 7f,
                },
                BiomeGenerator.BIOME_GRASS => new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = 0,    Input2Amount = 0,
                    Output1Id = coal, Output1Amount = 2,
                    Output2Id = ash,  Output2Amount = 2,
                    Output3Id = 0,    Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 10f,
                },
                _ => new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = 0,    Input2Amount = 0,
                    Output1Id = coal, Output1Amount = 2,
                    Output2Id = ash,  Output2Amount = 1,
                    Output3Id = 0,    Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 10f,
                },
            };
            ecb.AddComponent(entity, prod);

            if (biome == BiomeGenerator.BIOME_FOREST)
            {
                ecb.AddComponent(entity, new PassiveProduction
                {
                    OutputId      = coal,
                    OutputAmount  = 2,
                    CycleEndsAt   = 0f,
                    CycleDuration = 30f,
                });
            }
        }
    }
}
