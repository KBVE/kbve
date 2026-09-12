using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Identifies which chunk a hex tile belongs to.
    /// </summary>
    public struct ChunkCoord : IComponentData
    {
        public int2 Value;
    }
}
