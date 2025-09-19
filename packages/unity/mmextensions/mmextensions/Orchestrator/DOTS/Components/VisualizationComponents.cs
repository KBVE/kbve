using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag component for entities that need visual representation
    /// </summary>
    public struct NeedsVisualization : IComponentData
    {
        public MinionType VisualType;
        public bool IsVisualized;
    }

    /// <summary>
    /// Tag component to mark entities that have been visualized
    /// </summary>
    public struct HasVisualization : IComponentData
    {
    }
}