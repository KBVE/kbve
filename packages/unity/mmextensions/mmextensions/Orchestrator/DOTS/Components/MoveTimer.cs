using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Timer component for controlling movement updates of minions.
    /// 
    /// Can be used to throttle how often a minion recalculates its movement
    /// path, updates its target position, or performs AI-driven decisions.
    /// Keeps ECS systems efficient by spreading work across multiple frames.
    /// </summary>
    public struct MoveTimer : IComponentData
    {
        /// <summary>
        /// Time (in seconds) remaining until the minion is allowed
        /// to move again or recalculate its path.
        /// </summary>
        public float RemainingTime;
    }
}
