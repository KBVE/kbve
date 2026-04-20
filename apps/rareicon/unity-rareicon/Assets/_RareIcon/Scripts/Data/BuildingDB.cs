using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Canonical per-building-type metadata: cost, footprint, biome
    /// rules, cost source. Single source of truth queried by
    /// <see cref="BuildPreviewSystem"/> (preview tinting),
    /// <see cref="BuildCommandHandler"/> (click validation), and
    /// <see cref="BuildingSpawnSystem"/> (spawn-time check + deduction).
    ///
    /// Pure data, no DOTS dependencies — earmarked for the uniti (Rust)
    /// crate alongside <see cref="HexResourceTable"/> once the data
    /// shapes settle.
    /// </summary>
    public static class BuildingDB
    {
        /// <summary>One ingredient line in a building's recipe.</summary>
        public readonly struct Ingredient
        {
            public readonly ushort ItemId;
            public readonly ushort Amount;
            public Ingredient(ushort itemId, ushort amount) { ItemId = itemId; Amount = amount; }
        }

        /// <summary>Where the build cost is deducted from.</summary>
        public enum CostSource : byte
        {
            /// <summary>Capital storage (the empire's pool — used by all buildings except Capital).</summary>
            CapitalStorage = 0,
            /// <summary>King's personal inventory (used for the founding Capital placement).</summary>
            KingInventory  = 1,
        }

        // -- Costs --
        // Capital is intentionally just the Land Grant — the scroll is
        // imbued with the materials, narratively. All other buildings
        // draw real materials from the empire's central stockpile.
        static readonly Ingredient[] CostCapital  = { new(   (ushort)ItemId.CapitalLandGrant, 1) };
        static readonly Ingredient[] CostFarm     = { new(   (ushort)ItemId.WoodLog,          5) };
        static readonly Ingredient[] CostBarracks = { new(   (ushort)ItemId.WoodLog,          8),
                                                      new(   (ushort)ItemId.Stone,            3) };
        static readonly Ingredient[] CostFurnace  = { new(   (ushort)ItemId.WoodLog,          6),
                                                      new(   (ushort)ItemId.Stone,            4) };
        static readonly Ingredient[] CostNone     = System.Array.Empty<Ingredient>();

        public static Ingredient[] GetCost(byte buildingType) => buildingType switch
        {
            BuildingType.Capital  => CostCapital,
            BuildingType.Farm     => CostFarm,
            BuildingType.Barracks => CostBarracks,
            BuildingType.Furnace  => CostFurnace,
            _ => CostNone,
        };

        public static CostSource GetCostSource(byte buildingType) => buildingType == BuildingType.Capital
            ? CostSource.KingInventory
            : CostSource.CapitalStorage;

        // -- Footprints --
        // Capital claims the centre + 6 axial neighbours (7-hex flower);
        // every other building is single-hex. When a Walls / Tower /
        // Bridge building lands with a custom footprint, add a new
        // offsets array + case here.
        static readonly int2[] FlowerOffsets =
        {
            new int2( 0,  0), new int2( 1,  0), new int2( 1, -1),
            new int2( 0, -1), new int2(-1,  0), new int2(-1,  1),
            new int2( 0,  1),
        };
        static readonly int2[] SingleHex = { new int2(0, 0) };

        public static int2[] GetFootprint(byte buildingType) => buildingType == BuildingType.Capital
            ? FlowerOffsets
            : SingleHex;

        // -- Biome rules --
        /// <summary>Returns true if `biome` can host `buildingType`. Ocean / River refuse all builds.</summary>
        public static bool IsBuildable(byte buildingType, byte biome)
        {
            if (biome == BiomeGenerator.BIOME_OCEAN) return false;
            if (biome == BiomeGenerator.BIOME_RIVER) return false;
            // Per-type future rules slot here:
            //   Furnace might forbid Snow (no fuel),
            //   Wall might allow only Stone / Dirt for foundation, etc.
            return true;
        }

        /// <summary>Locale key for the human-readable name of a building type.</summary>
        public static string GetLocaleKey(byte buildingType) => buildingType switch
        {
            BuildingType.Capital  => "building.capital",
            BuildingType.Farm     => "building.farm",
            BuildingType.Barracks => "building.barracks",
            BuildingType.Furnace  => "building.furnace",
            _ => "building.unknown",
        };

        /// <summary>Maps a BuildTarget to its corresponding BuildingType. Returns 0 (None) if unknown.</summary>
        public static byte BuildTargetToType(byte buildTarget) => buildTarget switch
        {
            BuildTarget.Capital  => BuildingType.Capital,
            BuildTarget.Farm     => BuildingType.Farm,
            BuildTarget.Barracks => BuildingType.Barracks,
            BuildTarget.Furnace  => BuildingType.Furnace,
            _ => BuildingType.None,
        };

        /// <summary>Reverse map — BuildingType to its placement target. Used by the palette to flip into build mode.</summary>
        public static byte BuildingTypeToTarget(byte buildingType) => buildingType switch
        {
            BuildingType.Capital  => BuildTarget.Capital,
            BuildingType.Farm     => BuildTarget.Farm,
            BuildingType.Barracks => BuildTarget.Barracks,
            BuildingType.Furnace  => BuildTarget.Furnace,
            _ => BuildTarget.None,
        };

        /// <summary>All buildable types in display order — used by the palette panel.</summary>
        public static readonly byte[] AllBuildable =
        {
            BuildingType.Capital,
            BuildingType.Farm,
            BuildingType.Barracks,
            BuildingType.Furnace,
        };
    }
}
