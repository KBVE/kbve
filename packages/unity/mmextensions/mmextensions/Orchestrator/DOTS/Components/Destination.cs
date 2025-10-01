using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// ECS component that represents a target 2D position for an entity.
    /// 
    /// Typically used in movement, pathfinding, or AI systems to define
    /// where the entity should move next. The value is stored as a float2
    /// to emphasize 2D world coordinates (X, Y).
    /// </summary>
    public struct Destination : IComponentData
    {
        /// <summary>
        /// The desired target position in world space (X, Y only).
        /// </summary>
        public float2 Value;
    }
}