using Unity.Entities;
using Unity.Jobs;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Per-frame cache entity singleton tag
    /// Marks the entity that holds the cached frame data
    /// EntityBlitContainer is used directly as the buffer element for maximum performance
    /// </summary>
    public struct EntityFrameCacheTag : IComponentData { }

    /// <summary>
    /// Singleton component to store the producer job handle for dependency management
    /// This allows the drain system to properly wait for producer jobs to complete
    /// </summary>
    public struct EntityCacheJobHandle : IComponentData
    {
        public JobHandle ProducerJobHandle;
    }
}