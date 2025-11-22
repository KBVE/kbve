using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Mathematics;
using Unity.Entities;
using Unity.Transforms;
using Unity.Burst.Intrinsics;
using Unity.Jobs;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// CSR (Compressed Sparse Row) Spatial Grid - Scales to 100k-1M entities
    ///
    /// PERFORMANCE CHARACTERISTICS:
    /// - O(N) rebuild time with excellent cache locality
    /// - O(1) cell lookup (no hashing, no probing)
    /// - Minimal atomic contention (chunked histogram with flush)
    /// - Double-buffered to eliminate stalls
    ///
    /// HOW IT WORKS:
    /// 1. Histogram Pass: Count entities per cell (thread-local chunked to reduce atomics)
    /// 2. Prefix Scan: Convert counts to start indices (exclusive scan)
    /// 3. Scatter Pass: Write entities to packed array using atomics on cursors
    ///
    /// MEMORY LAYOUT (CSR):
    /// - Starts[cell] = index where cell's entity list begins
    /// - Ends[cell] = index where cell's entity list ends
    /// - Indices[Starts[cell]..Ends[cell]] = contiguous packed entities for that cell
    ///
    /// QUERY:
    /// - Neighbor lookup = 9 range iterations (no hashing!)
    /// - Cache-friendly sequential reads
    /// </summary>
    [BurstCompile]
    public struct SpatialGridCSR : IComponentData
    {
        // CSR arrays
        public NativeArray<int> Counts;     // [numCells] - entities per cell (working buffer)
        public NativeArray<int> Starts;     // [numCells] - start index for each cell
        public NativeArray<int> Ends;       // [numCells] - end index (cursor during scatter)
        public NativeArray<Entity> Indices; // [capacity] - packed entity array

        // Grid parameters
        public int2 GridSize;     // cells in X and Y
        public float2 Origin;     // world-space origin (min corner)
        public float CellSize;    // size of each cell
        public float InvCellSize; // 1.0f / CellSize (for fast math)
        public AABB2D Bounds;     // world bounds

        // Metadata
        public int Capacity;      // max entities (size of Indices array)
        public int NumCells;      // total cells (GridSize.x * GridSize.y)
        public bool IsCreated;

        /// <summary>
        /// Create a new CSR spatial grid
        /// </summary>
        public SpatialGridCSR(AABB2D bounds, float cellSize, int capacity, Allocator allocator)
        {
            Bounds = bounds;
            CellSize = cellSize;
            InvCellSize = 1.0f / cellSize;
            Origin = bounds.Min;

            // Calculate grid dimensions
            float2 size = bounds.Max - bounds.Min;
            GridSize = new int2(
                (int)math.ceil(size.x / cellSize),
                (int)math.ceil(size.y / cellSize)
            );

            NumCells = GridSize.x * GridSize.y;
            Capacity = capacity;

            // Allocate CSR arrays
            Counts = new NativeArray<int>(NumCells, allocator, NativeArrayOptions.ClearMemory);
            Starts = new NativeArray<int>(NumCells, allocator, NativeArrayOptions.ClearMemory);
            Ends = new NativeArray<int>(NumCells, allocator, NativeArrayOptions.ClearMemory);
            Indices = new NativeArray<Entity>(capacity, allocator, NativeArrayOptions.UninitializedMemory);

            IsCreated = true;
        }

        /// <summary>
        /// Clear counts for next rebuild (keeps allocations)
        /// </summary>
        [BurstCompile]
        public unsafe void Clear()
        {
            // Only clear counts - other arrays reused during build
            UnsafeUtility.MemClear(Counts.GetUnsafePtr(), Counts.Length * sizeof(int));
        }

        /// <summary>
        /// Get cell index from world position (fast, branchless)
        /// </summary>
        [BurstCompile]
        public int GetCellIndex(in float2 worldPos)
        {
            float2 local = worldPos - Origin;
            int2 cell = new int2(
                (int)math.floor(local.x * InvCellSize),
                (int)math.floor(local.y * InvCellSize)
            );

            // Branchless bounds check using unsigned cast
            if ((uint)cell.x >= (uint)GridSize.x || (uint)cell.y >= (uint)GridSize.y)
                return -1;

            return cell.y * GridSize.x + cell.x;
        }

        /// <summary>
        /// Query entities within radius (checks neighboring cells)
        /// CRITICAL: Pre-allocate results with sufficient capacity to prevent resizing!
        /// </summary>
        [BurstCompile]
        public void QueryRadius(in float2 center, float radius, NativeList<Entity> results)
        {
            // Calculate cell range to check
            float2 min = center - new float2(radius);
            float2 max = center + new float2(radius);

            int2 minCell = new int2(
                math.max(0, (int)math.floor((min.x - Origin.x) * InvCellSize)),
                math.max(0, (int)math.floor((min.y - Origin.y) * InvCellSize))
            );

            int2 maxCell = new int2(
                math.min(GridSize.x - 1, (int)math.floor((max.x - Origin.x) * InvCellSize)),
                math.min(GridSize.y - 1, (int)math.floor((max.y - Origin.y) * InvCellSize))
            );

            float radiusSq = radius * radius;

            // Get current capacity to prevent resize during Add()
            int maxCapacity = results.Capacity;
            int currentLength = results.Length;

            // Iterate cells in range (typically 4-9 cells)
            for (int cy = minCell.y; cy <= maxCell.y; cy++)
            {
                for (int cx = minCell.x; cx <= maxCell.x; cx++)
                {
                    int cellIdx = cy * GridSize.x + cx;
                    int start = Starts[cellIdx];
                    int end = Ends[cellIdx];

                    // CSR lookup: sequential range iteration (cache-friendly!)
                    for (int i = start; i < end; i++)
                    {
                        // CRITICAL: Check capacity before adding to prevent resize
                        // If capacity exceeded, stop adding (caller should increase pre-allocation)
                        if (currentLength >= maxCapacity)
                        {
                            // Capacity exceeded - return what we have
                            // This prevents crashes but may result in incomplete queries
                            return;
                        }

                        results.Add(Indices[i]);
                        currentLength++;
                        // Note: Actual distance check would require position data
                        // This is handled in the query system with component lookups
                    }
                }
            }
        }

        /// <summary>
        /// Dispose all native arrays
        /// </summary>
        public void Dispose()
        {
            if (IsCreated)
            {
                Counts.Dispose();
                Starts.Dispose();
                Ends.Dispose();
                Indices.Dispose();
                IsCreated = false;
            }
        }
    }

    /// <summary>
    /// Singleton component holding the CSR grid with DOUBLE BUFFERING
    ///
    /// DOUBLE BUFFERING STRATEGY:
    /// - ReadGrid: Used by query systems (attack, pathfinding) - guaranteed stable
    /// - WriteGrid: Being rebuilt by EntitySpatialSystem in parallel
    /// - Swap at end of frame: WriteGrid becomes ReadGrid, ReadGrid becomes WriteGrid
    ///
    /// FENCE PATTERN:
    /// - BuildJobHandle: Consumers MUST depend on this before reading ReadGrid
    /// - This eliminates implicit dependencies and prevents race conditions
    ///
    /// BENEFITS:
    /// - No Complete() calls needed - eliminates main thread stalls
    /// - Queries can read from stable grid while rebuild happens in parallel
    /// - Explicit dependency chain prevents deadlocks
    /// - 1-frame latency is acceptable for spatial queries (entities don't teleport)
    /// </summary>
    public struct SpatialGridCSRSingleton : IComponentData
    {
        public SpatialGridCSR ReadGrid;  // Stable grid for queries
        public SpatialGridCSR WriteGrid; // Grid being rebuilt

        // FENCE: Published job handle for dependency tracking
        // Consumers must combine this with their state.Dependency before reading ReadGrid
        public JobHandle BuildJobHandle;

        public uint LastUpdateFrame;
        public bool IsValid;
    }

    /// <summary>
    /// PASS 1: Histogram - Count entities per cell with chunked local counts to reduce atomics
    /// </summary>
    [BurstCompile(FloatMode = FloatMode.Fast, FloatPrecision = FloatPrecision.Low)]
    public struct HistogramJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> TransformHandle;
        [ReadOnly] public ComponentTypeHandle<SpatialSettings> SettingsHandle;

        [NativeDisableParallelForRestriction]
        public NativeArray<int> GlobalCounts; // [numCells]

        public float2 Origin;
        public float InvCellSize;
        public int2 GridSize;

        public unsafe void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var transforms = chunk.GetNativeArray(ref TransformHandle);
            var settings = chunk.GetNativeArray(ref SettingsHandle);

            // Thread-local counts to minimize atomics
            int numCells = GridSize.x * GridSize.y;
            var localCounts = new NativeArray<int>(numCells, Allocator.Temp, NativeArrayOptions.ClearMemory);

            for (int i = 0; i < chunk.Count; i++)
            {
                // Skip static entities
                if (settings[i].UpdateFrequency != 1)
                    continue;

                float2 pos = transforms[i].Position.xy;
                float2 local = pos - Origin;
                int cx = (int)math.floor(local.x * InvCellSize);
                int cy = (int)math.floor(local.y * InvCellSize);

                // Branchless bounds check
                if ((uint)cx < (uint)GridSize.x && (uint)cy < (uint)GridSize.y)
                {
                    int cellIdx = cy * GridSize.x + cx;
                    localCounts[cellIdx]++; // No atomics!
                }
            }

            // Flush local counts to global (one atomic per non-empty cell per chunk)
            int* globalPtr = (int*)GlobalCounts.GetUnsafePtr();
            for (int i = 0; i < numCells; i++)
            {
                int count = localCounts[i];
                if (count != 0)
                {
                    Interlocked.Add(ref globalPtr[i], count);
                }
            }

            localCounts.Dispose();
        }
    }

    /// <summary>
    /// PASS 2: Prefix Scan - Convert counts to CSR start/end indices
    /// Single-threaded but extremely fast (simple sequential scan)
    /// </summary>
    [BurstCompile]
    public struct PrefixScanJob : IJob
    {
        [ReadOnly] public NativeArray<int> Counts;
        public NativeArray<int> Starts; // Output: exclusive prefix sum
        public NativeArray<int> Ends;   // Output: copy of Starts (used as cursors in scatter)

        public void Execute()
        {
            int runningSum = 0;
            for (int i = 0; i < Counts.Length; i++)
            {
                Starts[i] = runningSum;
                Ends[i] = runningSum; // Initialize cursor
                runningSum += Counts[i];
            }
        }
    }

    /// <summary>
    /// PASS 3: Scatter - Write entities to packed array using atomic cursors
    /// </summary>
    [BurstCompile(FloatMode = FloatMode.Fast, FloatPrecision = FloatPrecision.Low)]
    public struct ScatterJob : IJobChunk
    {
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> TransformHandle;
        [ReadOnly] public ComponentTypeHandle<SpatialSettings> SettingsHandle;
        [ReadOnly] public EntityTypeHandle EntityHandle;

        [NativeDisableParallelForRestriction]
        public NativeArray<int> Ends; // Cursors (atomic increment per write)

        [NativeDisableParallelForRestriction]
        public NativeArray<Entity> Indices; // Packed output array

        public float2 Origin;
        public float InvCellSize;
        public int2 GridSize;

        public unsafe void Execute(in ArchetypeChunk chunk, int unfilteredChunkIndex, bool useEnabledMask, in v128 chunkEnabledMask)
        {
            var transforms = chunk.GetNativeArray(ref TransformHandle);
            var settings = chunk.GetNativeArray(ref SettingsHandle);
            var entities = chunk.GetNativeArray(EntityHandle);

            int* endsPtr = (int*)Ends.GetUnsafePtr();
            Entity* indicesPtr = (Entity*)Indices.GetUnsafePtr();
            int capacity = Indices.Length;

            for (int i = 0; i < chunk.Count; i++)
            {
                // Skip static entities
                if (settings[i].UpdateFrequency != 1)
                    continue;

                float2 pos = transforms[i].Position.xy;
                float2 local = pos - Origin;
                int cx = (int)math.floor(local.x * InvCellSize);
                int cy = (int)math.floor(local.y * InvCellSize);

                // Branchless bounds check
                if ((uint)cx < (uint)GridSize.x && (uint)cy < (uint)GridSize.y)
                {
                    int cellIdx = cy * GridSize.x + cx;

                    // Atomic increment cursor and write entity
                    int dstIdx = Interlocked.Increment(ref endsPtr[cellIdx]) - 1;

                    // CRITICAL: Bounds check to prevent array overflow
                    if (dstIdx >= 0 && dstIdx < capacity)
                    {
                        indicesPtr[dstIdx] = entities[i];
                    }
                    // else: CSR grid capacity exceeded - entity will be skipped
                    // This should not happen if capacity is set correctly
                }
            }
        }
    }
}
