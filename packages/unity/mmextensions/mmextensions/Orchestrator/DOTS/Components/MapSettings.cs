using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct MapSettings : IComponentData
    {
        public float2x2 size;
        public Entity resourceCollectionLink;
        public int resourceCount;
    }
}