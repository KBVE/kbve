using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag component that marks an entity as a "Horde Minion".
    /// 
    /// This is a zero-sized marker (IComponentData with no fields)
    /// used purely for identification. Systems can query against
    /// this tag to apply horde-related logic without needing to
    /// check other components or state.
    /// 
    /// Typical use cases:
    /// - Filtering entities that belong to a larger horde group.
    /// - Applying shared AI behavior (swarm movement, horde buffs).
    /// - Differentiating between "leader" entities and minions.
    /// 
    /// Since this is a tag, it carries no runtime cost other than
    /// the presence/absence check in queries.
    /// </summary>
    public struct InHordeMinionTag : IComponentData
    {
        // Intentionally left empty. Acts only as a marker.
    }
}