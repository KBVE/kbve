using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Dynamic buffer element that stores a reference to a minion entity.
    /// 
    /// Used to link a controlling entity (such as a horde leader, spawner,
    /// or squad) with the minion entities it owns. This makes it easy for
    /// systems to iterate over all minions belonging to a specific controller.
    /// </summary>
    public struct MinionLink : IBufferElementData
    {
        /// <summary>
        /// The entity reference to a minion that is part of the buffer list.
        /// </summary>
        public Entity entity;
    }
}
