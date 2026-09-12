using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Tag for any river decal entity (renders the polyline mesh + water shader).
    /// </summary>
    public struct RiverDecalTag : IComponentData { }

    /// <summary>
    /// Per-river metadata that gameplay can query without touching the mesh:
    /// "is this hex a river source?", "what's the river mouth coord?" etc.
    /// Future: flow direction, accumulated flow, fordability.
    /// </summary>
    public struct RiverMetadata : IComponentData
    {
        public int2 SourceHex;
        public int2 MouthHex;
        public float StartWidth;
        public float EndWidth;
        public byte TerminatesAtWater;
    }
}
