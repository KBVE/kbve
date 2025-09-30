using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>Movement & destination (2D-focused, 3D-compatible).</summary>
    public struct Movement : IComponentData
    {
        public float3 destination;     // keep float3 for world compatibility
        public float2 facingDirection; // 2D direction
        public float2 velocity;        // 2D velocity
        public float stoppingDistance;
        public float arrivalThreshold; // pre-squared

        public static Movement CreateDefault(float stoppingDistance = 2f) => new()
        {
            destination = float3.zero,
            facingDirection = new float2(1, 0),
            velocity = float2.zero,
            stoppingDistance = stoppingDistance,
            arrivalThreshold = stoppingDistance * stoppingDistance
        };
    }
}
