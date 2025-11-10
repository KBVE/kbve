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

        /// <summary>
        /// Use entity cache for spatial updates (Phase 2 optimization)
        /// When true, spatial systems receive data from cache instead of querying ECS directly
        /// </summary>
        public bool UseCacheBasedUpdates;

        public static SpatialSystemConfig Default => new SpatialSystemConfig
        {
            WorldSize = new float2(1000f, 1000f),
            WorldOrigin = new float2(-500f, -500f),
            MaxQuadTreeDepth = 8,
            MaxEntitiesPerNode = 16,
            EnableDebugVisualization = false,
            RebuildFrequency = 0,
            UpdateBudgetMicroseconds = 1000, // 1ms budget
            UseCacheBasedUpdates = false // Phase 2: Enable for cache-based optimization
        };

        public static SpatialSystemConfig ForLargeWorld(float2 worldSize) => new SpatialSystemConfig
        {
            WorldSize = worldSize,
            WorldOrigin = -worldSize * 0.5f,
            MaxQuadTreeDepth = 10,
            MaxEntitiesPerNode = 32,
            EnableDebugVisualization = false,
            RebuildFrequency = 0,
            UpdateBudgetMicroseconds = 2000, // 2ms budget for large worlds
            UseCacheBasedUpdates = false // Can enable for cache-based optimization
        };
    }

    /// <summary>
    /// Singleton component that stores the DYNAMIC QuadTree for moving entities.
    /// Rebuilt every frame for entities that can move (combatants, players, etc.).
    /// This allows Burst jobs to access the QuadTree for fast spatial lookups.
    /// </summary>
    public struct QuadTreeSingleton : IComponentData
    {
        /// <summary>
        /// The QuadTree data structure for spatial queries of dynamic entities.
        /// Accessible from Burst jobs for high-performance radius/rectangle queries.
        /// </summary>
        public QuadTree2D QuadTree;

        /// <summary>
        /// Frame number when the QuadTree was last updated
        /// </summary>
        public uint LastUpdateFrame;

        /// <summary>
        /// Whether the QuadTree is currently valid and ready for queries
        /// </summary>
        public bool IsValid;
    }

    /// <summary>
    /// Singleton component that stores the STATIC QuadTree for non-moving entities.
    /// Built once for static resources, structures, etc. Never cleared unless entities spawn/despawn.
    /// </summary>
    public struct StaticQuadTreeSingleton : IComponentData
    {
        /// <summary>
        /// The QuadTree data structure for static entities only.
        /// Accessible from Burst jobs for high-performance spatial lookups.
        /// </summary>
        public QuadTree2D QuadTree;

        /// <summary>
        /// Frame number when the QuadTree was last updated (only on entity spawn/despawn)
        /// </summary>
        public uint LastUpdateFrame;

        /// <summary>
        /// Whether the QuadTree is currently valid and ready for queries
        /// </summary>
        public bool IsValid;

        /// <summary>
        /// Dirty flag - set to true when static entities spawn/despawn and tree needs rebuild
        /// </summary>
        public bool NeedsRebuild;

        /// <summary>
        /// FENCE: Published job handle for dependency tracking.
        /// Consumers must combine this with their state.Dependency before reading QuadTree
        /// </summary>
        public Unity.Jobs.JobHandle BuildJobHandle;
    }

    /// <summary>
    /// Singleton component that stores the KD-Tree for nearest neighbor queries.
    /// Complements QuadTreeSingleton - use KD-Tree for exact nearest neighbor, QuadTree for radius queries.
    /// </summary>
    public struct KDTreeSingleton : IComponentData
    {
        /// <summary>
        /// The KD-Tree data structure for nearest neighbor queries.
        /// Best for finding exact K-nearest entities, worse for dynamic updates than QuadTree.
        /// </summary>
        public KDTree2D KDTree;

        /// <summary>
        /// Frame number when the KD-Tree was last updated
        /// </summary>
        public uint LastUpdateFrame;

        /// <summary>
        /// Whether the KD-Tree is currently valid and ready for queries
        /// </summary>
        public bool IsValid;
    }

    /// <summary>
    /// Singleton component that stores the Spatial Hash Grid for dynamic entities.
    /// O(1) insert/query performance, optimized for entities that move frequently.
    /// Replaces QuadTreeSingleton for dynamic entities (combatants, players, projectiles).
    /// </summary>
    public struct SpatialHashGridSingleton : IComponentData
    {
        /// <summary>
        /// The Spatial Hash Grid data structure for dynamic entities.
        /// O(1) insert/query vs O(log N) for QuadTree - much faster for moving entities!
        /// </summary>
        public SpatialHashGrid2D HashGrid;

        /// <summary>
        /// Frame number when the hash grid was last updated
        /// </summary>
        public uint LastUpdateFrame;

        /// <summary>
        /// Whether the hash grid is currently valid and ready for queries
        /// </summary>
        public bool IsValid;

        /// <summary>
        /// FENCE: Published job handle for dependency tracking.
        /// Consumers must combine this with their state.Dependency before reading HashGrid
        /// </summary>
        public Unity.Jobs.JobHandle BuildJobHandle;
    }

    /// <summary>
    /// Tag component marking the entity that owns the spatial data structures
    /// </summary>
    public struct SpatialSystemTag : IComponentData { }
}