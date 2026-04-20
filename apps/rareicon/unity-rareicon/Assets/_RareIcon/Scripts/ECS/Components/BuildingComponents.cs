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
        public const byte None     = 0;
        public const byte Capital  = 1;
        public const byte Farm     = 2;
        public const byte Barracks = 3;
        public const byte Furnace  = 4;
        // Tower, Wall, Mine, etc. land here as we add their .hlsl files.
    }

    /// <summary>
    /// What the player is currently trying to place. Drives the preview
    /// overlay and gates click-to-place. `None` means build mode is off.
    /// </summary>
    public static class BuildTarget
    {
        public const byte None     = 0;
        public const byte Capital  = 1;
        public const byte Farm     = 2;
        public const byte Barracks = 3;
        public const byte Furnace  = 4;
    }

    /// <summary>Marker tag for the Capital — craft / governance systems query key.</summary>
    public struct CapitalTag : IComponentData { }

    /// <summary>Per-capital craft recipe — up to 3 inputs → 1 output, cycle anchored to WorldClock.AbsSeconds.</summary>
    // TODO(rust-ffi): persist {Input*Id/Amount, OutputId/Amount, CycleEndsAt, CycleDuration} so in-flight crafts don't reset on chunk unload / server restart.
    public struct CapitalProduction : IComponentData
    {
        public ushort Input1Id;  public ushort Input1Amount;
        public ushort Input2Id;  public ushort Input2Amount;
        public ushort Input3Id;  public ushort Input3Amount;
        public ushort OutputId;  public ushort OutputAmount;
        public float  CycleEndsAt;
        public float  CycleDuration;
    }

    /// <summary>Marker tag for Farm buildings — production system query key.</summary>
    public struct FarmTag : IComponentData { }

    /// <summary>Marker tag for Barracks buildings — recruitment system query key.</summary>
    public struct BarracksTag : IComponentData { }

    /// <summary>Marker tag for Furnace buildings — production system query key.</summary>
    public struct FurnaceTag : IComponentData { }

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

    /// <summary>Per-farm Compost→Carrot (or future) recipe + cycle marker against the WorldClock. TenderBonus [0..1] shortens the effective duration when a Farmer is on-hex.</summary>
    public struct FarmProduction : IComponentData
    {
        public ushort InputItemId;
        public ushort InputAmount;
        public ushort OutputItemId;
        public ushort OutputAmount;
        public float CycleEndsAt;
        public float CycleDuration;
        public float TenderBonus;
    }

    /// <summary>
    /// Per-building instance data. `RootHex` is the centre tile; the 6
    /// neighbours are implicitly claimed via HexOccupant on each tile.
    /// </summary>
    // TODO(rust-ffi): persist {Type, RootHex, OwnerFaction} + the Capital's InventorySlot treasury buffer so world state survives unload / server restart.
    public struct Building : IComponentData
    {
        public byte Type;
        public int2 RootHex;
        public byte OwnerFaction;
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
