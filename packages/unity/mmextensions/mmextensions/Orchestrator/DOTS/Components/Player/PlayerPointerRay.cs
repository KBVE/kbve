using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Blittable singleton updated each frame with the current pointer ray.
    /// Written by PointerRayBridge (MonoBehaviour), read by PlayerHoverSystem.
    /// </summary>
    public struct PlayerPointerRay : IComponentData
    {
        public float3 Origin;
        public float3 Direction;
        public float MaxDistance;
    }
}