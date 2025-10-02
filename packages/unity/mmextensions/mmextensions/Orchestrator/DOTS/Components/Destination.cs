using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct Destination : IComponentData
    {
        public float2 Value;
    }
}