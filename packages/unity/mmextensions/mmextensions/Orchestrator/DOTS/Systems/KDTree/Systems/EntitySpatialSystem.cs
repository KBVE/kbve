using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Collections;
using Unity.Burst;
using Unity.Jobs;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Main system responsible for maintaining the 2D spatial data structures.
    /// Updates QuadTree with entity positions and manages spatial indexing.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderFirst = true)]
    [BurstCompile]
    public partial struct EntitySpatialSystem : ISystem
    {
        private QuadTree2D _quadTree;
        private EntityQuery _spatialEntitiesQuery;
        private EntityQuery _configQuery;
        private NativeHashMap<Entity, float2> _lastKnownPositions;
        private uint _frameCounter;
        private bool _isInitialized;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Create queries
            _spatialEntitiesQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialIndex, LocalToWorld>()
                .Build();

            _configQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialSystemConfig>()
                .Build();

            _frameCounter = 0;
            _isInitialized = false;
            _lastKnownPositions = new NativeHashMap<Entity, float2>(1000, Allocator.Persistent);

            // Require config to exist
            state.RequireForUpdate(_configQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            // Initialize QuadTree if needed
            if (!_isInitialized)
            {
                InitializeQuadTree(ref state);
                if (!_isInitialized) return;
            }

            // Get system configuration
            var config = SystemAPI.GetSingleton<SpatialSystemConfig>();

            // PHASE 2 OPTIMIZATION: Skip ECS query updates if using cache-based updates
            // When UseCacheBasedUpdates = true, spatial data comes from EntityCache instead
            if (config.UseCacheBasedUpdates)
            {
                // Cache-based mode: QuadTree is updated from EntityCacheDrainSystem via SpatialSystemUtilities
                // We still need to clear the QuadTree here for fresh data each frame
                _quadTree.Clear();

                // Skip the expensive ECS query - cache will provide the data
                return;
            }

            // LEGACY PATH: Direct ECS query (used when UseCacheBasedUpdates = false)
            // Clear the QuadTree for fresh data
            _quadTree.Clear();

            // Update spatial index with current entity positions
            var updateJob = new UpdateSpatialIndexJob
            {
                QuadTree = _quadTree,
                LastKnownPositions = _lastKnownPositions,
                FrameCounter = _frameCounter
            };

            state.Dependency = updateJob.ScheduleParallel(_spatialEntitiesQuery, state.Dependency);

            // PERFORMANCE FIX: Removed blocking Complete() call
            // Jobs now run asynchronously - systems that need QuadTree data must complete dependency themselves
            // This prevents main thread blocking when updating spatial index

            // Periodic rebuild if configured
            if (config.RebuildFrequency > 0 && _frameCounter % config.RebuildFrequency == 0)
            {
                RebuildSpatialStructures();
            }
        }

        private void InitializeQuadTree(ref SystemState state)
        {
            if (!_configQuery.IsEmpty)
            {
                var config = SystemAPI.GetSingleton<SpatialSystemConfig>();
                var bounds = new AABB2D(config.WorldOrigin + config.WorldSize * 0.5f, config.WorldSize);

                _quadTree = new QuadTree2D(
                    bounds,
                    config.MaxQuadTreeDepth,
                    config.MaxEntitiesPerNode,
                    Allocator.Persistent
                );

                _isInitialized = true;
            }
        }

        private void RebuildSpatialStructures()
        {
            // For now, just clear the position cache to force updates
            _lastKnownPositions.Clear();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            if (_quadTree.IsCreated)
                _quadTree.Dispose();

            if (_lastKnownPositions.IsCreated)
                _lastKnownPositions.Dispose();
        }

        /// <summary>
        /// Get the QuadTree for spatial queries (read-write access for cache updates)
        /// </summary>
        public QuadTree2D GetQuadTree() => _quadTree;

        /// <summary>
        /// Set the QuadTree (used by cache-based updates)
        /// </summary>
        public void SetQuadTree(QuadTree2D quadTree) => _quadTree = quadTree;

        /// <summary>
        /// Check if the spatial system is properly initialized
        /// </summary>
        public bool IsInitialized => _isInitialized && _quadTree.IsCreated;

        /// <summary>
        /// Get the last known positions map (for cache-based incremental updates)
        /// </summary>
        public NativeHashMap<Entity, float2> GetLastKnownPositions() => _lastKnownPositions;
    }

    /// <summary>
    /// Job to update the spatial index with current entity positions
    /// </summary>
    [BurstCompile]
    public partial struct UpdateSpatialIndexJob : IJobEntity
    {
        public QuadTree2D QuadTree;
        public NativeHashMap<Entity, float2> LastKnownPositions;
        public uint FrameCounter;

        public void Execute(Entity entity, in SpatialIndex spatialIndex, in LocalToWorld localToWorld)
        {
            // Skip if entity doesn't want to be included in queries
            if (!spatialIndex.IncludeInQueries)
                return;

            var currentPosition = localToWorld.Position.xy;

            // Check if we need to update based on movement threshold
            bool shouldUpdate = false;

            if (LastKnownPositions.TryGetValue(entity, out var lastPosition))
            {
                var distance = math.distance(currentPosition, lastPosition);
                // Use default movement threshold since we don't have guaranteed access to settings
                shouldUpdate = distance >= 0.1f; // Default movement threshold
            }
            else
            {
                // First time seeing this entity
                shouldUpdate = true;
            }

            if (shouldUpdate)
            {
                // Insert into QuadTree
                QuadTree.Insert(entity, currentPosition, spatialIndex.Radius);

                // Update tracking data
                LastKnownPositions[entity] = currentPosition;
            }
        }
    }

    /// <summary>
    /// System for managing spatial system configuration and initialization
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct SpatialConfigurationSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            // Create default configuration if none exists
            var configQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialSystemConfig>()
                .Build();

            if (configQuery.IsEmpty)
            {
                var configEntity = state.EntityManager.CreateEntity();
                state.EntityManager.SetName(configEntity, "SpatialSystemConfig");
                state.EntityManager.AddComponentData(configEntity, SpatialSystemConfig.Default);
            }
        }

        public void OnUpdate(ref SystemState state)
        {
            // This system only runs once to set up configuration
            state.Enabled = false;
        }
    }

    /// <summary>
    /// Utility system for cleaning up spatial data when entities are destroyed
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    public partial struct SpatialCleanupSystem : ISystem
    {
        private EntityQuery _spatialSystemQuery;

        public void OnCreate(ref SystemState state)
        {
            // No query needed for cleanup system - we'll implement cleanup differently
        }

        public void OnUpdate(ref SystemState state)
        {
            // Clean up destroyed entities from spatial tracking
            // This would be implemented with a more sophisticated approach
            // tracking entity destruction events
        }
    }
}