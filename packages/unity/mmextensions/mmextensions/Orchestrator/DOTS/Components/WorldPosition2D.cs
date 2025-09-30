using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace NSprites
{
    /// <summary>
    /// ECS component that stores a 2D world position for an entity.
    /// 
    /// Useful when working in 2D gameplay contexts where only the X and Y
    /// coordinates matter (e.g., top-down or side-scrolling worlds).
    /// This helps avoid unnecessary overhead of storing full 3D positions
    /// when Z is not relevant.
    /// </summary>
    public struct WorldPosition2D : IComponentData
    {
        /// <summary>
        /// The entity’s position in world space (X and Y only).
        /// </summary>
        public float2 Value;

        /// <summary>
        /// Constructor that extracts the X and Y values from a 3D position.
        /// Ignores the Z-axis, making it suitable for purely 2D simulations.
        /// </summary>
        /// <param name="pos">A 3D float3 position, typically from Transform or physics data.</param>
        public WorldPosition2D(in float3 pos) => Value = pos.xy;
    }
}