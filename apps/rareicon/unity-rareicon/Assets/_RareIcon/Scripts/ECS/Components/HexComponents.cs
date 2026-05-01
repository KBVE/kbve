using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Axial hex coordinate (q, r). Flat array index derivable from these.
    /// </summary>
    public struct HexCoord : IComponentData
    {
        public int Q;
        public int R;
    }

    /// <summary>
    /// Biome type for this hex. Matches BiomeGenerator constants.
    /// </summary>
    public struct BiomeType : IComponentData
    {
        public byte Value;
    }

    /// <summary>
    /// Tag for hex tile entities.
    /// </summary>
    public struct HexTileTag : IComponentData { }

    /// <summary>
    /// Color override for per-entity hex coloring via Entity Graphics.
    /// </summary>
    [MaterialProperty("_BaseColor")]
    public struct HexColor : IComponentData
    {
        public float4 Value;
    }

    /// <summary>Per-hex resource yields. Multiple resources may coexist; amounts are 0..100.</summary>
    public struct HexResources : IComponentData
    {
        public byte Wood;
        public byte Stone;
        public byte Berries;
        public byte Mushrooms;
        public byte Herbs;
        public byte Cactus;
        public byte CactusVariant;
        public byte Leaves;
        public byte Branches;
        public byte Sand;

        public bool HasAny() => (Wood | Stone | Berries | Mushrooms | Herbs | Cactus | Leaves | Branches | Sand) != 0;
    }

    /// <summary>Resource type IDs used by LocaleService and the HUD.</summary>
    public static class ResourceType
    {
        public const byte None      = 0;
        public const byte Wood      = 1;
        public const byte Stone     = 2;
        public const byte Berries   = 3;
        public const byte Mushrooms = 4;
        public const byte Herbs     = 5;
        public const byte Cactus    = 6;
        public const byte Leaves    = 7;
        public const byte Branches  = 8;
        public const byte Sand      = 9;
    }

    /// <summary>Cactus species on a hex; drives drop table and shader silhouette.</summary>
    public static class CactusVariantType
    {
        public const byte None        = 0;
        public const byte PricklyPear = 1;
        public const byte Dragonfruit = 2;
    }

    /// <summary>Bit flags telling the shader which floor decorations to draw. Keep in sync with MASK_* in HexTile.shader.</summary>
    public static class ResourceMask
    {
        public const int Stone             = 1 << 0;
        public const int Mushrooms         = 1 << 1;
        public const int Berries           = 1 << 2;
        public const int Herbs             = 1 << 3;
        public const int Cactus            = 1 << 4;
        public const int CactusDragonfruit = 1 << 5;
    }

    /// <summary>
    /// Per-instance MaterialProperty so HexTile.shader knows which floor
    /// decorations to draw. Value is a ResourceMask bitmask cast to float.
    /// (Wood is not in the mask — the trees themselves represent it.)
    /// </summary>
    [MaterialProperty("_ResourceType")]
    public struct HexResourceVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Territory classification for shader. 0 = outside any empire, 1 = interior (inside but no outside neighbour), 2 = edge (border draw). Rebaked by TerritoryBakeSystem.</summary>
    [MaterialProperty("_Territory")]
    public struct TerritoryVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Fog-of-war classification for shader. Continuous 0..2 float: 0 = clear, 1 = explored-stale, 2 = unexplored. Fractional values smoothly fade between states so vision-radius edges read as a soft falloff instead of a hard ring. Rebaked by FogBakeSystem from current vision sources (Player units + buildings) + the sticky <see cref="FogExplored"/> flag.</summary>
    [MaterialProperty("_Fog")]
    public struct FogVisibility : IComponentData
    {
        public float Value;
    }

    /// <summary>Sticky "this tile has been seen at least once" flag. Bake flips <see cref="Value"/> to 1 the first time a tile clears below the explored threshold; once-seen tiles then floor at <see cref="FogVisibility"/>=1 when out of live vision instead of going back to 2. Kept separate from <see cref="FogVisibility"/> so the shader's MaterialProperty binding stays a single-float contract.</summary>
    public struct FogExplored : IComponentData
    {
        public byte Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty driving how many trees the shader
    /// renders on this hex. Value is HexResources.Wood normalized to
    /// 0..1 (Wood/WoodMaxForVisual). 0 = no trees, 1 = full canopy
    /// (up to 3 procedural trees subject to the per-biome _TreeDensity
    /// jitter). Lumberjacks chopping wood drop this value, the regrow
    /// system raises it back over time — so deforestation and
    /// reforestation both read visually.
    /// </summary>
    [MaterialProperty("_TreeAmount")]
    public struct HexTreeVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance amounts (0..1) for the four common floor decorations,
    /// packed into one float4 to keep the instanced-prop count low.
    /// Channels: x=Stone, y=Berries, z=Mushrooms, w=Herbs. The shader
    /// scales each Apply*'s internal cluster count by its channel — a
    /// near-depleted herb hex shows 1 tuft instead of 5, a heavy stone
    /// hex shows the boulder + companion pebble, and so on.
    /// </summary>
    [MaterialProperty("_FloorAmounts")]
    public struct HexFloorAmounts : IComponentData
    {
        public float4 Value;
    }

    /// <summary>Per-instance cactus amount (Cactus/100); same scaling story as HexTreeVisual but kept separate because cactus only ever appears on sand biomes.</summary>
    [MaterialProperty("_CactusAmount")]
    public struct HexCactusVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Ground-loot entry on a hex tile; picked up by any unit with an inventory walking onto it.</summary>
    [InternalBufferCapacity(4)]
    public struct ItemDrop : IBufferElementData
    {
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>
    /// Tag added to the hex entity the mouse is currently hovering over.
    /// Added/removed by HexHoverSystem each frame.
    /// </summary>
    public struct HexHoveredTag : IComponentData { }

    /// <summary>
    /// Tag for a selected hex (clicked).
    /// </summary>
    public struct HexSelectedTag : IComponentData { }

    /// <summary>
    /// Tag for the single hover overlay entity. Moves to hovered hex position.
    /// </summary>
    public struct HexHoverOverlayTag : IComponentData { }

    /// <summary>
    /// Singleton — cached mouse state. Computed once per frame on main thread.
    /// Any system can read it without touching Camera/Mouse/UI APIs directly.
    /// </summary>
    public struct MouseState : IComponentData
    {
        public float2 WorldPos;
        public int2 HexCoord;
        public bool Changed;
        public bool OverUI;
        public bool LeftPressedThisFrame;
        public bool LeftReleasedThisFrame;
        public bool IsDragging;
        public bool DragEndedThisFrame;
    }
}
