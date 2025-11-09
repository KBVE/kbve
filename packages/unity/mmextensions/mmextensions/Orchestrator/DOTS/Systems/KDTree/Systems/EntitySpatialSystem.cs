using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Collections;
using Unity.Burst;
using Unity.Burst.Intrinsics;
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
        private EntityQuery _staticEntitiesQuery;  // Static resources/structures
        private EntityQuery _dynamicEntitiesQuery; // Moving combatants/players
        private EntityQuery _configQuery;
        private EntityQuery _quadTreeQuery;
        private EntityQuery _staticQuadTreeQuery;
        private EntityQuery _kdTreeQuery;
        private NativeHashMap<Entity, float2> _lastKnownPositions;
        private uint _frameCounter;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Create queries
            _spatialEntitiesQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialIndex, LocalToWorld>()
                .Build();

            // Static entities: UpdateFrequency > 1 (updated rarely or never)
            _staticEntitiesQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialIndex, LocalToWorld, SpatialSettings>()
                .Build();

            // Dynamic entities: UpdateFrequency == 1 (updated every frame)
            _dynamicEntitiesQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialIndex, LocalToWorld, SpatialSettings>()
                .Build();

            _configQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialSystemConfig>()
                .Build();

            _quadTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<QuadTreeSingleton, SpatialSystemTag>()
                .Build();

            _staticQuadTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<StaticQuadTreeSingleton, SpatialSystemTag>()
                .Build();

            _kdTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<KDTreeSingleton, SpatialSystemTag>()
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

            // DUAL QUADTREE OPTIMIZATION: Separate static and dynamic entities
            // Static QuadTree: Resources, structures (rebuilt only on spawn/despawn)
            // Dynamic QuadTree: Combatants, players (rebuilt every frame with movement threshold)

            // Step 1: Update STATIC QuadTree (only if entities spawned/despawned)
            UpdateStaticQuadTree(ref state);

            // Step 2: Update DYNAMIC QuadTree (every frame, with movement threshold)
            // Clear dynamic tree and rebuild with only entities that moved
            quadTreeSingleton.QuadTree.Clear();

            // PARALLEL-SAFE PATTERN: Use NativeStream to collect insertions in parallel
            // Gather ONLY dynamic entities (UpdateFrequency == 1)
            var dynamicChunkCount = _dynamicEntitiesQuery.CalculateChunkCountWithoutFiltering();
            var dynamicDataStream = new NativeStream(math.max(1, dynamicChunkCount), Allocator.TempJob);

            var gatherDynamicJob = new GatherDynamicSpatialDataJob
            {
                SpatialIndexTypeHandle = state.GetComponentTypeHandle<SpatialIndex>(true),
                SpatialSettingsTypeHandle = state.GetComponentTypeHandle<SpatialSettings>(true),
                LocalToWorldTypeHandle = state.GetComponentTypeHandle<LocalToWorld>(true),
                EntityTypeHandle = state.GetEntityTypeHandle(),
                LastKnownPositions = _lastKnownPositions,
                OutStream = dynamicDataStream.AsWriter(),
                FrameCounter = _frameCounter
            };

            var gatherDependency = gatherDynamicJob.ScheduleParallel(_dynamicEntitiesQuery, state.Dependency);

            // Step 3: Insert collected dynamic data into dynamic QuadTree serially
            var insertDynamicJob = new InsertIntoQuadTreeJob
            {
                QuadTree = quadTreeSingleton.QuadTree,
                InStream = dynamicDataStream.AsReader(),
                LastKnownPositions = _lastKnownPositions,
                FrameCounter = _frameCounter
            };

            var insertDependency = insertDynamicJob.Schedule(gatherDependency);

            // Dispose the stream after insertion
            dynamicDataStream.Dispose(insertDependency);

            state.Dependency = insertDependency;

            // Update the singleton with the modified QuadTree
            // NOTE: We can't do this in a job because QuadTree contains nested native containers
            // The InsertIntoQuadTreeJob already modified quadTreeSingleton.QuadTree in-place,
            // so we just need to update the LastUpdateFrame
            quadTreeSingleton.LastUpdateFrame = _frameCounter;
            state.EntityManager.SetComponentData(quadTreeEntity, quadTreeSingleton);

            // Build KD-Tree from spatial entities (expensive O(N log N), so do it less frequently)
            // KD-Tree is better for exact nearest neighbor, QuadTree for radius queries
            // Rebuild every 10 frames to balance performance and accuracy
            if (_frameCounter % 10 == 0 && !_kdTreeQuery.IsEmpty)
            {
                var kdTreeEntity = _kdTreeQuery.GetSingletonEntity();
                var kdTreeSingleton = state.EntityManager.GetComponentData<KDTreeSingleton>(kdTreeEntity);

                // Gather all spatial entities
                var entities = _spatialEntitiesQuery.ToEntityArray(Allocator.TempJob);
                var transforms = _spatialEntitiesQuery.ToComponentDataArray<LocalToWorld>(Allocator.TempJob);
                var spatialIndices = _spatialEntitiesQuery.ToComponentDataArray<SpatialIndex>(Allocator.TempJob);

                // Build entries array
                var entries = new NativeArray<KDTreeEntry>(entities.Length, Allocator.TempJob);
                int validCount = 0;

                for (int i = 0; i < entities.Length; i++)
                {
                    if (spatialIndices[i].IncludeInQueries)
                    {
                        entries[validCount++] = new KDTreeEntry
                        {
                            Entity = entities[i],
                            Position = transforms[i].Position.xy
                        };
                    }
                }

                // Trim to actual count
                var validEntries = new NativeArray<KDTreeEntry>(validCount, Allocator.TempJob);
                NativeArray<KDTreeEntry>.Copy(entries, validEntries, validCount);

                // Build KD-Tree
                kdTreeSingleton.KDTree.Build(validEntries);
                kdTreeSingleton.LastUpdateFrame = _frameCounter;
                state.EntityManager.SetComponentData(kdTreeEntity, kdTreeSingleton);

                // Cleanup
                entities.Dispose();
                transforms.Dispose();
                spatialIndices.Dispose();
                entries.Dispose();
                validEntries.Dispose();
            }

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

                // Create KD-Tree with estimated capacity
                var kdTree = new KDTree2D(1000, Allocator.Persistent);

                // Create or get singleton entity
                Entity singletonEntity;
                if (_quadTreeQuery.IsEmpty)
                {
                    singletonEntity = state.EntityManager.CreateEntity();
                    state.EntityManager.AddComponent<SpatialSystemTag>(singletonEntity);
                    state.EntityManager.SetName(singletonEntity, "SpatialDataSingleton");
                }
                else
                {
                    singletonEntity = _quadTreeQuery.GetSingletonEntity();
                }

                // Store QuadTree in singleton
                var quadTreeSingleton = new QuadTreeSingleton
                {
                    QuadTree = quadTree,
                    LastUpdateFrame = 0,
                    IsValid = true
                };
                state.EntityManager.AddComponentData(singletonEntity, quadTreeSingleton);

                // Store Static QuadTree in singleton
                var staticQuadTree = new QuadTree2D(bounds, config.MaxQuadTreeDepth, config.MaxEntitiesPerNode, Allocator.Persistent);
                var staticQuadTreeSingleton = new StaticQuadTreeSingleton
                {
                    QuadTree = staticQuadTree,
                    LastUpdateFrame = 0,
                    IsValid = true,
                    NeedsRebuild = true // Force initial build
                };
                state.EntityManager.AddComponentData(singletonEntity, staticQuadTreeSingleton);

                // Store KD-Tree in singleton
                var kdTreeSingleton = new KDTreeSingleton
                {
                    KDTree = kdTree,
                    LastUpdateFrame = 0,
                    IsValid = true
                };
                state.EntityManager.AddComponentData(singletonEntity, kdTreeSingleton);
            }
        }

        private void UpdateStaticQuadTree(ref SystemState state)
        {
            // Only rebuild if needed (entities spawned/despawned)
            if (_staticQuadTreeQuery.IsEmpty) return;

            var staticQuadTreeEntity = _staticQuadTreeQuery.GetSingletonEntity();
            var staticQuadTreeSingleton = state.EntityManager.GetComponentData<StaticQuadTreeSingleton>(staticQuadTreeEntity);

            if (!staticQuadTreeSingleton.NeedsRebuild)
                return; // No changes to static entities, skip rebuild

            // Rebuild static tree
            staticQuadTreeSingleton.QuadTree.Clear();

            // TODO: For now, rebuild every 60 frames to catch new entities
            // In production, use entity spawn/despawn events to set NeedsRebuild flag
            if (_frameCounter % 60 == 0)
            {
                var staticChunkCount = _staticEntitiesQuery.CalculateChunkCountWithoutFiltering();
                var staticDataStream = new NativeStream(math.max(1, staticChunkCount), Allocator.TempJob);

                var gatherStaticJob = new GatherStaticSpatialDataJob
                {
                    SpatialIndexTypeHandle = state.GetComponentTypeHandle<SpatialIndex>(true),
                    SpatialSettingsTypeHandle = state.GetComponentTypeHandle<SpatialSettings>(true),
                    LocalToWorldTypeHandle = state.GetComponentTypeHandle<LocalToWorld>(true),
                    EntityTypeHandle = state.GetEntityTypeHandle(),
                    OutStream = staticDataStream.AsWriter()
                };

                var gatherDep = gatherStaticJob.ScheduleParallel(_staticEntitiesQuery, state.Dependency);

                var insertStaticJob = new InsertIntoQuadTreeJob
                {
                    QuadTree = staticQuadTreeSingleton.QuadTree,
                    InStream = staticDataStream.AsReader(),
                    LastKnownPositions = _lastKnownPositions,
                    FrameCounter = _frameCounter
                };

                var insertDep = insertStaticJob.Schedule(gatherDep);
                staticDataStream.Dispose(insertDep);
                insertDep.Complete(); // Must complete before updating singleton

                staticQuadTreeSingleton.LastUpdateFrame = _frameCounter;
                staticQuadTreeSingleton.NeedsRebuild = false;
                state.EntityManager.SetComponentData(staticQuadTreeEntity, staticQuadTreeSingleton);
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
            // Dispose Dynamic QuadTree from singleton
            if (!_quadTreeQuery.IsEmpty)
            {
                var quadTreeEntity = _quadTreeQuery.GetSingletonEntity();
                var quadTreeSingleton = state.EntityManager.GetComponentData<QuadTreeSingleton>(quadTreeEntity);
                if (quadTreeSingleton.QuadTree.IsCreated)
                {
                    quadTreeSingleton.QuadTree.Dispose();
                }
            }

            // Dispose Static QuadTree from singleton
            if (!_staticQuadTreeQuery.IsEmpty)
            {
                var staticQuadTreeEntity = _staticQuadTreeQuery.GetSingletonEntity();
                var staticQuadTreeSingleton = state.EntityManager.GetComponentData<StaticQuadTreeSingleton>(staticQuadTreeEntity);
                if (staticQuadTreeSingleton.QuadTree.IsCreated)
                {
                    staticQuadTreeSingleton.QuadTree.Dispose();
                }
            }

            // Dispose KD-Tree from singleton
            if (!_kdTreeQuery.IsEmpty)
            {
                var kdTreeEntity = _kdTreeQuery.GetSingletonEntity();
                var kdTreeSingleton = state.EntityManager.GetComponentData<KDTreeSingleton>(kdTreeEntity);
                if (kdTreeSingleton.KDTree.IsCreated)
                {
                    kdTreeSingleton.KDTree.Dispose();
                }
            }

            if (_lastKnownPositions.IsCreated)
                _lastKnownPositions.Dispose();
        }
    }

    /// <summary>
    /// Struct for streaming spatial data from parallel gather job
    /// </summary>
    public struct SpatialInsertData
    {
        public Entity Entity;
        public float2 Position;
        public float Radius;
    }

    /// <summary>
    /// Parallel job to gather STATIC spatial data (resources, structures)
    /// Only runs when static entities spawn/despawn
    /// </summary>
    [BurstCompile]
    public struct GatherStaticSpatialDataJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<SpatialIndex> SpatialIndexTypeHandle;
        [ReadOnly] public ComponentTypeHandle<SpatialSettings> SpatialSettingsTypeHandle;
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> LocalToWorldTypeHandle;
        [ReadOnly] public EntityTypeHandle EntityTypeHandle;

        public NativeStream.Writer OutStream;

        public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var spatialIndices = chunk.GetNativeArray(ref SpatialIndexTypeHandle);
            var spatialSettings = chunk.GetNativeArray(ref SpatialSettingsTypeHandle);
            var transforms = chunk.GetNativeArray(ref LocalToWorldTypeHandle);
            var entities = chunk.GetNativeArray(EntityTypeHandle);

            OutStream.BeginForEachIndex(unfilteredChunkIndex);

            for (int i = 0; i < chunk.Count; i++)
            {
                var settings = spatialSettings[i];

                // Only gather STATIC entities (UpdateFrequency > 1 means static/infrequent updates)
                if (settings.UpdateFrequency <= 1)
                    continue;

                var spatialIndex = spatialIndices[i];
                if (!spatialIndex.IncludeInQueries)
                    continue;

                var entity = entities[i];
                var currentPosition = transforms[i].Position.xy;

                OutStream.Write(new SpatialInsertData
                {
                    Entity = entity,
                    Position = currentPosition,
                    Radius = spatialIndex.Radius
                });
            }

            OutStream.EndForEachIndex();
        }
    }

    /// <summary>
    /// Parallel job to gather DYNAMIC spatial data (combatants, players)
    /// Runs every frame with movement threshold optimization
    /// </summary>
    [BurstCompile]
    public struct GatherDynamicSpatialDataJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<SpatialIndex> SpatialIndexTypeHandle;
        [ReadOnly] public ComponentTypeHandle<SpatialSettings> SpatialSettingsTypeHandle;
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> LocalToWorldTypeHandle;
        [ReadOnly] public EntityTypeHandle EntityTypeHandle;
        [ReadOnly] public NativeHashMap<Entity, float2> LastKnownPositions;

        public NativeStream.Writer OutStream;
        public uint FrameCounter;

        public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var spatialIndices = chunk.GetNativeArray(ref SpatialIndexTypeHandle);
            var spatialSettings = chunk.GetNativeArray(ref SpatialSettingsTypeHandle);
            var transforms = chunk.GetNativeArray(ref LocalToWorldTypeHandle);
            var entities = chunk.GetNativeArray(EntityTypeHandle);

            OutStream.BeginForEachIndex(unfilteredChunkIndex);

            for (int i = 0; i < chunk.Count; i++)
            {
                var settings = spatialSettings[i];

                // Only gather DYNAMIC entities (UpdateFrequency == 1 means every frame)
                if (settings.UpdateFrequency != 1)
                    continue;

                var spatialIndex = spatialIndices[i];
                if (!spatialIndex.IncludeInQueries)
                    continue;

                var entity = entities[i];
                var currentPosition = transforms[i].Position.xy;

                // MOVEMENT THRESHOLD OPTIMIZATION: Only insert if entity moved
                bool shouldInsert = true;
                if (LastKnownPositions.TryGetValue(entity, out var lastPosition))
                {
                    var distanceMoved = math.distance(currentPosition, lastPosition);
                    shouldInsert = distanceMoved >= settings.MovementThreshold;
                }

                if (shouldInsert)
                {
                    OutStream.Write(new SpatialInsertData
                    {
                        Entity = entity,
                        Position = currentPosition,
                        Radius = spatialIndex.Radius
                    });
                }
            }

            OutStream.EndForEachIndex();
        }
    }

    /// <summary>
    /// LEGACY: Parallel job to gather ALL spatial data (kept for compatibility)
    /// Uses IJobChunk for maximum parallelism across entity chunks
    /// </summary>
    [BurstCompile]
    public struct GatherSpatialDataJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<SpatialIndex> SpatialIndexTypeHandle;
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> LocalToWorldTypeHandle;
        [ReadOnly] public EntityTypeHandle EntityTypeHandle;
        [ReadOnly] public NativeHashMap<Entity, float2> LastKnownPositions;

        public NativeStream.Writer OutStream;

        public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var spatialIndices = chunk.GetNativeArray(ref SpatialIndexTypeHandle);
            var transforms = chunk.GetNativeArray(ref LocalToWorldTypeHandle);
            var entities = chunk.GetNativeArray(EntityTypeHandle);

            OutStream.BeginForEachIndex(unfilteredChunkIndex);

            for (int i = 0; i < chunk.Count; i++)
            {
                var spatialIndex = spatialIndices[i];

                // Skip if entity doesn't want to be included in queries
                if (!spatialIndex.IncludeInQueries)
                    continue;

                var entity = entities[i];
                var currentPosition = transforms[i].Position.xy;

                // Always insert ALL entities since QuadTree is cleared each frame
                // This ensures static resources and dynamic combatants are both in the tree
                OutStream.Write(new SpatialInsertData
                {
                    Entity = entity,
                    Position = currentPosition,
                    Radius = spatialIndex.Radius
                });
            }

            OutStream.EndForEachIndex();
        }
    }

    /// <summary>
    /// STEP 2: Single-threaded job to insert gathered data into QuadTree (safe)
    /// Reads from NativeStream and inserts into QuadTree serially
    /// </summary>
    [BurstCompile]
    public struct InsertIntoQuadTreeJob : IJob
    {
        public QuadTree2D QuadTree;
        public NativeStream.Reader InStream;
        public NativeHashMap<Entity, float2> LastKnownPositions;
        public uint FrameCounter;

        public void Execute()
        {
            // Read all spatial data from stream and insert into QuadTree
            // QuadTree was cleared before this job, so we're rebuilding from scratch
            int streamCount = InStream.ForEachCount;

            for (int streamIndex = 0; streamIndex < streamCount; streamIndex++)
            {
                InStream.BeginForEachIndex(streamIndex);

                while (InStream.RemainingItemCount > 0)
                {
                    var data = InStream.Read<SpatialInsertData>();

                    // Insert entity into fresh QuadTree
                    QuadTree.Insert(data.Entity, data.Position, data.Radius);

                    // Update position tracking for movement threshold checks
                    LastKnownPositions[data.Entity] = data.Position;
                }

                InStream.EndForEachIndex();
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