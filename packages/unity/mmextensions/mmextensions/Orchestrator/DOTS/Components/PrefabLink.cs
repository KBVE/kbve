using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct PrefabLink : IBufferElementData
    {
        public Entity link;
    }
}