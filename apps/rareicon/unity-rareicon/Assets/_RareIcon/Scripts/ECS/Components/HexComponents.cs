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

    /// <summary>
    /// Per-hex resource yields. Each hex can carry several resources at once
    /// (a forest hex might have Wood + Mushrooms + Berries simultaneously).
    /// All amounts are 0..100 and deterministic from the hex coord + biome.
    /// Wood is implicit in the trees the shader draws — no fallen-log icon.
    /// </summary>
    public struct HexResources : IComponentData
    {
        public byte Wood;
        public byte Stone;
        public byte Berries;
        public byte Mushrooms;
        public byte Herbs;

        public bool HasAny() => (Wood | Stone | Berries | Mushrooms | Herbs) != 0;
    }

    /// <summary>Resource type IDs — used by LocaleService and the HUD.</summary>
    public static class ResourceType
    {
        public const byte None      = 0;
        public const byte Wood      = 1;
        public const byte Stone     = 2;
        public const byte Berries   = 3;
        public const byte Mushrooms = 4;
        public const byte Herbs     = 5;
    }

    /// <summary>Bit flags for which floor decorations the shader should draw.</summary>
    public static class ResourceMask
    {
        public const int Stone     = 1 << 0;
        public const int Mushrooms = 1 << 1;
        public const int Berries   = 1 << 2;
        public const int Herbs     = 1 << 3;
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
