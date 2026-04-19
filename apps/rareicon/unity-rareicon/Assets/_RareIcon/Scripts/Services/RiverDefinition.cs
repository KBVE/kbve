using System.Collections.Generic;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Output of RiverRouter — a single routed river. Consumed by
    /// RiverSpawnSystem (mesh + entity) and any future gameplay systems
    /// (fishing, fords, water-aware pathfinding, etc.).
    /// </summary>
    public sealed class RiverDefinition
    {
        /// <summary>Dense world-space polyline (already smoothed).</summary>
        public List<float2> Points;

        /// <summary>Width at each polyline vertex (matches Points length).</summary>
        public List<float> Widths;

        /// <summary>Hex coords for source + mouth — useful for queries / overlays.</summary>
        public int2 SourceHex;
        public int2 MouthHex;

        /// <summary>True if the river terminated at lake/ocean (vs stalling in a basin).</summary>
        public bool TerminatesAtWater;
    }
}
