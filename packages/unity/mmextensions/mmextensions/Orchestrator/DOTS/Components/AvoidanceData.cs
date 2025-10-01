using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>Local avoidance/collision steering data.</summary>
    public struct AvoidanceData : IComponentData
    {
        public float personalSpace;
        public float3 avoidanceVector;
        public float speedVariation;
        public float lastAvoidanceUpdate;

        public static AvoidanceData CreateDefault(float personalSpace = 2f) => new()
        {
            personalSpace = personalSpace,
            avoidanceVector = float3.zero,
            speedVariation = 1f,
            lastAvoidanceUpdate = 0f
        };
    }
}
