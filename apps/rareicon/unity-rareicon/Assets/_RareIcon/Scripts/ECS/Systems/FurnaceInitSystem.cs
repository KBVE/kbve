using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Resolves the underlying hex biome for newly-spawned Furnace entities
    /// and attaches the right recipe components — same auto-init pattern
    /// as <see cref="FarmInitSystem"/>.
    ///
    /// Recipe matrix (input cost is uniform 5 Wood; some biomes also
    /// require sand or yield bonus outputs):
    ///   Sand   : 5 Wood + 1 Sand → 2 Coal + 1 Ash + 1 Raw Glass (7s)
    ///   Grass  : 5 Wood          → 2 Coal + 2 Ash               (10s)
    ///   Default: 5 Wood          → 2 Coal + 1 Ash               (10s)
    ///   Forest : default recipe + PassiveProduction (+2 Coal / 30s)
    ///
    /// Burst ISystem: hex → biome resolved via HexLookupSingleton + a
    /// ComponentLookup&lt;BiomeType&gt;, structural work via EndInitializationECB.
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
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            var ecb = SystemAPI.GetSingleton<EndInitializationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new FurnaceInitJob
            {
                HexLookup   = hexLookup.Lookup,
                BiomeLookup = SystemAPI.GetComponentLookup<BiomeType>(true),
                Ecb         = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FurnaceTag))]
    [WithNone(typeof(FurnaceProduction))]
    public partial struct FurnaceInitJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity>  HexLookup;
        [ReadOnly] public ComponentLookup<BiomeType>   BiomeLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in Building building)
        {
            byte biome = ResolveBiome(building.RootHex);
            AttachRecipe(chunkIdx, entity, biome);
        }

        byte ResolveBiome(int2 rootHex)
        {
            if (!HexLookup.TryGetValue(rootHex, out var hexEntity))
                return (byte)BiomeGenerator.BIOME_OCEAN;
            if (!BiomeLookup.HasComponent(hexEntity))
                return (byte)BiomeGenerator.BIOME_OCEAN;
            return BiomeLookup[hexEntity].Value;
        }

        void AttachRecipe(int chunkIdx, Entity entity, byte biome)
        {
            ushort wood  = (ushort)ItemId.WoodLog;
            ushort coal  = (ushort)ItemId.Coal;
            ushort ash   = (ushort)ItemId.Ash;
            ushort sand  = (ushort)ItemId.NaturalSand;
            ushort glass = (ushort)ItemId.RawGlass;

            FurnaceProduction prod;
            if (biome == BiomeGenerator.BIOME_SAND)
            {
                prod = new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = sand, Input2Amount = 1,
                    Output1Id = coal,  Output1Amount = 2,
                    Output2Id = ash,   Output2Amount = 1,
                    Output3Id = glass, Output3Amount = 1,
                    CycleEndsAt = 0f, CycleDuration = 7f,    // desert bonus: faster
                };
            }
            else if (biome == BiomeGenerator.BIOME_GRASS)
            {
                prod = new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = 0,    Input2Amount = 0,
                    Output1Id = coal, Output1Amount = 2,
                    Output2Id = ash,  Output2Amount = 2,    // grass bonus: extra ash
                    Output3Id = 0,    Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 10f,
                };
            }
            else
            {
                prod = new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = 0,    Input2Amount = 0,
                    Output1Id = coal, Output1Amount = 2,
                    Output2Id = ash,  Output2Amount = 1,
                    Output3Id = 0,    Output3Amount = 0,
                    CycleEndsAt = 0f, CycleDuration = 10f,
                };
            }
            Ecb.AddComponent(chunkIdx, entity, prod);

            // Forest placement bonus — passive coal stream on top of the
            // active wood-fueled cycle. Composes via a separate component
            // so PassiveProductionSystem ticks it without knowing or caring
            // that it's a furnace.
            if (biome == BiomeGenerator.BIOME_FOREST)
            {
                Ecb.AddComponent(chunkIdx, entity, new PassiveProduction
                {
                    OutputId      = coal,
                    OutputAmount  = 2,
                    CycleEndsAt   = 0f,    // first tick will start it
                    CycleDuration = 30f,
                });
            }
        }
    }
}
