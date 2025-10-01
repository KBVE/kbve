using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Dynamic buffer that holds references to prefab entities.
    /// 
    /// This component allows an entity (often a factory, spawner,
    /// or orchestrator) to store and access a list of prefab links.
    /// 
    /// Typical use cases:
    /// - Factories or spawners choosing from multiple prefab types.
    /// - Keeping a set of entity variants (e.g., soldier, archer, mage).
    /// - Centralized prefab orchestration for pooling or deployment.
    /// 
    /// Since this is a dynamic buffer, its length can vary per entity.
    /// Systems can iterate through all prefabs linked here to decide
    /// which one to instantiate.
    /// </summary>
    public struct PrefabLink : IBufferElementData
    {
        /// <summary>
        /// Reference to a prefab entity (baked into the entity at conversion).
        /// </summary>
        public Entity link;
    }
}