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
        private EntityQuery _spatialEntitiesQuery;
        private EntityQuery _configQuery;
        private EntityQuery _quadTreeQuery;
        private NativeHashMap<Entity, float2> _lastKnownPositions;
        private uint _frameCounter;

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

            _quadTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<QuadTreeSingleton, SpatialSystemTag>()
                .Build();

            _frameCounter = 0;
            _lastKnownPositions = new NativeHashMap<Entity, float2>(1000, Allocator.Persistent);

            // Require config to exist
            state.RequireForUpdate(_configQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            // Initialize QuadTree singleton if needed
            if (_quadTreeQuery.IsEmpty)
            {
                InitializeQuadTreeSingleton(ref state);
                return;
            }

            // Get QuadTree singleton
            var quadTreeEntity = _quadTreeQuery.GetSingletonEntity();
            var quadTreeSingleton = state.EntityManager.GetComponentData<QuadTreeSingleton>(quadTreeEntity);

            // Verify QuadTree is valid
            if (!quadTreeSingleton.IsValid)
            {
                InitializeQuadTreeSingleton(ref state);
                return;
            }

            // Get system configuration
            var config = SystemAPI.GetSingleton<SpatialSystemConfig>();

            // PHASE 2 OPTIMIZATION: Skip ECS query updates if using cache-based updates
            // When UseCacheBasedUpdates = true, spatial data comes from EntityCache instead
            if (config.UseCacheBasedUpdates)
            {
                // Cache-based mode: QuadTree is updated from EntityCacheDrainSystem via SpatialSystemUtilities
                // We still need to clear the QuadTree here for fresh data each frame
                quadTreeSingleton.QuadTree.Clear();
                quadTreeSingleton.LastUpdateFrame = _frameCounter;
                state.EntityManager.SetComponentData(quadTreeEntity, quadTreeSingleton);

                // Skip the expensive ECS query - cache will provide the data
                return;
            }

            // LEGACY PATH: Direct ECS query (used when UseCacheBasedUpdates = false)
            // Clear the QuadTree for fresh data
            quadTreeSingleton.QuadTree.Clear();

            // Update spatial index with current entity positions
            var updateJob = new UpdateSpatialIndexJob
            {
                QuadTree = quadTreeSingleton.QuadTree,
                LastKnownPositions = _lastKnownPositions,
                FrameCounter = _frameCounter
            };

            state.Dependency = updateJob.ScheduleParallel(_spatialEntitiesQuery, state.Dependency);

            // Update the singleton with the modified QuadTree after job completes
            // Note: We schedule a follow-up job to write back to the singleton
            var writeBackJob = new WriteQuadTreeBackJob
            {
                QuadTreeEntity = quadTreeEntity,
                QuadTree = quadTreeSingleton.QuadTree,
                FrameCounter = _frameCounter,
                QuadTreeLookup = state.GetComponentLookup<QuadTreeSingleton>(false)
            };
            state.Dependency = writeBackJob.Schedule(state.Dependency);

            // Periodic rebuild if configured
            if (config.RebuildFrequency > 0 && _frameCounter % config.RebuildFrequency == 0)
            {
                RebuildSpatialStructures();
            }
        }

        private void InitializeQuadTreeSingleton(ref SystemState state)
        {
            if (!_configQuery.IsEmpty)
            {
                var config = SystemAPI.GetSingleton<SpatialSystemConfig>();
                var bounds = new AABB2D(config.WorldOrigin + config.WorldSize * 0.5f, config.WorldSize);

                var quadTree = new QuadTree2D(
                    bounds,
                    config.MaxQuadTreeDepth,
                    config.MaxEntitiesPerNode,
                    Allocator.Persistent
                );

                // Create or get singleton entity
                Entity singletonEntity;
                if (_quadTreeQuery.IsEmpty)
                {
                    singletonEntity = state.EntityManager.CreateEntity();
                    state.EntityManager.AddComponent<SpatialSystemTag>(singletonEntity);
                    state.EntityManager.SetName(singletonEntity, "QuadTreeSingleton");
                }
                else
                {
                    singletonEntity = _quadTreeQuery.GetSingletonEntity();
                }

                // Store QuadTree in singleton
                var singleton = new QuadTreeSingleton
                {
                    QuadTree = quadTree,
                    LastUpdateFrame = 0,
                    IsValid = true
                };
                state.EntityManager.AddComponentData(singletonEntity, singleton);
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
            // Dispose QuadTree from singleton
            if (!_quadTreeQuery.IsEmpty)
            {
                var quadTreeEntity = _quadTreeQuery.GetSingletonEntity();
                var singleton = state.EntityManager.GetComponentData<QuadTreeSingleton>(quadTreeEntity);
                if (singleton.QuadTree.IsCreated)
                {
                    singleton.QuadTree.Dispose();
                }
            }

            if (_lastKnownPositions.IsCreated)
                _lastKnownPositions.Dispose();
        }
    }

    /// <summary>
    /// Job to write the QuadTree back to the singleton component after updates
    /// </summary>
    [BurstCompile]
    public partial struct WriteQuadTreeBackJob : IJob
    {
        public Entity QuadTreeEntity;
        public QuadTree2D QuadTree;
        public uint FrameCounter;
        public ComponentLookup<QuadTreeSingleton> QuadTreeLookup;

        public void Execute()
        {
            var singleton = QuadTreeLookup[QuadTreeEntity];
            singleton.QuadTree = QuadTree;
            singleton.LastUpdateFrame = FrameCounter;
            QuadTreeLookup[QuadTreeEntity] = singleton;
        }
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