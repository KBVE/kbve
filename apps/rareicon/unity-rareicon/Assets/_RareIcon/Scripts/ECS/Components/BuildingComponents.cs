using System;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Building type IDs — passed to HexBuilding.shader via _BuildingType
    /// to pick which pixel-art include draws the structure. Must match
    /// the BUILDING_* defines in HexBuilding.shader.
    /// </summary>
    public static class BuildingType
    {
        public const byte None       = 0;
        public const byte Capital    = 1;
        public const byte Farm       = 2;
        public const byte Barracks   = 3;
        public const byte Furnace    = 4;
        public const byte GoblinCave = 5;
        public const byte Inn        = 6;
        public const byte Market     = 7;
        public const byte Outpost    = 8;
        public const byte Lumbercamp = 9;
        public const byte MiningPit  = 10;
        public const byte Dock           = 11;  // River-only; passive fishing + Timber→FishingBoat crafting.
        public const byte BanditCamp     = 12;  // Hostile-owned raid source; spawns periodic bandit parties.
        public const byte TradeHouse     = 13;  // Market tier 1.
        public const byte MerchantsGuild = 14;  // Market tier 2.
        public const byte Village        = 15;  // Farm tier 1.
        public const byte Keep           = 16;  // Barracks tier 1.
        public const byte Castle         = 17;  // Barracks tier 2.
        public const byte Tower          = 18;  // Standalone defensive spire.
        public const byte Wall           = 19;  // Standalone barrier segment.
        public const byte Landmark       = 20;  // Naturally-spawned world object — neutral-owned, has HP, gameplay TBD.
        public const byte Tavern         = 21;  // Inn tier 1 — heal-on-rest + coin trickle.
        public const byte Lodge          = 22;  // Inn tier 2 — bigger sleep cap, faster heal, higher coin yield.
    }

    /// <summary>
    /// What the player is currently trying to place. Drives the preview
    /// overlay and gates click-to-place. `None` means build mode is off.
    /// </summary>
    public static class BuildTarget
    {
        public const byte None       = 0;
        public const byte Capital    = 1;
        public const byte Farm       = 2;
        public const byte Barracks   = 3;
        public const byte Furnace    = 4;
        public const byte GoblinCave = 5;
        public const byte Inn        = 6;
        public const byte Market     = 7;
        public const byte Outpost    = 8;
        public const byte Lumbercamp = 9;
        public const byte MiningPit  = 10;
        public const byte Dock       = 11;
        public const byte Tower      = 18;
        public const byte Wall       = 19;
    }

    /// <summary>Marker tag for the Capital — craft / governance systems query key.</summary>
    public struct CapitalTag : IComponentData { }

    /// <summary>Marker tag for a Hostile-owned BanditCamp — raid source. BanditCampRaidSystem emits bandit parties from its RootHex on a cadence; destroying the building (BuildingHealth→0) ends the raids. One or more may exist simultaneously in a future pass; today the spawner caps at one active camp.</summary>
    public struct BanditCampTag : IComponentData { }

    /// <summary>Per-camp raid state. NextRaidTick gates dispatch; RaidCadenceTicks + RaidPartySize tune pressure. All fields blittable so BanditCampRaidSystem stays ISystem + Burst.</summary>
    public struct BanditCampState : IComponentData
    {
        public uint NextRaidTick;
        public uint RaidCadenceTicks;
        public byte RaidPartySize;
    }

    /// <summary>Singleton — holds the shared building prefab Entity BuildingSpawnSystem created at startup. Any system that needs to instantiate a building (BanditCampSpawnerSystem, future Hostile builders) reads Prefab from this singleton instead of duplicating the mesh/material setup.</summary>
    public struct BuildingPrefabSingleton : IComponentData
    {
        public Entity Prefab;
    }

    /// <summary>Player-issued request to tear down Target. DemolishBuildingSystem refunds 50% of delivered materials to the Capital, releases any sheltered units, then destroys the entity. Request entity is self-destroyed after processing.</summary>
    public struct DemolishRequest : IComponentData
    {
        public Entity Target;
    }

    /// <summary>Per-building territory claim; any building may emit. Empire territory = union of all same-faction emitters. Radius is the axial hex range from Center.</summary>
    // TODO(rust-ffi): persist alongside Building so territory survives chunk unload.
    public struct TerritoryEmitter : IComponentData
    {
        public int2 Center;
        public byte Radius;
        public byte OwnerFaction;
    }

    /// <summary>Data-driven production recipe. Up to 3 inputs / 3 outputs + a cycle clock anchored to WorldClock.AbsSeconds. Output always lands in the building's own InventorySlot (FarmSurplusTransferSystem drains farm surplus to Capital). PullsFromCapital = 1 means "consume inputs from the Capital's storage instead of self" — covers Farm's Compost → Carrot chain where the raw material lives at the Capital. Multiple recipes per building are permitted; ProductionSystem ticks each independently.</summary>
    [InternalBufferCapacity(2)]
    public struct ProductionRecipe : IBufferElementData
    {
        public ushort Input1Id;  public ushort Input1Amount;
        public ushort Input2Id;  public ushort Input2Amount;
        public ushort Input3Id;  public ushort Input3Amount;
        public ushort Output1Id; public ushort Output1Amount;
        public ushort Output2Id; public ushort Output2Amount;
        public ushort Output3Id; public ushort Output3Amount;
        public float  CycleDuration;
        public float  CycleEndsAt;
        public byte   PullsFromCapital;
    }

    /// <summary>Cycle-duration multiplier. 0 = no bonus, 1 = halves the duration. FarmTenderScanSystem writes 1 while a Farmer-intent unit stands on the farm footprint; ProductionSystem reads this when starting a new cycle. Omit the component entirely for buildings that don't have a "worker present" bonus.</summary>
    public struct TenderMultiplier : IComponentData
    {
        public float Value;
    }

    /// <summary>Marker tag for Farm buildings — production system query key.</summary>
    public struct FarmTag : IComponentData { }

    /// <summary>Marker tag for Inn buildings — food + sleep service provider.</summary>
    public struct InnTag : IComponentData { }

    /// <summary>Marker tag for Market buildings — goods trading + future Merchants Guild hub. Tier progression: 0 Market → 1 Trade House → 2 Merchants Guild.</summary>
    public struct MarketTag : IComponentData { }

    /// <summary>Progression level within a building's upgrade chain. 0 = base tier (Market, Farm). Higher tiers unlock via BuildingUpgradeRequest + cost deduction. Locale key + visuals may branch on this. Ghost-replicated — clients render the tier-specific silhouette via BuildingVisual which the server mutates alongside.</summary>
    [Unity.NetCode.GhostComponent]
    public struct BuildingTier : IComponentData
    {
        [Unity.NetCode.GhostField] public byte Value;
    }

    /// <summary>Player-issued request to advance Target to the next tier. BuildingUpgradeSystem validates cost against the Capital, deducts, bumps BuildingTier.Value. Self-destroys after processing.</summary>
    public struct BuildingUpgradeRequest : IComponentData
    {
        public Entity Target;
    }

    /// <summary>Lifecycle state of a MarketOrder.</summary>
    public static class MarketOrderState
    {
        public const byte Open      = 0;
        public const byte Filled    = 1;
        public const byte Cancelled = 2;
        public const byte Expired   = 3;
    }

    /// <summary>Direction of a MarketOrder — buy (empire requests goods) or sell (empire offers goods).</summary>
    public static class MarketOrderKind
    {
        public const byte Buy  = 0;
        public const byte Sell = 1;
    }

    /// <summary>Structured order entry on a Market. Covers buy-requests ("we want N Timber at P coin/unit") and sell-offers ("we have N Arrow at P coin/unit"). Future fulfillment systems will drive State transitions; for now the buffer holds the data shape so UI + AI can grow on top as the Merchants Guild flow lands.</summary>
    [InternalBufferCapacity(4)]
    public struct MarketOrder : IBufferElementData
    {
        public Ulid   Uid;
        public byte   Kind;
        public byte   State;
        public ushort ItemId;
        public ushort Quantity;
        public ushort UnitPrice;
        public uint   PostedTick;
        public uint   ExpiresTick;
    }

    /// <summary>Service tag: unit on this building's footprint with Eat relief can draw food from its ledger. Attached to Capital, Farm, Inn. Priority breaks ties when multiple providers are equidistant (higher wins).</summary>
    public struct ProvidesFood : IComponentData
    {
        public byte Priority;
    }

    /// <summary>Service tag: unit on this building's footprint with Sleep relief can rest here. Capacity caps concurrent sleepers (Capital ~255, Inn 5).</summary>
    public struct ProvidesSleep : IComponentData
    {
        public byte Capacity;
    }

    /// <summary>Service tag: unit on this building's footprint with Heal relief can consume MedKits from its ledger (BarracksHealExecutor). Attached to Barracks; future Infirmary / Temple would inherit.</summary>
    public struct ProvidesHealing : IComponentData
    {
        public byte Priority;
    }

    /// <summary>Optional per-building total-count ceiling. Absent = unlimited (current Capital behaviour). Haulers + producers read this to gate deposits.</summary>
    public struct StorageCapacity : IComponentData
    {
        public ushort Total;
    }

    /// <summary>Per-item outflow declaration: "anything above Floor of this ItemId drains to the Capital each tick." Items not listed stay wherever they are (coin + food on a Barracks, raw inputs mid-recipe, etc.). Farm declares { Carrot, 8 } + livestock products at floor 0; Barracks declares { Arrow, 20 } to keep a local arsenal while the surplus flows to the treasury.</summary>
    [InternalBufferCapacity(4)]
    public struct SurplusExport : IBufferElementData
    {
        public ushort ItemId;
        public ushort Floor;
    }

    /// <summary>Per-farm sheltered-livestock entry; one per species currently in residence. LastProducedTurn is the WorldClock.TurnIndex of the last output. Kept for future fungible residents (bees, pond fish) — livestock (chicken / cow / sheep) now live as individual sheltered entities with a LivestockProduction component.</summary>
    [InternalBufferCapacity(4)]
    public struct FarmLivestock : IBufferElementData
    {
        public byte   UnitType;
        public ushort Count;
        public uint   LastProducedTurn;
    }

    /// <summary>Per-animal production cadence state for sheltered livestock. Species + output + cadence are derived from Unit.Type at iteration time; only the turn-stamp needs to persist per entity.</summary>
    public struct LivestockProduction : IComponentData
    {
        public uint LastProducedTurn;
    }

    /// <summary>Marker tag for Barracks buildings — recruitment system query key.</summary>
    public struct BarracksTag : IComponentData { }

    /// <summary>Per-barracks recruitment cadence. Once per N turns, consumes CoinCost Coin + FoodCost food (any ItemId flagged by FoodItems.IsFood) from the building's InventorySlot storage and spawns one Soldier on an adjacent hex. Storage capacity lives on the separate StorageCapacity component.</summary>
    public struct BarracksProduction : IComponentData
    {
        public uint   LastProducedTurn;
        public byte   CadenceTurns;
        public ushort CoinCost;
        public ushort FoodCost;
    }

    /// <summary>Transient request emitted by the Burst-compiled BarracksProductionSystem once a recruit cycle clears cost; SoldierSpawnApplierSystem drains these on the main thread and calls UnitSpawnSystem.SpawnGoblinAt since prefab spawn still requires managed asset access.</summary>
    public struct SpawnSoldierRequest : IComponentData
    {
        public int2 Hex;
        public uint Seed;
        public byte Faction;
        public byte UnitType;
    }

    /// <summary>Transient tag — placed on a building that hasn't been assigned a dedicated worker yet. BuildingStaffingSystem consumes this and stacks the matching role (Farm→Farmer, Barracks→Guard, Furnace→Chef, Capital→Builder) onto a pure-Looter goblin at priority 5, then removes the tag.</summary>
    public struct NeedsStaffing : IComponentData { }

    /// <summary>Marker tag for Furnace buildings — production system query key.</summary>
    public struct FurnaceTag : IComponentData { }

    /// <summary>Marker tag for Goblin Cave buildings — production + refill system query key.</summary>
    public struct GoblinCaveTag : IComponentData { }

    /// <summary>Marker tag for Outpost buildings.</summary>
    public struct OutpostTag : IComponentData { }

    /// <summary>Marker tag for Lumbercamp buildings — placed on Forest hexes. LumbercampProductionSystem ticks only while a Lumberjack is on the footprint or sheltered inside.</summary>
    public struct LumbercampTag : IComponentData { }

    /// <summary>Marker tag for Mining Pit buildings — placed on Sand hexes. MiningPitProductionSystem ticks only while a Miner is on the footprint or sheltered inside.</summary>
    public struct MiningPitTag : IComponentData { }

    /// <summary>Marker tag for Dock buildings — placed on river tiles; passive fishing + Timber→FishingBoat crafting query key.</summary>
    public struct DockTag : IComponentData { }

    /// <summary>Marker tag for Keep buildings — Barracks tier 1 garrison hub.</summary>
    public struct KeepTag : IComponentData { }

    /// <summary>Marker tag for Castle buildings — Barracks tier 2 capital of war.</summary>
    public struct CastleTag : IComponentData { }

    /// <summary>Marker tag for Village buildings — Farm tier 1 settlement cluster.</summary>
    public struct VillageTag : IComponentData { }

    /// <summary>Marker tag for Tower buildings — standalone defensive spire; future volley + scout vision query key.</summary>
    public struct TowerTag : IComponentData { }

    /// <summary>Marker tag for Wall buildings — standalone barrier segment; future pathing block query key.</summary>
    public struct WallTag : IComponentData { }

    /// <summary>Per-dock boat-build cadence. Once per CadenceTurns, consumes TimberCost Timber from the dock's ledger and emits a <see cref="SpawnFishingBoatRequest"/> on an adjacent river hex.</summary>
    public struct DockProduction : IComponentData
    {
        public uint   LastProducedTurn;
        public byte   CadenceTurns;
        public ushort TimberCost;
    }

    /// <summary>Transient request emitted by the Burst-compiled DockProductionSystem once a boat-build cycle clears cost; FishingBoatSpawnApplierSystem drains these on the main thread and calls <see cref="UnitSpawnSystem"/>.SpawnFishingBoatAt.</summary>
    public struct SpawnFishingBoatRequest : IComponentData
    {
        public int2 Hex;
        public uint Seed;
        public byte Faction;
    }

    /// <summary>Transient request emitted by <c>WhaleSpawnerSystem</c>; <c>WhaleSpawnApplierSystem</c> drains these on the main thread and calls <see cref="UnitSpawnSystem"/>.SpawnWhaleAt on the target water hex.</summary>
    public struct SpawnWhaleRequest : IComponentData
    {
        public int2 Hex;
        public uint Seed;
    }

    /// <summary>Per-outpost cooldown-gated arrow volley. Every CooldownSeconds the outpost fires ArrowsPerVolley projectiles in a cone of half-angle SpreadHalfAngleRad around the closest CombatDB threat within Range. Burns ArrowCost from the sibling OutpostArrowPool per firing.</summary>
    public struct OutpostVolley : IComponentData
    {
        public float CooldownSeconds;
        public float TimeSinceVolley;
        public float Range;
        public byte  ArrowsPerVolley;
        public byte  ArrowCost;
        public float SpreadHalfAngleRad;
        public float ProjectileSpeed;
        public float ProjectileLifetime;
        public float DamagePerArrow;
    }

    /// <summary>Ammunition reserve for OutpostVolleySystem. Initialised at construction; future refill system (haul arrows from Barracks / Capital) lands in Phase 2b.</summary>
    public struct OutpostArrowPool : IComponentData
    {
        public ushort Stock;
    }

    /// <summary>Tag indicating a TerritoryEmitter is reachable from its faction's Capital via BFS over same-faction emitters within OutpostAnchorRadius.</summary>
    public struct EmpireConnected : IComponentData { }

    /// <summary>Per-cave turn cadence: consumes FoodPerGoblin rations and spawns one Looter goblin per cadence turn. Storage capped at StorageCap; Looters haul food from Capital via CapitalFoodPickupSystem + CaveFoodDeliverySystem.</summary>
    public struct GoblinCaveProduction : IComponentData
    {
        public uint LastProducedTurn;
        public uint CadenceTurns;
        public ushort FoodPerGoblin;
        public ushort StorageCap;
    }

    /// <summary>
    /// Per-furnace active recipe — supports up to 2 inputs (e.g. Wood +
    /// Sand for Glass) and 3 outputs (e.g. Coal + Ash + Glass). Cycle
    /// timing is anchored to <see cref="WorldClock"/>.AbsSeconds so all
    /// production reads from one global clock instead of per-system
    /// accumulators. Set Input2Amount / OutputNAmount = 0 to skip the
    /// slot. <see cref="FurnaceInitSystem"/> picks the recipe from the
    /// underlying hex biome at spawn time.
    /// </summary>
    public struct FurnaceProduction : IComponentData
    {
        public ushort Input1Id;  public ushort Input1Amount;
        public ushort Input2Id;  public ushort Input2Amount;
        public ushort Output1Id; public ushort Output1Amount;
        public ushort Output2Id; public ushort Output2Amount;
        public ushort Output3Id; public ushort Output3Amount;
        /// <summary>WorldClock.AbsSeconds at which the current cycle finishes; 0 = idle.</summary>
        public float CycleEndsAt;
        public float CycleDuration;
    }

    /// <summary>
    /// Composable "this entity produces something on a timer with no input"
    /// component. Currently used for the forest-Furnace passive coal bonus
    /// (no fuel needed, just time). Reusable for Lumber Mill on forest,
    /// Quarry on stone, Fishing Hut on river, etc.
    /// </summary>
    public struct PassiveProduction : IComponentData
    {
        public ushort OutputId;
        public ushort OutputAmount;
        /// <summary>WorldClock.AbsSeconds at which the current cycle finishes; 0 = "not started yet".</summary>
        public float CycleEndsAt;
        public float CycleDuration;
    }

    /// <summary>Per-instance shader flag — 0 idle, 1 active. Written each frame by BuildingActiveVisualSystem writers; read by HexBuilding includes to gate dynamic details (smoke, glow, torch).</summary>
    [MaterialProperty("_BuildingActive")]
    public struct BuildingActiveVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-instance construction progress (0 = just placed, 1 = complete). Written each frame by ConstructionProgressSystem from the ConstructionMaterial delivered/needed sum. Shader fades desaturated translucent ghost → full-color as progress climbs.</summary>
    [MaterialProperty("_ConstructionProgress")]
    public struct ConstructionProgressVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-building instance data. `RootHex` is the centre tile; the 6
    /// neighbours are implicitly claimed via HexOccupant on each tile.
    /// Ghost-replicated: type + footprint anchor + ownership are the
    /// minimum a client needs to render + target a building.
    /// </summary>
    // TODO(rust-ffi): persist {Type, RootHex, OwnerFaction} + the Capital's InventorySlot treasury buffer so world state survives unload / server restart.
    [Unity.NetCode.GhostComponent]
    public struct Building : IComponentData
    {
        [Unity.NetCode.GhostField] public byte Type;
        [Unity.NetCode.GhostField] public int2 RootHex;
        [Unity.NetCode.GhostField] public byte OwnerFaction;
    }

    /// <summary>
    /// Per-instance MaterialProperty for HexBuilding.shader's _BuildingType.
    /// Value is the BuildingType byte cast to float.
    /// </summary>
    [MaterialProperty("_BuildingType")]
    public struct BuildingVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-building HP. Damage drops Value, Builders restore it; LastRepairAbsSeconds rate-limits the per-building repair tick against WorldClock. LastRepairAbsSeconds is server-only — clients don't need the throttle clock.</summary>
    // TODO(rust-ffi): persist Value across chunk unload so damaged buildings don't auto-heal on reload.
    [Unity.NetCode.GhostComponent]
    public struct BuildingHealth : IComponentData
    {
        [Unity.NetCode.GhostField] public ushort Value;
        [Unity.NetCode.GhostField] public ushort Max;
        public float  LastRepairAbsSeconds;
    }

    /// <summary>
    /// Attached to each hex tile that belongs to a building. Points back
    /// at the owning building so pathing / targeting / further builds
    /// can answer "is this hex claimed?" with a single component query.
    /// </summary>
    public struct HexOccupant : IComponentData
    {
        public Entity Building;
    }

    /// <summary>
    /// Singleton — mirrors BuildModeController's reactive state so ECS
    /// systems (preview, click handler) can read build mode without
    /// touching managed code. Written each frame by BuildModeSystem
    /// from BuildModeBridge.Source.
    /// </summary>
    public struct BuildMode : IComponentData
    {
        public byte Target;   // BuildTarget.* — None = off
        public bool Active => Target != BuildTarget.None;
    }

    /// <summary>
    /// Generic one-shot "please place this building type at this hex"
    /// message. Produced by BuildCommandHandler in build mode, consumed
    /// by BuildingSpawnSystem which validates biome + cost + footprint
    /// (per BuildingDB) and either spawns or drops the request.
    /// </summary>
    public struct BuildRequest : IComponentData
    {
        public int2 CenterHex;
        public byte BuildingType;
        public byte OwnerFaction;
    }

    /// <summary>
    /// Per-player ability tokens. Currently unused — Capital placement
    /// is gated on the King's CapitalLandGrant inventory item, not a
    /// counter. Kept as a reserved slot for future per-player charges
    /// (e.g., one-shot summons, blessings, decree counts).
    /// </summary>
    public struct PlayerAbilities : IComponentData
    {
        public int CityBuildsRemaining;
    }

    /// <summary>Marker — "this entity is the local player".</summary>
    public struct PlayerTag : IComponentData { }

    /// <summary>
    /// Per-instance MaterialProperty for HexBuildPreview.shader's fill
    /// colour. BuildPreviewSystem flips it between green (valid) and red
    /// (invalid footprint — water, off-map, or occupied) so the player
    /// sees the rejection before they click.
    /// </summary>
    [MaterialProperty("_FillColor")]
    public struct HexBuildPreviewFill : IComponentData
    {
        public float4 Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty for the preview's border ring.
    /// Paired with HexBuildPreviewFill so the border + fill swap as a
    /// unit on valid↔invalid transitions.
    /// </summary>
    [MaterialProperty("_BorderColor")]
    public struct HexBuildPreviewBorder : IComponentData
    {
        public float4 Value;
    }
}
