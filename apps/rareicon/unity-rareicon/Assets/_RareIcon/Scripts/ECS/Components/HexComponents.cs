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
    /// Tag added to the hex entity the mouse is currently hovering over.
    /// Added/removed by HexHoverSystem each frame.
    /// </summary>
    public struct HexHoveredTag : IComponentData { }

    /// <summary>
    /// Tag for a selected hex (clicked).
    /// </summary>
    public struct HexSelectedTag : IComponentData { }

    /// <summary>
    /// Singleton — cached mouse state for off-main-thread access.
    /// Updated once per frame by CameraService on the main thread.
    /// Any worker thread system can read this safely.
    /// </summary>
    public struct MouseState : IComponentData
    {
        public float2 WorldPos;
        public int2 HexCoord;
        public bool Changed;
    }
}
