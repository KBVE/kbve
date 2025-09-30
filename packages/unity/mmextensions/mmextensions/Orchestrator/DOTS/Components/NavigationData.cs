using Unity.Entities;
using Unity.Mathematics;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>Navigation/target tracking metadata.</summary>
    public struct NavigationData : IComponentData
    {
        public Entity targetEntity;
        public float3 lastKnownTargetPos;
        public float scanRadius;
        public float updateInterval;
        public float lastUpdate;
        public int waypointIndex;
        public int pathVersion;

        public static NavigationData CreateDefault(float scanRadius = 15f) => new()
        {
            targetEntity = Entity.Null,
            lastKnownTargetPos = float3.zero,
            scanRadius = scanRadius,
            updateInterval = 1f,
            lastUpdate = 0f,
            waypointIndex = -1,
            pathVersion = 0
        };
    }
}
