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
        public const byte None    = 0;
        public const byte Capital = 1;
        // Barracks, Farm, Tower, etc. land here as we add their .hlsl files.
    }

    /// <summary>
    /// What the player is currently trying to place. Drives the preview
    /// overlay and gates click-to-place. `None` means build mode is off.
    /// </summary>
    public static class BuildTarget
    {
        public const byte None    = 0;
        public const byte Capital = 1;
    }

    /// <summary>
    /// Per-building instance data. `RootHex` is the centre tile; the 6
    /// neighbours are implicitly claimed via HexOccupant on each tile.
    /// </summary>
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
    /// One-shot "please place a capital at this hex" message. Produced
    /// by the click handler in build mode, consumed by BuildingSpawnSystem
    /// which validates the 7-hex claim, spawns the capital, and decrements
    /// the player's city token.
    /// </summary>
    public struct BuildCityRequest : IComponentData
    {
        public int2 CenterHex;
        public byte OwnerFaction;
    }

    /// <summary>
    /// Per-player ability tokens. Starts with 1 city build; extended
    /// later with other charges (walls, farms, unit drops, etc.).
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
