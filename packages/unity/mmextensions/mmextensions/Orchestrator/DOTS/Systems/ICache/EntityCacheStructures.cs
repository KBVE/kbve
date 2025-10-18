using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Per-frame cache entity singleton tag
    /// Marks the entity that holds the cached frame data
    /// EntityBlitContainer is used directly as the buffer element for maximum performance
    /// </summary>
    public struct EntityFrameCacheTag : IComponentData { }
}