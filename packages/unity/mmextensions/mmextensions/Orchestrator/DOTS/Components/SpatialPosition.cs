using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component for spatial indexing and efficient queries
    /// Used by KDTree and spatial hash grid systems
    /// </summary>
    public struct SpatialPosition : IComponentData
    {
        public float3 Position;
        public float3 PreviousPosition;
        public float3 Velocity;

        // Spatial indexing data
        public int SpatialGridIndex;
        public int KDTreeNodeIndex;
        public uint SpatialHash;

        // Optimization hints
        public float LastMoveDistance;
        public bool RequiresIndexUpdate;

        public static SpatialPosition Create(float3 position)
        {
            return new SpatialPosition
            {
                Position = position,
                PreviousPosition = position,
                Velocity = float3.zero,
                SpatialGridIndex = -1,
                KDTreeNodeIndex = -1,
                SpatialHash = 0,
                LastMoveDistance = 0,
                RequiresIndexUpdate = true
            };
        }

        public void UpdatePosition(float3 newPosition)
        {
            PreviousPosition = Position;
            Position = newPosition;
            Velocity = Position - PreviousPosition;
            LastMoveDistance = math.length(Velocity);
            RequiresIndexUpdate = LastMoveDistance > 0.1f; // Update threshold
        }
    }

    /// <summary>
    /// Component for entities that need spatial queries
    /// </summary>
    public struct SpatialQueryRequest : IComponentData
    {
        public float QueryRadius;
        public int MaxResults;
        public QueryType Type;
        public FactionFilter TargetFaction;
    }

    public enum QueryType : byte
    {
        Nearest = 0,
        AllInRadius = 1,
        ClosestEnemy = 2,
        ClosestAlly = 3,
        AOETargets = 4
    }

    [System.Flags]
    public enum FactionFilter : byte
    {
        None = 0,
        Neutral = 1 << 0,
        Player = 1 << 1,
        Enemy = 1 << 2,
        Ally = 1 << 3,
        All = Neutral | Player | Enemy | Ally
    }

    /// <summary>
    /// Results buffer for spatial queries
    /// </summary>
    public struct SpatialQueryResult : IBufferElementData
    {
        public Entity TargetEntity;
        public float Distance;
        public float3 Position;
    }
}