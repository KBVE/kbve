using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component that marks an entity for inclusion in spatial indexing.
    /// Entities with this component will be automatically tracked in the QuadTree.
    /// </summary>
    public struct SpatialIndex : IComponentData
    {
        /// <summary>
        /// Radius for spatial queries (used for circular collision detection)
        /// </summary>
        public float Radius;

        /// <summary>
        /// Layer mask for filtering spatial queries
        /// </summary>
        public uint LayerMask;

        /// <summary>
        /// Whether this entity should be included in neighbor searches
        /// </summary>
        public bool IncludeInQueries;

        /// <summary>
        /// Priority for spatial operations (higher = more important)
        /// </summary>
        public int Priority;

        public static SpatialIndex Default => new SpatialIndex
        {
            Radius = 1f,
            LayerMask = uint.MaxValue,
            IncludeInQueries = true,
            Priority = 0
        };

        public static SpatialIndex WithRadius(float radius) => new SpatialIndex
        {
            Radius = radius,
            LayerMask = uint.MaxValue,
            IncludeInQueries = true,
            Priority = 0
        };

        public static SpatialIndex WithLayer(uint layerMask) => new SpatialIndex
        {
            Radius = 1f,
            LayerMask = layerMask,
            IncludeInQueries = true,
            Priority = 0
        };
    }

    /// <summary>
    /// Component for entities that need custom spatial bounds different from their LocalToWorld position.
    /// Useful for large structures or entities with complex shapes.
    /// </summary>
    public struct SpatialBounds : IComponentData
    {
        /// <summary>
        /// Local offset from entity position to bounds center
        /// </summary>
        public float2 CenterOffset;

        /// <summary>
        /// Size of the bounding box in world units
        /// </summary>
        public float2 Size;

        /// <summary>
        /// Rotation of the bounds (in radians)
        /// </summary>
        public float Rotation;

        /// <summary>
        /// Whether to use oriented bounding box (OBB) or axis-aligned (AABB)
        /// </summary>
        public bool UseOrientedBounds;

        public static SpatialBounds CreateAABB(float2 size) => new SpatialBounds
        {
            CenterOffset = float2.zero,
            Size = size,
            Rotation = 0f,
            UseOrientedBounds = false
        };

        public static SpatialBounds CreateAABB(float2 centerOffset, float2 size) => new SpatialBounds
        {
            CenterOffset = centerOffset,
            Size = size,
            Rotation = 0f,
            UseOrientedBounds = false
        };

        public static SpatialBounds CreateOBB(float2 size, float rotation) => new SpatialBounds
        {
            CenterOffset = float2.zero,
            Size = size,
            Rotation = rotation,
            UseOrientedBounds = true
        };
    }

    /// <summary>
    /// Component for configuring spatial behavior on a per-entity basis.
    /// Controls how the entity interacts with the spatial systems.
    /// </summary>
    public struct SpatialSettings : IComponentData
    {
        /// <summary>
        /// How often this entity's spatial data should be updated (in frames)
        /// 1 = every frame, 2 = every other frame, etc.
        /// </summary>
        public int UpdateFrequency;

        /// <summary>
        /// Minimum movement distance before triggering spatial update
        /// </summary>
        public float MovementThreshold;

        /// <summary>
        /// Whether this entity should be used for pathfinding obstacles
        /// </summary>
        public bool IsPathfindingObstacle;

        /// <summary>
        /// Whether this entity provides flow field influence
        /// </summary>
        public bool InfluencesFlowField;

        /// <summary>
        /// Cost modifier for pathfinding (1.0 = normal, > 1.0 = harder to path through)
        /// </summary>
        public float PathfindingCost;

        /// <summary>
        /// Whether this entity should participate in spatial debug visualization
        /// </summary>
        public bool ShowInDebug;

        public static SpatialSettings Default => new SpatialSettings
        {
            UpdateFrequency = 1,
            MovementThreshold = 0.1f,
            IsPathfindingObstacle = false,
            InfluencesFlowField = false,
            PathfindingCost = 1f,
            ShowInDebug = false
        };

        public static SpatialSettings Static => new SpatialSettings
        {
            UpdateFrequency = int.MaxValue, // Never update position
            MovementThreshold = float.MaxValue,
            IsPathfindingObstacle = true,
            InfluencesFlowField = true,
            PathfindingCost = float.MaxValue, // Impassable
            ShowInDebug = true
        };

        public static SpatialSettings MovingUnit => new SpatialSettings
        {
            UpdateFrequency = 1, // Every frame
            MovementThreshold = 0.1f,
            IsPathfindingObstacle = false,
            InfluencesFlowField = false,
            PathfindingCost = 1f,
            ShowInDebug = false
        };

        public static SpatialSettings Structure => new SpatialSettings
        {
            UpdateFrequency = 60, // Update once per second at 60fps
            MovementThreshold = 1f,
            IsPathfindingObstacle = true,
            InfluencesFlowField = true,
            PathfindingCost = 10f, // Expensive to path through
            ShowInDebug = true
        };
    }

    /// <summary>
    /// Tag component for entities that have been processed by spatial systems this frame.
    /// Used to avoid duplicate processing and for debugging.
    /// </summary>
    public struct SpatialProcessed : IComponentData
    {
        public uint FrameProcessed;
        public float2 LastKnownPosition;
    }

    /// <summary>
    /// Component for storing cached spatial query results.
    /// Helps avoid repeated expensive queries for the same data.
    /// </summary>
    public struct SpatialCache : IComponentData
    {
        /// <summary>
        /// Frame when this cache was last updated
        /// </summary>
        public uint CacheFrame;

        /// <summary>
        /// Position where the cache was generated
        /// </summary>
        public float2 CachePosition;

        /// <summary>
        /// Number of nearby entities found in last query
        /// </summary>
        public int NearbyEntityCount;

        /// <summary>
        /// Whether the cached data is still valid
        /// </summary>
        public bool IsValid;

        /// <summary>
        /// Maximum distance for which this cache is valid
        /// </summary>
        public float ValidRadius;

        public static SpatialCache Invalid => new SpatialCache
        {
            IsValid = false,
            CacheFrame = 0,
            NearbyEntityCount = 0,
            ValidRadius = 0f
        };

        public bool IsCacheValid(float2 currentPosition, uint currentFrame, int maxCacheAge = 5)
        {
            if (!IsValid) return false;
            if (currentFrame - CacheFrame > maxCacheAge) return false;

            var distance = math.distance(currentPosition, CachePosition);
            return distance <= ValidRadius;
        }
    }

    /// <summary>
    /// Singleton component for global spatial system configuration
    /// </summary>
    public struct SpatialSystemConfig : IComponentData
    {
        /// <summary>
        /// Size of the QuadTree world bounds
        /// </summary>
        public float2 WorldSize;

        /// <summary>
        /// Origin point of the spatial world
        /// </summary>
        public float2 WorldOrigin;

        /// <summary>
        /// Maximum depth of the QuadTree
        /// </summary>
        public int MaxQuadTreeDepth;

        /// <summary>
        /// Maximum entities per QuadTree node before splitting
        /// </summary>
        public int MaxEntitiesPerNode;

        /// <summary>
        /// Whether to enable spatial debug visualization
        /// </summary>
        public bool EnableDebugVisualization;

        /// <summary>
        /// How often to rebuild the spatial structures (in frames, 0 = never)
        /// </summary>
        public int RebuildFrequency;

        /// <summary>
        /// Performance budget for spatial updates per frame (in microseconds)
        /// </summary>
        public int UpdateBudgetMicroseconds;

        public static SpatialSystemConfig Default => new SpatialSystemConfig
        {
            WorldSize = new float2(1000f, 1000f),
            WorldOrigin = new float2(-500f, -500f),
            MaxQuadTreeDepth = 8,
            MaxEntitiesPerNode = 16,
            EnableDebugVisualization = false,
            RebuildFrequency = 0,
            UpdateBudgetMicroseconds = 1000 // 1ms budget
        };

        public static SpatialSystemConfig ForLargeWorld(float2 worldSize) => new SpatialSystemConfig
        {
            WorldSize = worldSize,
            WorldOrigin = -worldSize * 0.5f,
            MaxQuadTreeDepth = 10,
            MaxEntitiesPerNode = 32,
            EnableDebugVisualization = false,
            RebuildFrequency = 0,
            UpdateBudgetMicroseconds = 2000 // 2ms budget for large worlds
        };
    }
}