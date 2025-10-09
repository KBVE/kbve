using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public struct PrevWorldPosition2D : IComponentData
    {
        public float2 value;
    }
}