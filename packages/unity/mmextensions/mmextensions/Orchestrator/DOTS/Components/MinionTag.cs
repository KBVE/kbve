using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag component that identifies an entity as a "Minion".
    /// 
    /// This is a zero-sized marker (no fields) used by ECS systems to 
    /// quickly query, filter, or batch entities that represent minions.
    /// 
    /// Example: A spawning system may add this tag to newly instantiated
    /// entities, while AI, animation, or rendering systems can run 
    /// queries specifically on <see cref="MinionTag"/> to apply
    /// minion-specific logic without affecting other entity types.
    /// </summary>
    public struct MinionTag : IComponentData
    {
    }
}
