using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Enableable component that controls entity visibility in presentation systems.
    /// Acts as a high-performance gate for rendering and UI updates.
    /// </summary>
    /// <remarks>
    /// This component uses Unity's IEnableableComponent interface for optimal performance:
    /// - When ENABLED: Entity is eligible for rendering, UI updates, and visual processing
    /// - When DISABLED: Entity is culled from all presentation systems (no rendering overhead)
    ///
    /// Common use cases:
    /// - Frustum culling: Disable entities outside camera view
    /// - LOD systems: Disable distant entities or switch to simpler representations
    /// - UI visibility: Control which entities show health bars, nameplates, etc.
    /// - Performance optimization: Batch enable/disable for better cache coherency
    ///
    /// Systems that should query for this component:
    /// - Sprite/mesh rendering systems
    /// - Health bar and nameplate systems
    /// - Particle effect systems
    /// - Shadow casting systems
    /// - Any visual feedback systems
    ///
    /// Example usage:
    /// <code>
    /// // In a culling system
    /// EntityManager.SetComponentEnabled<Visible>(entity, isInView);
    ///
    /// // In a rendering system
    /// Entities.WithAll<Visible>().ForEach(...) // Only process visible entities
    /// </code>
    ///
    /// Performance note: IEnableableComponent has zero memory overhead when disabled
    /// and enables efficient chunk-based filtering in queries.
    /// </remarks>
    public struct Visible : IComponentData, IEnableableComponent { }
}