using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// ECS component that specifies how many minions an entity requires.
    /// 
    /// Typically attached to a horde or squad controller entity to indicate
    /// how many minions should be spawned, maintained, or linked to it.
    /// Systems that handle spawning or balancing minion counts will read this
    /// component and ensure the correct number of minions exist.
    /// </summary>
    public struct RequireMinion : IComponentData
    {
        /// <summary>
        /// The required number of minions for this entity (e.g., horde leader or spawner).
        /// </summary>
        public int count;
    }
}
