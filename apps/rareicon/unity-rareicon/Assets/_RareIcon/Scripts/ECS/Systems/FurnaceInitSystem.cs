using Unity.Collections;
using Unity.Entities;

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
    /// SystemBase (not Burst) because attaching components is a structural
    /// change — same once-per-spawn cadence as FarmInitSystem.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class FurnaceInitSystem : SystemBase
    {
        EntityQuery _needsInit;

        protected override void OnCreate()
        {
            _needsInit = GetEntityQuery(
                ComponentType.ReadOnly<FurnaceTag>(),
                ComponentType.Exclude<FurnaceProduction>());
        }

        protected override void OnUpdate()
        {
            if (_needsInit.IsEmpty) return;

            var arr = _needsInit.ToEntityArray(Allocator.Temp);
            try
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    var entity = arr[i];
                    if (!EntityManager.HasComponent<Building>(entity)) continue;

                    var building = EntityManager.GetComponentData<Building>(entity);
                    byte biome = ResolveBiome(building.RootHex);
                    AttachRecipe(entity, biome);
                }
            }
            finally
            {
                arr.Dispose();
            }
        }

        // Look up the biome at the building's root hex via the static
        // hex-coord → entity table HexHoverSystem maintains. Returns
        // BIOME_OCEAN as a sentinel "couldn't resolve" since ocean tiles
        // never spawn buildings anyway.
        static byte ResolveBiome(Unity.Mathematics.int2 rootHex)
        {
            if (!HexHoverSystem.TryGetHexEntity(rootHex, out var hexEntity))
                return BiomeGenerator.BIOME_OCEAN;
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            if (!em.HasComponent<BiomeType>(hexEntity))
                return BiomeGenerator.BIOME_OCEAN;
            return em.GetComponentData<BiomeType>(hexEntity).Value;
        }

        void AttachRecipe(Entity entity, byte biome)
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
                    CycleEndsAt = 0f, CycleDuration = 7f,    // desert bonus: faster
                },
                BiomeGenerator.BIOME_GRASS => new FurnaceProduction
                {
                    Input1Id = wood, Input1Amount = 5,
                    Input2Id = 0,    Input2Amount = 0,
                    Output1Id = coal, Output1Amount = 2,
                    Output2Id = ash,  Output2Amount = 2,    // grass bonus: extra ash
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
            EntityManager.AddComponentData(entity, prod);

            // Forest placement bonus — passive coal stream on top of the
            // active wood-fueled cycle. Composes via a separate component
            // so PassiveProductionSystem ticks it without knowing or
            // caring that it's a furnace.
            if (biome == BiomeGenerator.BIOME_FOREST)
            {
                EntityManager.AddComponentData(entity, new PassiveProduction
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
