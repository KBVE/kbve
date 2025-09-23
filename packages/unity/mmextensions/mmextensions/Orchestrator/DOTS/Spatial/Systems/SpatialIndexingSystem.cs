using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Jobs;
using KBVE.MMExtensions.Orchestrator.DOTS.Utilities;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// Maintains spatial indices for efficient queries using advanced KDTree
    /// Features parallel tree building and optimized spatial indexing
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(SpatialQuerySystem))]
    public partial class SpatialIndexingSystem : SystemBase
    {
        private KDTreeAdvanced _kdTree;
        private int _framesSinceRebuild;
        private const int RebuildInterval = 30; // Rebuild every 30 frames
        private const int InitialCapacity = 150000; // Support 150k entities (more than current 100k)
        private const int LeafSize = 16; // Optimal for cache performance
        private JobHandle _buildJobHandle;

        // Public accessor for checking if tree is ready
        public bool IsTreeReady => _kdTree.IsBuilt && _buildJobHandle.IsCompleted;

        protected override void OnCreate()
        {
            _kdTree = new KDTreeAdvanced(InitialCapacity, LeafSize, Allocator.Persistent);
            _framesSinceRebuild = 0;
        }

        protected override void OnDestroy()
        {
            // Complete any ongoing jobs before disposal
            _buildJobHandle.Complete();
            _kdTree.Dispose();
        }

        protected override void OnUpdate()
        {
            // Complete previous build job if still running
            _buildJobHandle.Complete();

            _framesSinceRebuild++;

            // Periodic KD-Tree rebuild for dynamic spatial indexing
            if (_framesSinceRebuild >= RebuildInterval)
            {
                _buildJobHandle = RebuildKDTreeAsync();
                _framesSinceRebuild = 0;
            }
        }

        /// <summary>
        /// Rebuild the KD-Tree with current entity positions
        /// Uses parallel job for performance
        /// </summary>
        private JobHandle RebuildKDTreeAsync()
        {
            // Query all entities with SpatialPosition, regardless of type
            var query = GetEntityQuery(
                ComponentType.ReadOnly<SpatialPosition>()
            );

            var entities = query.ToEntityArray(Allocator.TempJob);
            var spatialPositions = query.ToComponentDataArray<SpatialPosition>(Allocator.TempJob);

            if (entities.Length == 0)
            {
                entities.Dispose();
                spatialPositions.Dispose();
                return default;
            }

            // Clear previous tree data
            _kdTree.Clear();

            // Add entries to tree (this prepares data for parallel building)
            var addEntriesJob = new AddEntriesToTreeJob
            {
                Entities = entities,
                SpatialPositions = spatialPositions,
                KDTree = _kdTree
            };

            var addJobHandle = addEntriesJob.Schedule();

            // Build tree in parallel
            var buildJobHandle = _kdTree.BuildTree(addJobHandle);

            // Clean up temporary arrays after build completes
            var cleanupJob = new CleanupArraysJob
            {
                Entities = entities,
                SpatialPositions = spatialPositions
            };

            return cleanupJob.Schedule(buildJobHandle);
        }

        /// <summary>
        /// Get the current KD-Tree for queries (read-only)
        /// </summary>
        public KDTreeAdvanced GetKDTree()
        {
            _buildJobHandle.Complete(); // Ensure tree is built
            return _kdTree;
        }

        /// <summary>
        /// Force immediate rebuild of the spatial index
        /// </summary>
        public void ForceRebuild()
        {
            _buildJobHandle.Complete();
            _buildJobHandle = RebuildKDTreeAsync();
            _buildJobHandle.Complete();
        }
    }

    /// <summary>
    /// Job to add entities to the KD-Tree for parallel processing
    /// </summary>
    [BurstCompile]
    public struct AddEntriesToTreeJob : IJob
    {
        [ReadOnly] public NativeArray<Entity> Entities;
        [ReadOnly] public NativeArray<SpatialPosition> SpatialPositions;
        public KDTreeAdvanced KDTree;

        public void Execute()
        {
            for (int i = 0; i < Entities.Length; i++)
            {
                KDTree.AddEntry(Entities[i], SpatialPositions[i].Position);
            }
        }
    }

    /// <summary>
    /// Job to clean up temporary arrays after tree building
    /// </summary>
    [BurstCompile]
    public struct CleanupArraysJob : IJob
    {
        [DeallocateOnJobCompletion] public NativeArray<Entity> Entities;
        [DeallocateOnJobCompletion] public NativeArray<SpatialPosition> SpatialPositions;

        public void Execute()
        {
            // Arrays will be automatically deallocated
        }
    }

    /// <summary>
    /// Singleton component to share spatial indexing data across systems
    /// </summary>
    public struct SpatialIndexData : IComponentData
    {
        public int EntityCount;
        public float3 WorldBoundsMin;
        public float3 WorldBoundsMax;
        public float LastUpdateTime;
        public bool IsValid;
    }
}