using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Stores the previous world-space position of an entity in 2D.
    /// 
    /// Typically used to detect when an entity has moved since the last frame,
    /// so that systems (e.g., squad or horde movement) can update destinations
    /// or trigger events only when a position change occurs.
    /// </summary>
    public struct PrevWorldPosition2D : IComponentData
    {
        /// <summary>
        /// The last recorded 2D position of the entity in world space.
        /// </summary>
        public float2 value;
    }
}
