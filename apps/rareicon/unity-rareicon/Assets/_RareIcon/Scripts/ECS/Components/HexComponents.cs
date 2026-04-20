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
        public bool OverUI;             // true if pointer is over any UI element
        public bool LeftPressedThisFrame;
        public bool LeftReleasedThisFrame;
    }
}
