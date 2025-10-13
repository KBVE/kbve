using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct SelectedResource : IComponentData
    {
        public Entity Entity;
    }
}