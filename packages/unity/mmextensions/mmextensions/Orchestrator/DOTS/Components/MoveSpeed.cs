using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Movement speed component for an entity.
    /// 
    /// Stores the base movement speed value in world units per second.
    /// Systems that handle pathfinding, steering, or animation can read
    /// this component to determine how fast an entity should move.
    /// </summary>
    public struct MoveSpeed : IComponentData
    {
        /// <summary>
        /// The movement speed of the entity (units per second).
        /// </summary>
        public float value;
    }
}
