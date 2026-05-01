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
        /// <summary>
        /// Sentinel ItemId meaning "any edible item" — matches any slot whose
        /// ItemDB entry reports RestoreEnergy > 0. Used by buildings whose
        /// cost is narrative food rather than a specific crop (Goblin Cave).
        /// BuildingSpawnSystem's HasItem/Consume branches on this value.
        /// </summary>
        public const ushort AnyFoodSentinel = 0xFFFE;

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
        static readonly Ingredient[] CostCapital    = { new((ushort)ItemId.CapitalLandGrant, 1) };
        static readonly Ingredient[] CostFarm       = { new((ushort)ItemId.Timber,     1) };
        static readonly Ingredient[] CostBarracks   = { new((ushort)ItemId.Timber,     3),
                                                        new((ushort)ItemId.StoneBlock, 3) };
        static readonly Ingredient[] CostFurnace    = { new((ushort)ItemId.Timber,     2),
                                                        new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] CostGoblinCave = { new((ushort)ItemId.Timber,     1),
                                                        new((ushort)ItemId.StoneBlock, 5) };
        static readonly Ingredient[] CostInn        = { new((ushort)ItemId.Timber,     3),
                                                        new((ushort)ItemId.StoneBlock, 2) };
        static readonly Ingredient[] CostMarket     = { new((ushort)ItemId.Timber,     2),
                                                        new((ushort)ItemId.StoneBlock, 1) };
        static readonly Ingredient[] CostOutpost    = { new((ushort)ItemId.Timber,     2),
                                                        new((ushort)ItemId.StoneBlock, 2) };
        static readonly Ingredient[] CostLumbercamp = { new((ushort)ItemId.Timber,     2),
                                                        new((ushort)ItemId.StoneBlock, 1) };
        static readonly Ingredient[] CostMiningPit  = { new((ushort)ItemId.Timber,     3) };
        static readonly Ingredient[] CostDock       = { new((ushort)ItemId.Timber,     2) };
        static readonly Ingredient[] CostTower      = { new((ushort)ItemId.Timber,     2),
                                                        new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] CostWall       = { new((ushort)ItemId.StoneBlock, 5) };
        static readonly Ingredient[] CostNone     = System.Array.Empty<Ingredient>();

        // -- Upgrade chain costs --
        // Market (tier 0) → Trade House (tier 1) → Merchants Guild (tier 2).
        // Farm   (tier 0) → Village (tier 1).
        // Barracks (tier 0) → Keep (tier 1) → Castle (tier 2).
        static readonly Ingredient[] UpgradeMarketToTradeHouse    = { new((ushort)ItemId.GoldBar,   5) };
        static readonly Ingredient[] UpgradeTradeHouseToGuild     = { new((ushort)ItemId.GoldBar,  50) };
        static readonly Ingredient[] UpgradeFarmToVillage         = { new((ushort)ItemId.Timber,   10),
                                                                      new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] UpgradeLumbercampToSawmill   = { new((ushort)ItemId.Timber,    8),
                                                                      new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] UpgradeMiningPitToQuarry     = { new((ushort)ItemId.Timber,    6),
                                                                      new((ushort)ItemId.StoneBlock, 6) };
        static readonly Ingredient[] UpgradeDockToShipyard        = { new((ushort)ItemId.Timber,   10),
                                                                      new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] UpgradeShipyardToHarbour     = { new((ushort)ItemId.Timber,   16),
                                                                      new((ushort)ItemId.StoneBlock, 12),
                                                                      new((ushort)ItemId.GoldBar,    8) };
        static readonly Ingredient[] UpgradeBarracksToKeep        = { new((ushort)ItemId.Timber,    6),
                                                                      new((ushort)ItemId.StoneBlock, 12) };
        static readonly Ingredient[] UpgradeKeepToCastle          = { new((ushort)ItemId.Timber,   10),
                                                                      new((ushort)ItemId.StoneBlock, 24),
                                                                      new((ushort)ItemId.GoldBar,   20) };
        static readonly Ingredient[] UpgradeInnToTavern           = { new((ushort)ItemId.Timber,    6),
                                                                      new((ushort)ItemId.StoneBlock, 4),
                                                                      new((ushort)ItemId.GoldBar,    5) };
        static readonly Ingredient[] UpgradeTavernToLodge         = { new((ushort)ItemId.Timber,   12),
                                                                      new((ushort)ItemId.StoneBlock, 8),
                                                                      new((ushort)ItemId.GoldBar,   15) };
        static readonly Ingredient[] UpgradeFurnaceToForge         = { new((ushort)ItemId.StoneBlock, 8),
                                                                       new((ushort)ItemId.IronOre,  4) };
        static readonly Ingredient[] UpgradeForgeToFoundry         = { new((ushort)ItemId.StoneBlock, 14),
                                                                       new((ushort)ItemId.IronOre,  10),
                                                                       new((ushort)ItemId.GoldBar,    12) };
        static readonly Ingredient[] UpgradeOutpostToWatchpost     = { new((ushort)ItemId.Timber,    6),
                                                                       new((ushort)ItemId.StoneBlock, 6) };
        static readonly Ingredient[] UpgradeWatchpostToGarrison    = { new((ushort)ItemId.Timber,   10),
                                                                       new((ushort)ItemId.StoneBlock, 14),
                                                                       new((ushort)ItemId.GoldBar,    8) };
        static readonly Ingredient[] UpgradeTowerToBastion         = { new((ushort)ItemId.StoneBlock, 10),
                                                                       new((ushort)ItemId.IronOre,   4) };
        static readonly Ingredient[] UpgradeBastionToCitadel       = { new((ushort)ItemId.StoneBlock, 18),
                                                                       new((ushort)ItemId.IronOre,  10),
                                                                       new((ushort)ItemId.GoldBar,    14) };
        static readonly Ingredient[] UpgradeWallToReinforced       = { new((ushort)ItemId.StoneBlock, 4) };
        static readonly Ingredient[] UpgradeReinforcedToFortified  = { new((ushort)ItemId.StoneBlock, 8),
                                                                       new((ushort)ItemId.IronOre,   3) };

        /// <summary>Returns the material cost to advance `type` from `fromTier` to `fromTier + 1`. Empty array if no further tier exists.</summary>
        public static Ingredient[] GetUpgradeCost(byte buildingType, byte fromTier)
        {
            if (buildingType == BuildingType.Market)
            {
                if (fromTier == 0) return UpgradeMarketToTradeHouse;
                if (fromTier == 1) return UpgradeTradeHouseToGuild;
            }
            else if (buildingType == BuildingType.Farm)
            {
                if (fromTier == 0) return UpgradeFarmToVillage;
            }
            else if (buildingType == BuildingType.Barracks)
            {
                if (fromTier == 0) return UpgradeBarracksToKeep;
                if (fromTier == 1) return UpgradeKeepToCastle;
            }
            else if (buildingType == BuildingType.Inn)
            {
                if (fromTier == 0) return UpgradeInnToTavern;
                if (fromTier == 1) return UpgradeTavernToLodge;
            }
            else if (buildingType == BuildingType.Lumbercamp)
            {
                if (fromTier == 0) return UpgradeLumbercampToSawmill;
            }
            else if (buildingType == BuildingType.MiningPit)
            {
                if (fromTier == 0) return UpgradeMiningPitToQuarry;
            }
            else if (buildingType == BuildingType.Dock)
            {
                if (fromTier == 0) return UpgradeDockToShipyard;
                if (fromTier == 1) return UpgradeShipyardToHarbour;
            }
            else if (buildingType == BuildingType.Furnace)
            {
                if (fromTier == 0) return UpgradeFurnaceToForge;
                if (fromTier == 1) return UpgradeForgeToFoundry;
            }
            else if (buildingType == BuildingType.Outpost)
            {
                if (fromTier == 0) return UpgradeOutpostToWatchpost;
                if (fromTier == 1) return UpgradeWatchpostToGarrison;
            }
            else if (buildingType == BuildingType.Tower)
            {
                if (fromTier == 0) return UpgradeTowerToBastion;
                if (fromTier == 1) return UpgradeBastionToCitadel;
            }
            else if (buildingType == BuildingType.Wall)
            {
                if (fromTier == 0) return UpgradeWallToReinforced;
                if (fromTier == 1) return UpgradeReinforcedToFortified;
            }
            return CostNone;
        }

        /// <summary>Tier-aware visual id: when a building's BuildingTier advances, BuildingUpgradeSystem remaps its BuildingVisual to the tier-specific shader variant (Market→Trade House→Merchants Guild, Farm→Village, Barracks→Keep→Castle). Returns 0 if no remap applies — shader keeps the base _BuildingType.</summary>
        public static byte GetTieredVisualId(byte buildingType, byte tier)
        {
            if (buildingType == BuildingType.Market)
            {
                if (tier == 1) return BuildingType.TradeHouse;
                if (tier == 2) return BuildingType.MerchantsGuild;
            }
            else if (buildingType == BuildingType.Farm)
            {
                if (tier == 1) return BuildingType.Village;
            }
            else if (buildingType == BuildingType.Barracks)
            {
                if (tier == 1) return BuildingType.Keep;
                if (tier == 2) return BuildingType.Castle;
            }
            else if (buildingType == BuildingType.Inn)
            {
                if (tier == 1) return BuildingType.Tavern;
                if (tier == 2) return BuildingType.Lodge;
            }
            else if (buildingType == BuildingType.Lumbercamp)
            {
                if (tier == 1) return BuildingType.Sawmill;
            }
            else if (buildingType == BuildingType.MiningPit)
            {
                if (tier == 1) return BuildingType.Quarry;
            }
            else if (buildingType == BuildingType.Dock)
            {
                if (tier == 1) return BuildingType.Shipyard;
                if (tier == 2) return BuildingType.Harbour;
            }
            else if (buildingType == BuildingType.Furnace)
            {
                if (tier == 1) return BuildingType.Forge;
                if (tier == 2) return BuildingType.Foundry;
            }
            else if (buildingType == BuildingType.Outpost)
            {
                if (tier == 1) return BuildingType.Watchpost;
                if (tier == 2) return BuildingType.Garrison;
            }
            else if (buildingType == BuildingType.Tower)
            {
                if (tier == 1) return BuildingType.Bastion;
                if (tier == 2) return BuildingType.Citadel;
            }
            else if (buildingType == BuildingType.Wall)
            {
                if (tier == 1) return BuildingType.ReinforcedWall;
                if (tier == 2) return BuildingType.FortifiedWall;
            }
            return 0;
        }

        /// <summary>Returns true if `type` at `fromTier` has a next tier.</summary>
        public static bool HasUpgrade(byte buildingType, byte fromTier)
            => GetUpgradeCost(buildingType, fromTier).Length > 0;

        public static Ingredient[] GetCost(byte buildingType) => buildingType switch
        {
            BuildingType.Capital    => CostCapital,
            BuildingType.Farm       => CostFarm,
            BuildingType.Barracks   => CostBarracks,
            BuildingType.Furnace    => CostFurnace,
            BuildingType.GoblinCave => CostGoblinCave,
            BuildingType.Inn        => CostInn,
            BuildingType.Market     => CostMarket,
            BuildingType.Outpost    => CostOutpost,
            BuildingType.Lumbercamp => CostLumbercamp,
            BuildingType.MiningPit  => CostMiningPit,
            BuildingType.Dock       => CostDock,
            BuildingType.Tower      => CostTower,
            BuildingType.Wall       => CostWall,
            _ => CostNone,
        };

        public static CostSource GetCostSource(byte buildingType) => buildingType == BuildingType.Capital
            ? CostSource.KingInventory
            : CostSource.CapitalStorage;

        public static bool SpawnsFullyBuilt(byte buildingType)
            => buildingType == BuildingType.Capital;

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

        /// <summary>World-space scale to apply to the shared 1.5-unit building quad so the shader's hex inside-mask lines up with the actual hex tile size on the map. The shared mesh is sized for the Capital's 7-hex flower (default 1.0); single-hex buildings scale down so their drawn silhouette fits one hex instead of three. Bandit Camp / Landmark drawn at single-hex scale; multi-hex types should bump this back to 1.0 once their footprint flips to <see cref="FlowerOffsets"/>.</summary>
        public static float GetVisualScale(byte buildingType) => buildingType switch
        {
            BuildingType.Capital => 1.0f,
            _                    => 2.0f / 3.0f,
        };

        // -- Biome rules --
        /// <summary>Returns true if `biome` can host `buildingType`. Ocean refuses every build; river refuses every build except the Dock (river-only); Lumbercamp must be on Forest; Mining Pit must be on Sand.</summary>
        public static bool IsBuildable(byte buildingType, byte biome)
        {
            if (biome == BiomeGenerator.BIOME_OCEAN) return false;
            if (buildingType == BuildingType.Dock)
                return biome == BiomeGenerator.BIOME_RIVER;
            if (biome == BiomeGenerator.BIOME_RIVER) return false;
            if (buildingType == BuildingType.Lumbercamp) return biome == BiomeGenerator.BIOME_FOREST;
            if (buildingType == BuildingType.MiningPit)  return biome == BiomeGenerator.BIOME_SAND;
            // Per-type future rules slot here:
            //   Furnace might forbid Snow (no fuel),
            //   Wall might allow only Stone / Dirt for foundation, etc.
            return true;
        }

        /// <summary>Locale key for the human-readable name of a building type.</summary>
        public static string GetLocaleKey(byte buildingType) => buildingType switch
        {
            BuildingType.Capital    => "building.capital",
            BuildingType.Farm       => "building.farm",
            BuildingType.Barracks   => "building.barracks",
            BuildingType.Furnace    => "building.furnace",
            BuildingType.GoblinCave => "building.goblin_cave",
            BuildingType.Inn        => "building.inn",
            BuildingType.Market     => "building.market",
            BuildingType.Outpost    => "building.outpost",
            BuildingType.Lumbercamp => "building.lumbercamp",
            BuildingType.MiningPit  => "building.mining_pit",
            BuildingType.Dock       => "building.dock",
            BuildingType.Shipyard   => "building.shipyard",
            BuildingType.Harbour    => "building.harbour",
            BuildingType.PirateCove => "building.pirate_cove",
            BuildingType.Tower      => "building.tower",
            BuildingType.Wall       => "building.wall",
            BuildingType.Landmark   => "building.landmark",
            BuildingType.CityState   => "building.city_state",
            BuildingType.HostileCity => "building.hostile_city",
            BuildingType.AlliedCity  => "building.allied_city",
            BuildingType.VassalCity  => "building.vassal_city",
            _ => "building.unknown",
        };

        /// <summary>Tier-aware locale key. Market tier 1 = Trade House, tier 2 = Merchants Guild. Falls back to the base GetLocaleKey for tier 0 or non-tiered types.</summary>
        public static string GetTieredLocaleKey(byte buildingType, byte tier)
        {
            if (buildingType == BuildingType.Market)
            {
                if (tier == 1) return "building.trade_house";
                if (tier == 2) return "building.merchants_guild";
            }
            else if (buildingType == BuildingType.Farm)
            {
                if (tier == 1) return "building.village";
            }
            else if (buildingType == BuildingType.Barracks)
            {
                if (tier == 1) return "building.keep";
                if (tier == 2) return "building.castle";
            }
            else if (buildingType == BuildingType.Inn)
            {
                if (tier == 1) return "building.tavern";
                if (tier == 2) return "building.lodge";
            }
            else if (buildingType == BuildingType.Lumbercamp)
            {
                if (tier == 1) return "building.sawmill";
            }
            else if (buildingType == BuildingType.MiningPit)
            {
                if (tier == 1) return "building.quarry";
            }
            else if (buildingType == BuildingType.Dock)
            {
                if (tier == 1) return "building.shipyard";
                if (tier == 2) return "building.harbour";
            }
            else if (buildingType == BuildingType.Furnace)
            {
                if (tier == 1) return "building.forge";
                if (tier == 2) return "building.foundry";
            }
            else if (buildingType == BuildingType.Outpost)
            {
                if (tier == 1) return "building.watchpost";
                if (tier == 2) return "building.garrison";
            }
            else if (buildingType == BuildingType.Tower)
            {
                if (tier == 1) return "building.bastion";
                if (tier == 2) return "building.citadel";
            }
            else if (buildingType == BuildingType.Wall)
            {
                if (tier == 1) return "building.reinforced_wall";
                if (tier == 2) return "building.fortified_wall";
            }
            return GetLocaleKey(buildingType);
        }

        /// <summary>Maps a BuildTarget to its corresponding BuildingType. Returns 0 (None) if unknown.</summary>
        public static byte BuildTargetToType(byte buildTarget) => buildTarget switch
        {
            BuildTarget.Capital    => BuildingType.Capital,
            BuildTarget.Farm       => BuildingType.Farm,
            BuildTarget.Barracks   => BuildingType.Barracks,
            BuildTarget.Furnace    => BuildingType.Furnace,
            BuildTarget.GoblinCave => BuildingType.GoblinCave,
            BuildTarget.Inn        => BuildingType.Inn,
            BuildTarget.Market     => BuildingType.Market,
            BuildTarget.Outpost    => BuildingType.Outpost,
            BuildTarget.Lumbercamp => BuildingType.Lumbercamp,
            BuildTarget.MiningPit  => BuildingType.MiningPit,
            BuildTarget.Dock       => BuildingType.Dock,
            BuildTarget.Tower      => BuildingType.Tower,
            BuildTarget.Wall       => BuildingType.Wall,
            _ => BuildingType.None,
        };

        /// <summary>Reverse map — BuildingType to its placement target. Used by the palette to flip into build mode.</summary>
        public static byte BuildingTypeToTarget(byte buildingType) => buildingType switch
        {
            BuildingType.Capital    => BuildTarget.Capital,
            BuildingType.Farm       => BuildTarget.Farm,
            BuildingType.Barracks   => BuildTarget.Barracks,
            BuildingType.Furnace    => BuildTarget.Furnace,
            BuildingType.GoblinCave => BuildTarget.GoblinCave,
            BuildingType.Inn        => BuildTarget.Inn,
            BuildingType.Market     => BuildTarget.Market,
            BuildingType.Outpost    => BuildTarget.Outpost,
            BuildingType.Lumbercamp => BuildTarget.Lumbercamp,
            BuildingType.MiningPit  => BuildTarget.MiningPit,
            BuildingType.Dock       => BuildTarget.Dock,
            BuildingType.Tower      => BuildTarget.Tower,
            BuildingType.Wall       => BuildTarget.Wall,
            _ => BuildTarget.None,
        };

        /// <summary>Per-type max HP. Drives BuildingHealth on spawn + the repair ceiling for Builders.</summary>
        public static ushort GetMaxHealth(byte buildingType) => buildingType switch
        {
            BuildingType.Capital    => 600,
            BuildingType.Farm       => 200,
            BuildingType.Barracks   => 400,
            BuildingType.Furnace    => 300,
            BuildingType.GoblinCave => 350,
            BuildingType.Inn        => 280,
            BuildingType.Market     => 140,
            BuildingType.Outpost    => 220,
            BuildingType.Lumbercamp => 200,
            BuildingType.MiningPit  => 220,
            BuildingType.Dock       => 180,
            BuildingType.Shipyard   => 240,
            BuildingType.Harbour    => 320,
            BuildingType.PirateCove => 240,
            BuildingType.Tower      => 320,
            BuildingType.Wall       => 260,
            _                       => 100,
        };

        public static bool RequiresInTerritory(byte buildingType)
            => buildingType != BuildingType.Capital
            && buildingType != BuildingType.Outpost;

        public const int OutpostAnchorRadius = 5;

        /// <summary>All buildable types in display order — used by the palette panel. Tier-upgrade variants (Village/Keep/Castle/TradeHouse/MerchantsGuild) are NOT listed; they're unlocked via BuildingUpgradeRequest on the base building, not placed from scratch.</summary>
        public static readonly byte[] AllBuildable =
        {
            BuildingType.Capital,
            BuildingType.Outpost,
            BuildingType.Farm,
            BuildingType.Lumbercamp,
            BuildingType.MiningPit,
            BuildingType.Barracks,
            BuildingType.Furnace,
            BuildingType.GoblinCave,
            BuildingType.Inn,
            BuildingType.Market,
            BuildingType.Dock,
            BuildingType.Tower,
            BuildingType.Wall,
        };
    }
}
