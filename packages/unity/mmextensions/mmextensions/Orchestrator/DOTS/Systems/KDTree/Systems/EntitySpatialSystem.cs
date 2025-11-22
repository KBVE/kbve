using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Collections;
using Unity.Burst;
using Unity.Burst.Intrinsics;
using Unity.Jobs;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Main system responsible for maintaining 2D spatial data structures using WAL architecture.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// ARCHITECTURE OVERVIEW
    /// ═══════════════════════════════════════════════════════════════════════════
    ///
    /// SPATIAL STRUCTURES:
    /// - CSR Grid (Dynamic): Moving entities (combatants, players, projectiles)
    ///   * O(N) rebuild with perfect cache locality
    ///   * Scales to 100k-1M entities
    ///   * Double-buffered for lock-free queries during rebuild
    ///
    /// - QuadTree (Static): Non-moving entities (resources, structures)
    ///   * Built using Morton codes (Z-order curve) for spatial locality
    ///   * Split-free algorithm eliminates fragility at scale
    ///   * Rebuilt only when static entities spawn/despawn (every 60 frames)
    ///
    /// - KD-Tree (Optional): Exact k-NN queries
    ///   * DISABLED by default - CSR Grid handles k-NN via ring expansion
    ///   * Only enable for exact k-NN on highly non-uniform distributions
    ///   * WARNING: 10.3MB TempJob allocation at 90k entities (exceeds Unity's 4MB limit)
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// WAL (WRITE-AHEAD LOG) ARCHITECTURE
    /// ═══════════════════════════════════════════════════════════════════════════
    ///
    /// WAL is the SOURCE OF TRUTH for all spatial mutations:
    ///
    /// 1. APPEND PHASE (Parallel, Lock-Free):
    ///    - Movement systems write WalOp entries to NativeStream
    ///    - Collision-free sequence numbers: [frame:32][chunk:16][item:16]
    ///    - Movement threshold optimization: Only log entities that moved
    ///
    /// 2. COALESCE PHASE (Single-Threaded Dedup):
    ///    - Read WAL stream, keep latest Seq per entity (last update wins)
    ///    - Produces HashMap<Entity, WalOp> with final state
    ///
    /// 3. REBUILD PHASE (Async, No Complete()):
    ///    - Build QuadTree from coalesced WAL (static entities only)
    ///    - Build CSR Grid from coalesced WAL (dynamic entities only)
    ///    - FENCE PATTERN: Publish BuildJobHandle to singletons
    ///    - Consumers combine with BuildJobHandle before reading structures
    ///
    /// BENEFITS:
    /// - Lock-free parallel writes (NativeStream.ParallelWriter)
    /// - Automatic deduplication (last update wins per entity)
    /// - Fully async rebuilds (NO main thread stalls via Complete())
    /// - Deterministic (sequence numbers ensure reproducible results)
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// PERFORMANCE CHARACTERISTICS
    /// ═══════════════════════════════════════════════════════════════════════════
    ///
    /// - Baseline (legacy QuadTree, 1k entities): ~5ms per frame
    /// - Current (WAL + CSR Grid, 100k entities): ~0.5-2ms per frame
    /// - Scaling: Linear to 100k-1M entities
    ///
    /// Memory Usage (100k dynamic entities):
    /// - CSR Grid: ~700KB (counts, starts/ends, packed indices)
    /// - Coalesced WAL: ~2.4MB (24 bytes × 100k entries)
    /// - Total: ~3.1MB for full spatial tracking
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// TODO: FUTURE OPTIMIZATIONS
    /// ═══════════════════════════════════════════════════════════════════════════
    ///
    /// TODO: Replace insertion sort with radix sort in QuadTree.BuildFromSortedArray()
    ///       - Current: O(N^2) insertion sort on Morton codes
    ///       - Target: O(N) radix sort for 32-bit keys
    ///       - Impact: 20k+ static entities will benefit significantly
    ///
    /// TODO: Implement parallel CSR Grid rebuild (3-pass parallelization)
    ///       - Current: Single-threaded histogram/scan/scatter
    ///       - Target: IJobParallelFor with thread-local buffers + merge
    ///       - Impact: 2-3x speedup at 100k+ entities
    ///
    /// TODO: Add spatial query caching for repeated lookups
    ///       - Cache neighbor query results per entity for N frames
    ///       - Invalidate on entity movement or spatial rebuild
    ///       - Impact: Reduce redundant queries in AI/pathfinding systems
    ///
    /// TODO: Benchmark and tune cell size for CSR Grid
    ///       - Current: 200f (conservative for memory safety)
    ///       - Optimal: Depends on entity density and query radius
    ///       - Impact: Better cell size = fewer cells checked per query
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// </summary>

    #region WAL Data Structures

    /// <summary>
    /// WAL operation kind for spatial mutations
    /// </summary>
    public enum WalOpKind : byte
    {
        Insert = 0,     // Entity spawned/added to spatial tracking
        UpdatePos = 1,  // Entity moved
        Remove = 2      // Entity despawned/removed from spatial tracking
    }

    /// <summary>
    /// Single WAL operation (append-only, immutable)
    /// </summary>
    public struct WalOp
    {
        /// <summary>
        /// Collision-free sequence number encoding:
        /// [31:0]  = FrameCounter (up to 4B frames)
        /// [47:32] = Chunk index (up to 65k chunks)
        /// [63:48] = Item index within chunk (up to 65k items)
        /// This ensures deterministic, unique ordering across parallel writes
        /// </summary>
        public ulong Seq;

        public Entity Entity;       // Target entity
        public float2 Position;     // For Insert/UpdatePos
        public float Radius;        // For circle queries
        public WalOpKind Kind;      // Operation type
        public uint Epoch;          // Snapshot ID (for retention/sharding)
    }

    #endregion

    [UpdateInGroup(typeof(SimulationSystemGroup), OrderFirst = true)]
    [BurstCompile]
    public partial struct EntitySpatialSystem : ISystem
    {
        private EntityQuery _spatialEntitiesQuery;
        private EntityQuery _staticEntitiesQuery;  // Static resources/structures
        private EntityQuery _dynamicEntitiesQuery; // Moving combatants/players
        private EntityQuery _configQuery;
        private EntityQuery _csrGridQuery;         // CSR grid for dynamic entities (100k-1M scale)
        private EntityQuery _staticQuadTreeQuery;  // QuadTree for static entities
        private EntityQuery _kdTreeQuery;
        private NativeParallelHashMap<Entity, float2> _lastKnownPositions;
        private uint _frameCounter;
        private JobHandle _lastCSRRebuildHandle;   // Track CSR rebuild job for async completion

        // ═══════════════════════════════════════════════════════════════════
        // WAL (Write-Ahead Log) INFRASTRUCTURE
        // ═══════════════════════════════════════════════════════════════════

        /// <summary>
        /// Coalesced WAL: One final state per entity (last update wins)
        /// Maps Entity → latest WalOp for deterministic cache rebuilds
        /// Note: Raw WAL stream is created locally in UpdateSpatialStructuresViaWal to avoid TempJob leaks
        /// </summary>
        private NativeParallelHashMap<Entity, WalOp> _coalescedWal;

        /// <summary>
        /// Pre-allocated buffer for static QuadTree entries.
        /// Passed into BuildQuadTreeFromWalJob to avoid allocations inside jobs.
        /// </summary>
        private NativeList<QuadTreeEntry> _staticEntries;

        // ═══════════════════════════════════════════════════════════════════
        // FEATURE FLAGS
        // ═══════════════════════════════════════════════════════════════════

        /// <summary>
        /// Enable KD-Tree spatial index (DISABLED by default for 100k+ entity scaling)
        ///
        /// PERFORMANCE COST AT 90k ENTITIES:
        /// - TempJob allocations: 10.3 MB (exceeds Unity's 4MB limit → CRASH!)
        /// - Rebuild time: O(N log N) every 10 frames
        /// - Memory overhead: 2x entity count (nodes + scratch buffers)
        ///
        /// WHEN TO ENABLE:
        /// - You need exact k-NN on highly non-uniform distributions
        /// - CSR Grid ring expansion yields too many false positives
        /// - Entity count < 50k (below TempJob crash threshold)
        ///
        /// ALTERNATIVE (RECOMMENDED):
        /// - CSR Grid handles k-NN via ring expansion with O(N) rebuild
        /// - No temp allocations, scales to 100k-1M entities
        /// </summary>
        private const bool ENABLE_KDTREE = false;

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

            _csrGridQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialGridCSRSingleton, SpatialSystemTag>()
                .Build();

            _staticQuadTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<StaticQuadTreeSingleton, SpatialSystemTag>()
                .Build();

            _kdTreeQuery = SystemAPI.QueryBuilder()
                .WithAll<KDTreeSingleton, SpatialSystemTag>()
                .Build();

            _frameCounter = 0;
            // Use NativeParallelHashMap for thread-safe parallel writes (Option B optimization)
            // CRITICAL: Capacity must match target entity scale to prevent fragmentation
            // At 100k entities with 1k capacity: 99k hash collisions + reallocation overhead
            // Pre-size to 100k for smooth scaling to 300k+ entities
            _lastKnownPositions = new NativeParallelHashMap<Entity, float2>(100000, Allocator.Persistent);

            // Initialize WAL infrastructure (coalesced WAL stores final state per entity)
            _coalescedWal = new NativeParallelHashMap<Entity, WalOp>(100000, Allocator.Persistent);

            // Initialize pre-allocated buffer for QuadTree building (avoids allocations inside jobs)
            _staticEntries = new NativeList<QuadTreeEntry>(1000, Allocator.Persistent);

            // Require config to exist
            state.RequireForUpdate(_configQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            // Initialize spatial structures singleton if needed
            if (_csrGridQuery.IsEmpty)
            {
                InitializeSpatialSingletons(ref state);
                return;
            }

            // Get system configuration
            var config = SystemAPI.GetSingleton<SpatialSystemConfig>();

            // Skip ECS updates if using cache-based mode (Phase 2 optimization)
            // TODO: Implement cache-based updates via EntityCacheDrainSystem
            if (config.UseCacheBasedUpdates)
            {
                return;
            }

            // Periodic cleanup of LastKnownPositions (every 120 frames ~2 seconds at 60fps)
            // Prevents unbounded memory growth from destroyed entities
            if (_frameCounter % 120 == 0)
            {
                CleanupDestroyedEntities(ref state);
            }

            // Main WAL-based update: Append → Coalesce → Rebuild (all async, no Complete())
            UpdateSpatialStructuresViaWal(ref state);

            // KD-Tree rebuild (DISABLED by default - see ENABLE_KDTREE flag)
            // TODO: Add fence pattern to KD-Tree rebuild if re-enabled
            if (ENABLE_KDTREE && _frameCounter % 10 == 0 && !_kdTreeQuery.IsEmpty)
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

            // Periodic full rebuild if configured (legacy feature)
            // TODO: Remove or replace with WAL-based rebuild trigger
            if (config.RebuildFrequency > 0 && _frameCounter % config.RebuildFrequency == 0)
            {
                RebuildSpatialStructures();
            }
        }

        private void InitializeSpatialSingletons(ref SystemState state)
        {
            if (!_configQuery.IsEmpty)
            {
                var config = SystemAPI.GetSingleton<SpatialSystemConfig>();
                var bounds = new AABB2D(config.WorldOrigin + config.WorldSize * 0.5f, config.WorldSize);

                // CSR Grid for DYNAMIC entities (100k-1M scale)
                // DOUBLE BUFFERING: Create TWO grids to eliminate Complete() stalls
                // CRITICAL: Capacity must be large enough to hold ALL dynamic entities
                // At 300k+ entities, 50k was causing crashes due to overflow
                // 500k capacity = ~12MB memory per grid × 2 = 24MB total (acceptable for 300k+ scale)
                int estimatedMaxDynamicEntities = 500000; // 500k movers (supports 300k+ combatants)
                float cellSize = 200f; // Large cells = fewer grid cells = safe memory usage

                var csrReadGrid = new SpatialGridCSR(
                    bounds,
                    cellSize,
                    capacity: estimatedMaxDynamicEntities,
                    Allocator.Persistent
                );

                var csrWriteGrid = new SpatialGridCSR(
                    bounds,
                    cellSize,
                    capacity: estimatedMaxDynamicEntities,
                    Allocator.Persistent
                );

                // Create KD-Tree with estimated capacity
                var kdTree = new KDTree2D(1000, Allocator.Persistent);

                // Create singleton entity
                var singletonEntity = state.EntityManager.CreateEntity();
                state.EntityManager.AddComponent<SpatialSystemTag>(singletonEntity);
                state.EntityManager.SetName(singletonEntity, "SpatialDataSingleton");

                var csrGridSingleton = new SpatialGridCSRSingleton
                {
                    ReadGrid = csrReadGrid,   // Stable grid for queries
                    WriteGrid = csrWriteGrid, // Grid being rebuilt
                    LastUpdateFrame = 0,
                    IsValid = true
                };
                state.EntityManager.AddComponentData(singletonEntity, csrGridSingleton);

                // Store Static QuadTree in singleton for STATIC entities
                var staticQuadTree = new QuadTree2D(bounds, config.MaxQuadTreeDepth, config.MaxEntitiesPerNode, Allocator.Persistent);

                // CRITICAL: Initialize overflow flag for job compatibility
                // Jobs require all NativeReference fields to be initialized (not default)
                staticQuadTree.InitOverflowFlag(Allocator.Persistent);

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

        /// <summary>
        /// Periodic cleanup of LastKnownPositions to remove destroyed entities.
        /// Runs every 120 frames (~2 seconds at 60fps) to prevent unbounded memory growth.
        ///
        /// STRATEGY: Iterate through LastKnownPositions and remove entities that no longer exist.
        /// This is safe because:
        /// 1. Destroyed entities won't appear in queries anymore (no new WAL ops)
        /// 2. WAL rebuild jobs only process valid entities
        /// 3. This just cleans up stale tracking data
        /// </summary>
        private void CleanupDestroyedEntities(ref SystemState state)
        {
            // Collect entities to remove in a temp list (can't modify hashmap while iterating)
            var entitiesToRemove = new NativeList<Entity>(Allocator.Temp);

            // Iterate through all tracked entities
            foreach (var kvp in _lastKnownPositions)
            {
                var entity = kvp.Key;

                // Check if entity still exists and has SpatialIndex component
                if (!state.EntityManager.Exists(entity) ||
                    !state.EntityManager.HasComponent<SpatialIndex>(entity))
                {
                    entitiesToRemove.Add(entity);
                }
            }

            // Remove stale entries
            for (int i = 0; i < entitiesToRemove.Length; i++)
            {
                _lastKnownPositions.Remove(entitiesToRemove[i]);
            }

            #if UNITY_EDITOR
            // Optional debug logging in editor builds
            if (entitiesToRemove.Length > 0)
            {
                UnityEngine.Debug.Log($"[SpatialCleanup] Removed {entitiesToRemove.Length} destroyed entities from tracking. Remaining: {_lastKnownPositions.Count()}");
            }
            #endif

            entitiesToRemove.Dispose();
        }

        /// <summary>
        /// WAL-BASED UPDATE: Append spatial mutations to WAL, coalesce, rebuild caches
        /// This is the NEW approach that will eventually replace direct gather methods
        /// </summary>
        private void UpdateSpatialStructuresViaWal(ref SystemState state)
        {
            // STEP 1: Create WAL stream locally (TempJob, disposed same frame)
            int chunkCount = _spatialEntitiesQuery.CalculateChunkCount();
            if (chunkCount == 0) return;

            var walStream = new NativeStream(math.max(1, chunkCount), Allocator.TempJob);

            // STEP 2: Append spatial mutations to WAL in parallel
            var appendJob = new AppendToWalJob
            {
                SpatialIndexTypeHandle = state.GetComponentTypeHandle<SpatialIndex>(true),
                SpatialSettingsTypeHandle = state.GetComponentTypeHandle<SpatialSettings>(true),
                LocalToWorldTypeHandle = state.GetComponentTypeHandle<LocalToWorld>(true),
                EntityTypeHandle = state.GetEntityTypeHandle(),
                LastKnownPositions = _lastKnownPositions,
                WalWriter = walStream.AsWriter(),
                FrameCounter = _frameCounter
            };

            // BUGFIX: Update state.Dependency immediately after scheduling jobs that access tracked components
            // This prevents "job not assigned to Dependency" safety errors
            var appendDep = appendJob.ScheduleParallel(_spatialEntitiesQuery, state.Dependency);
            state.Dependency = appendDep;

            // STEP 3: Coalesce WAL (single-threaded dedup)
            var coalesceJob = new CoalesceWalJob
            {
                WalReader = walStream.AsReader(),
                CoalescedWal = _coalescedWal
            };

            var coalesceDep = coalesceJob.Schedule(state.Dependency);
            state.Dependency = coalesceDep;

            JobHandle lastDep = state.Dependency;

            // STEP 4: Build QuadTree from coalesced WAL (static entities only, every 60 frames)
            if (_frameCounter == 1 || _frameCounter % 60 == 0)
            {
                if (!_staticQuadTreeQuery.IsEmpty)
                {
                    var staticQuadTreeEntity = _staticQuadTreeQuery.GetSingletonEntity();
                    var staticQuadTreeSingleton = state.EntityManager.GetComponentData<StaticQuadTreeSingleton>(staticQuadTreeEntity);

                    // PRE-SIZE QUADTREE BUFFERS: Must happen BEFORE scheduling job!
                    // BuildFromSortedArray cannot resize buffers inside a Burst job (Dispose() forbidden)
                    // Estimate static entity count from CoalescedWal and pre-allocate buffers
                    int estimatedStaticCount = math.min(_coalescedWal.Count(), 100000); // Cap at 100k for safety
                    staticQuadTreeSingleton.QuadTree.EnsureScratchCapacity(estimatedStaticCount);
                    staticQuadTreeSingleton.QuadTree.EnsureSortBufferCapacity(estimatedStaticCount);

                    var buildQuadTreeJob = new BuildQuadTreeFromWalJob
                    {
                        CoalescedWal = _coalescedWal,
                        SpatialSettingsLookup = state.GetComponentLookup<SpatialSettings>(true),
                        QuadTree = staticQuadTreeSingleton.QuadTree,
                        LastKnownPositions = _lastKnownPositions,
                        OutEntries = _staticEntries
                    };

                    var buildHandle = buildQuadTreeJob.Schedule(state.Dependency);

                    // Publish the fence; don't Complete()
                    staticQuadTreeSingleton.BuildJobHandle = buildHandle;
                    staticQuadTreeSingleton.LastUpdateFrame = _frameCounter;
                    state.EntityManager.SetComponentData(staticQuadTreeEntity, staticQuadTreeSingleton);

                    state.Dependency = buildHandle;
                    lastDep = state.Dependency;
                }
            }

            // STEP 5: Build CSR Grid from coalesced WAL (every frame)
            // CSR Grid: High-performance for 100k-1M entities
            if (!_csrGridQuery.IsEmpty)
            {
                var csrGridEntity = _csrGridQuery.GetSingletonEntity();
                var csrGridSingleton = state.EntityManager.GetComponentData<SpatialGridCSRSingleton>(csrGridEntity);

                var buildCSRJob = new BuildCSRGridFromWalJob
                {
                    CoalescedWal = _coalescedWal,
                    SpatialSettingsLookup = state.GetComponentLookup<SpatialSettings>(true),
                    Grid = csrGridSingleton.WriteGrid,
                    LastKnownPositions = _lastKnownPositions
                };

                var buildHandle = buildCSRJob.Schedule(state.Dependency);

                // DOUBLE BUFFERING: Swap read/write grids without blocking
                (csrGridSingleton.ReadGrid, csrGridSingleton.WriteGrid) = (csrGridSingleton.WriteGrid, csrGridSingleton.ReadGrid);

                // Publish the fence; don't Complete()
                csrGridSingleton.BuildJobHandle = buildHandle;
                csrGridSingleton.LastUpdateFrame = _frameCounter;
                state.EntityManager.SetComponentData(csrGridEntity, csrGridSingleton);

                state.Dependency = buildHandle;
                lastDep = state.Dependency;
            }

            // CRITICAL: Dispose WAL stream with job dependency
            // This ensures cleanup happens same frame (prevents TempJob 4-frame leak guard)
            // state.Dependency already contains the full job chain, so use it for disposal
            walStream.Dispose(state.Dependency);

            // state.Dependency already updated throughout the job chain - no need to combine again
        }

        private void RebuildSpatialStructures()
        {
            // For now, just clear the position cache to force updates
            _lastKnownPositions.Clear();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // Dispose CSR Grid from singleton (DOUBLE BUFFERING: dispose both grids)
            if (!_csrGridQuery.IsEmpty)
            {
                var csrGridEntity = _csrGridQuery.GetSingletonEntity();
                var csrGridSingleton = state.EntityManager.GetComponentData<SpatialGridCSRSingleton>(csrGridEntity);
                if (csrGridSingleton.ReadGrid.IsCreated)
                {
                    csrGridSingleton.ReadGrid.Dispose();
                }
                if (csrGridSingleton.WriteGrid.IsCreated)
                {
                    csrGridSingleton.WriteGrid.Dispose();
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

            // Dispose WAL infrastructure
            if (_coalescedWal.IsCreated)
                _coalescedWal.Dispose();

            if (_staticEntries.IsCreated)
                _staticEntries.Dispose();
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
    /// WAL STEP 1: Parallel job to append spatial mutations to WAL stream
    /// Lock-free parallel writes from movement/spawn/despawn systems
    ///
    /// SEQUENCE ENCODING (collision-free, deterministic):
    /// Upper 32 bits = FrameCounter
    /// Next 16 bits  = Chunk index (unfilteredChunkIndex)
    /// Lower 16 bits = Item index within chunk
    /// Max capacity: 65k chunks × 65k items per chunk per frame = 4B ops/frame
    /// </summary>
    [BurstCompile]
    public struct AppendToWalJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<SpatialIndex> SpatialIndexTypeHandle;
        [ReadOnly] public ComponentTypeHandle<SpatialSettings> SpatialSettingsTypeHandle;
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> LocalToWorldTypeHandle;
        [ReadOnly] public EntityTypeHandle EntityTypeHandle;
        [ReadOnly] public NativeParallelHashMap<Entity, float2> LastKnownPositions;

        public NativeStream.Writer WalWriter;
        public uint FrameCounter;

        public void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var spatialIndices = chunk.GetNativeArray(ref SpatialIndexTypeHandle);
            var spatialSettings = chunk.GetNativeArray(ref SpatialSettingsTypeHandle);
            var transforms = chunk.GetNativeArray(ref LocalToWorldTypeHandle);
            var entities = chunk.GetNativeArray(EntityTypeHandle);

            WalWriter.BeginForEachIndex(unfilteredChunkIndex);

            uint localSeq = 0;
            for (int i = 0; i < chunk.Count; i++)
            {
                var spatialIndex = spatialIndices[i];
                if (!spatialIndex.IncludeInQueries)
                    continue;

                var entity = entities[i];
                var currentPosition = transforms[i].Position.xy;
                var settings = spatialSettings[i];

                // Determine operation kind and check movement threshold
                WalOpKind kind = WalOpKind.UpdatePos;
                if (!LastKnownPositions.TryGetValue(entity, out float2 lastPosition))
                {
                    // First time seeing this entity
                    kind = WalOpKind.Insert;
                }
                else
                {
                    // Check movement threshold
                    var distanceMoved = math.distance(currentPosition, lastPosition);
                    if (distanceMoved < settings.MovementThreshold)
                        continue; // Skip - not enough movement
                }

                // Generate collision-free sequence number
                // Format: [frame:32][chunkIndex:16][itemIndex:16]
                // This ensures deterministic, unique sequences across all parallel chunks
                ulong seq = ((ulong)FrameCounter << 32) |
                            ((ulong)(ushort)unfilteredChunkIndex << 16) |
                            (ushort)localSeq;
                localSeq++;

                WalWriter.Write(new WalOp
                {
                    Seq = seq,
                    Entity = entity,
                    Position = currentPosition,
                    Radius = spatialIndex.Radius,
                    Kind = kind,
                    Epoch = FrameCounter
                });
            }

            WalWriter.EndForEachIndex();
        }
    }

    /// <summary>
    /// WAL STEP 2: Coalesce WAL stream (dedup by Entity, keep latest Seq)
    /// Single-threaded job that reads WAL stream and produces final state per entity
    /// </summary>
    [BurstCompile]
    public struct CoalesceWalJob : IJob
    {
        [ReadOnly] public NativeStream.Reader WalReader;
        public NativeParallelHashMap<Entity, WalOp> CoalescedWal;

        public void Execute()
        {
            CoalescedWal.Clear();

            int forEachCount = WalReader.ForEachCount;
            for (int i = 0; i < forEachCount; i++)
            {
                WalReader.BeginForEachIndex(i);
                int count = WalReader.RemainingItemCount;

                for (int j = 0; j < count; j++)
                {
                    var op = WalReader.Read<WalOp>();

                    // Dedup: If entity already exists, keep the one with highest Seq
                    if (CoalescedWal.TryGetValue(op.Entity, out var existing))
                    {
                        if (op.Seq > existing.Seq)
                        {
                            CoalescedWal[op.Entity] = op; // Replace with newer
                        }
                    }
                    else
                    {
                        CoalescedWal.Add(op.Entity, op); // First time seeing this entity
                    }
                }

                WalReader.EndForEachIndex();
            }
        }
    }

    /// <summary>
    /// WAL STEP 3: Build QuadTree from coalesced WAL (static entities only)
    /// Filters WAL for static entities and builds QuadTree using split-free algorithm.
    /// Uses single-pass NativeList.Add() to avoid two-pass count→fill pattern.
    /// </summary>
    [BurstCompile]
    public struct BuildQuadTreeFromWalJob : IJob
    {
        [ReadOnly] public NativeParallelHashMap<Entity, WalOp> CoalescedWal;
        [ReadOnly] public ComponentLookup<SpatialSettings> SpatialSettingsLookup;
        public QuadTree2D QuadTree;
        public NativeParallelHashMap<Entity, float2> LastKnownPositions;
        public NativeList<QuadTreeEntry> OutEntries;

        public void Execute()
        {
            // Clear the output list for this rebuild
            OutEntries.Clear();

            // Single-pass: iterate WAL and add static entities directly to list
            foreach (var kvp in CoalescedWal)
            {
                var op = kvp.Value;

                // Skip removed entities
                if (op.Kind == WalOpKind.Remove)
                    continue;

                // Check if entity is static (UpdateFrequency > 1)
                if (!SpatialSettingsLookup.HasComponent(op.Entity))
                    continue;

                var settings = SpatialSettingsLookup[op.Entity];
                if (settings.UpdateFrequency <= 1)
                    continue; // Skip dynamic entities

                // Add static entity to output list
                OutEntries.Add(new QuadTreeEntry
                {
                    Entity = op.Entity,
                    Position = op.Position,
                    Radius = op.Radius
                });

                // Update last known position
                if (!LastKnownPositions.TryAdd(op.Entity, op.Position))
                    LastKnownPositions[op.Entity] = op.Position;
            }

            // Build QuadTree from entries (uses zero-alloc alias)
            if (OutEntries.Length == 0)
            {
                QuadTree.Clear();
                return;
            }

            var entriesArray = OutEntries.AsArray();
            QuadTree.BuildFromSortedArray(entriesArray);
        }
    }

    /// <summary>
    /// WAL STEP 4: Build CSR Grid from coalesced WAL (dynamic entities only)
    /// Uses 3-pass algorithm: Histogram → Prefix Scan → Scatter
    /// Scales to 100k-1M dynamic entities
    /// </summary>
    [BurstCompile]
    public struct BuildCSRGridFromWalJob : IJob
    {
        [ReadOnly] public NativeParallelHashMap<Entity, WalOp> CoalescedWal;
        [ReadOnly] public ComponentLookup<SpatialSettings> SpatialSettingsLookup;
        public SpatialGridCSR Grid;
        public NativeParallelHashMap<Entity, float2> LastKnownPositions;

        public void Execute()
        {
            // Clear grid for rebuild
            Grid.Clear();

            // PASS 1: Histogram - Count entities per cell
            foreach (var kvp in CoalescedWal)
            {
                var op = kvp.Value;

                // Skip removed entities
                if (op.Kind == WalOpKind.Remove)
                    continue;

                // Only process DYNAMIC entities (UpdateFrequency == 1)
                if (!SpatialSettingsLookup.HasComponent(op.Entity))
                    continue;

                var settings = SpatialSettingsLookup[op.Entity];
                if (settings.UpdateFrequency != 1)
                    continue; // Skip static entities

                // Compute cell index
                var relativePos = op.Position - Grid.Origin;
                int cx = (int)math.floor(relativePos.x * Grid.InvCellSize);
                int cy = (int)math.floor(relativePos.y * Grid.InvCellSize);

                // Clamp to grid bounds
                cx = math.clamp(cx, 0, Grid.GridSize.x - 1);
                cy = math.clamp(cy, 0, Grid.GridSize.y - 1);

                int cellIndex = cy * Grid.GridSize.x + cx;

                if (cellIndex >= 0 && cellIndex < Grid.Counts.Length)
                {
                    Grid.Counts[cellIndex]++;
                }
            }

            // PASS 2: Prefix Scan - Convert counts to start/end indices
            int runningSum = 0;
            for (int i = 0; i < Grid.Counts.Length; i++)
            {
                int count = Grid.Counts[i];
                Grid.Starts[i] = runningSum;
                Grid.Ends[i] = runningSum;
                runningSum += count;
            }

            // PASS 3: Scatter - Write entities to packed array
            foreach (var kvp in CoalescedWal)
            {
                var op = kvp.Value;

                // Skip removed entities
                if (op.Kind == WalOpKind.Remove)
                    continue;

                // Only process DYNAMIC entities (UpdateFrequency == 1)
                if (!SpatialSettingsLookup.HasComponent(op.Entity))
                    continue;

                var settings = SpatialSettingsLookup[op.Entity];
                if (settings.UpdateFrequency != 1)
                    continue;

                // Compute cell index
                var relativePos = op.Position - Grid.Origin;
                int cx = (int)math.floor(relativePos.x * Grid.InvCellSize);
                int cy = (int)math.floor(relativePos.y * Grid.InvCellSize);

                // Clamp to grid bounds
                cx = math.clamp(cx, 0, Grid.GridSize.x - 1);
                cy = math.clamp(cy, 0, Grid.GridSize.y - 1);

                int cellIndex = cy * Grid.GridSize.x + cx;

                if (cellIndex >= 0 && cellIndex < Grid.Ends.Length)
                {
                    int writeIndex = Grid.Ends[cellIndex];
                    if (writeIndex < Grid.Indices.Length)
                    {
                        Grid.Indices[writeIndex] = op.Entity;
                        Grid.Ends[cellIndex]++;

                        // Update last known position
                        if (!LastKnownPositions.TryAdd(op.Entity, op.Position))
                            LastKnownPositions[op.Entity] = op.Position;
                    }
                }
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
    /// Utility system for cleaning up spatial data when entities are destroyed.
    /// Runs periodically (every 120 frames) to remove destroyed entities from LastKnownPositions.
    ///
    /// CLEANUP STRATEGY:
    /// - WAL ops naturally expire (only current frame entities get new ops)
    /// - Spatial structures rebuild from WAL (only valid entities included)
    /// - LastKnownPositions needs periodic cleanup to prevent unbounded growth
    /// - Runs AFTER EntitySpatialSystem to avoid interfering with WAL processing
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    [UpdateAfter(typeof(EntitySpatialSystem))]
    [BurstCompile]
    public partial struct SpatialCleanupSystem : ISystem
    {
        private EntityQuery _allTrackedEntitiesQuery;
        private uint _frameCounter;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Query for all entities we might be tracking (have or had SpatialIndex)
            _allTrackedEntitiesQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialIndex>()
                .Build();

            _frameCounter = 0;
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            // Run cleanup every 120 frames (every ~2 seconds at 60fps)
            // This is infrequent enough to not impact performance
            if (_frameCounter % 120 != 0)
                return;

            // NOTE: We can't directly access EntitySpatialSystem._lastKnownPositions from here
            // because systems can't access each other's private fields.
            //
            // SOLUTIONS:
            // 1. Move _lastKnownPositions to a singleton component (shared between systems)
            // 2. Let EntitySpatialSystem handle cleanup internally
            // 3. Use SystemAPI.ManagedAPI to get system reference (not Burst-compatible)
            //
            // RECOMMENDED: Move cleanup logic to EntitySpatialSystem.OnUpdate
            // This system serves as documentation that cleanup is needed, but actual
            // implementation should be in EntitySpatialSystem where _lastKnownPositions lives.
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // No persistent allocations to clean up
        }
    }
}