using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct FactoryData : IComponentData
    {
        public Entity prefab;
        public int count;
        public float duration;
        public float2 instantiatePos;
    }
}