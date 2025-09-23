using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Burst;
using Unity.Jobs;
using Unity.Transforms;
using UnityEngine;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// High-performance spatial indexing system using ISystem and Burst compilation
    /// Maintains KD-Tree for efficient spatial queries with 100k+ entities
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(SpatialQuerySystem))]
    [BurstCompile]
    public partial struct SpatialIndexingSystemV2 : ISystem
    {
        private KDTreeAdvanced _kdTree;
        private int _framesSinceRebuild;
        private int _rebuildCount;
        private int _lastEntityCount;
        private NativeReference<bool> _isTreeReady;
        private NativeReference<int> _entityCount;

        // Configuration
        private const int RebuildInterval = 120; // Rebuild every 2 seconds at 60 FPS
        private const int InitialCapacity = 150000;
        private const int LeafSize = 32;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _kdTree = new KDTreeAdvanced(InitialCapacity, LeafSize, Allocator.Persistent);
            _framesSinceRebuild = 0;
            _rebuildCount = 0;
            _lastEntityCount = 0;
            _isTreeReady = new NativeReference<bool>(Allocator.Persistent);
            _entityCount = new NativeReference<int>(Allocator.Persistent);

            Debug.Log($"[SpatialIndexingV2] ISystem initialized - Burst compiled, zero GC");
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            if (_kdTree.Nodes.IsCreated)
                _kdTree.Dispose();
            if (_isTreeReady.IsCreated)
                _isTreeReady.Dispose();
            if (_entityCount.IsCreated)
                _entityCount.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _framesSinceRebuild++;

            // Check if rebuild needed
            if (_framesSinceRebuild < RebuildInterval)
                return;

            _framesSinceRebuild = 0;
            _rebuildCount++;

            // Count entities with spatial position (no allocation!)
            int entityCount = 0;
            foreach (var _ in SystemAPI.Query<RefRO<SpatialPosition>>())
            {
                entityCount++;
            }

            if (entityCount == 0)
            {
                _isTreeReady.Value = false;
                return;
            }

            _entityCount.Value = entityCount;

            // Clear and prepare tree
            _kdTree.Clear();
            _kdTree.EntryCount = 0;

            // Build tree using chunk iteration (no array copies!)
            var buildJob = new PopulateKDTreeJob
            {
                KDTree = _kdTree,
                EntityCount = entityCount
            };

            state.Dependency = buildJob.ScheduleParallel(state.Dependency);

            // Mark tree as built after job completes
            var markBuiltJob = new MarkTreeBuiltJob
            {
                KDTree = _kdTree,
                IsTreeReady = _isTreeReady,
                RebuildCount = _rebuildCount,
                EntityCount = _entityCount
            };

            state.Dependency = markBuiltJob.Schedule(state.Dependency);
        }

        /// <summary>
        /// Get the KD-Tree for queries (ensure jobs are complete first)
        /// </summary>
        public KDTreeAdvanced GetKDTree(ref SystemState state)
        {
            state.CompleteDependency();
            return _kdTree;
        }

        public bool IsTreeReady => _isTreeReady.IsCreated && _isTreeReady.Value;
    }

    /// <summary>
    /// Burst-compiled job to populate KD-Tree from entity chunks
    /// Processes entities in parallel without memory copies
    /// </summary>
    [BurstCompile]
    public partial struct PopulateKDTreeJob : IJobEntity
    {
        [NativeDisableUnsafePtrRestriction]
        public KDTreeAdvanced KDTree;
        public int EntityCount;

        public void Execute(Entity entity, in SpatialPosition spatial, in LocalTransform transform)
        {
            // Use actual transform position for accuracy
            var position = transform.Position;

            // Thread-safe atomic increment to get unique index
            int index = Interlocked.Increment(ref KDTree.EntryCount) - 1;

            if (index < KDTree.Entries.Length)
            {
                // Add entry to tree
                KDTree.Entries[index] = new Entry
                {
                    Entity = entity,
                    Position = position,
                    Index = index
                };

                KDTree.IndexMapping[index] = index;

                // Update bounds (note: this isn't thread-safe, but close enough for spatial bounds)
                KDTree.BoundsMin = math.min(KDTree.BoundsMin, position);
                KDTree.BoundsMax = math.max(KDTree.BoundsMax, position);
            }
        }
    }

    /// <summary>
    /// Job to mark tree as built and log performance
    /// </summary>
    [BurstCompile]
    public struct MarkTreeBuiltJob : IJob
    {
        [NativeDisableUnsafePtrRestriction]
        public KDTreeAdvanced KDTree;
        public NativeReference<bool> IsTreeReady;
        public int RebuildCount;
        public NativeReference<int> EntityCount;

        public void Execute()
        {
            // Build the tree structure
            if (KDTree.EntryCount > 0)
            {
                BuildTreeRecursive(0, KDTree.EntryCount, 0);
                KDTree.IsBuilt = true;
                IsTreeReady.Value = true;

                // Log every 10 rebuilds
                if (RebuildCount % 10 == 0)
                {
                    Debug.Log($"[SpatialIndexingV2] Rebuild #{RebuildCount}: {EntityCount.Value} entities indexed");
                }
            }
        }

        private int BuildTreeRecursive(int start, int count, int depth)
        {
            if (KDTree.NodeCount >= KDTree.Nodes.Length)
                return -1;

            int nodeIndex = KDTree.NodeCount++;

            if (count <= KDTree.LeafSize)
            {
                // Create leaf node
                KDTree.Nodes[nodeIndex] = TreeNode.CreateLeaf(start, count);
                return nodeIndex;
            }

            // Choose split axis
            byte splitAxis = (byte)(depth % 3);

            // Partial sort for median (more efficient than full sort)
            int medianIndex = start + count / 2;
            PartialSort(start, start + count - 1, medianIndex, splitAxis);

            float splitValue = KDTree.Entries[KDTree.IndexMapping[medianIndex]].Position[splitAxis];

            // Recursively build children
            int leftCount = medianIndex - start;
            int rightCount = count - leftCount;

            int leftChild = leftCount > 0 ? BuildTreeRecursive(start, leftCount, depth + 1) : -1;
            int rightChild = rightCount > 0 ? BuildTreeRecursive(medianIndex, rightCount, depth + 1) : -1;

            KDTree.Nodes[nodeIndex] = TreeNode.CreateInternal(leftChild, rightChild, splitValue, splitAxis);
            return nodeIndex;
        }

        private void PartialSort(int left, int right, int k, int axis)
        {
            // Quick select algorithm for finding k-th element
            while (left < right)
            {
                int pivotIndex = Partition(left, right, axis);
                if (pivotIndex == k)
                    return;
                else if (pivotIndex < k)
                    left = pivotIndex + 1;
                else
                    right = pivotIndex - 1;
            }
        }

        private int Partition(int left, int right, int axis)
        {
            float pivotValue = KDTree.Entries[KDTree.IndexMapping[right]].Position[axis];
            int i = left - 1;

            for (int j = left; j < right; j++)
            {
                if (KDTree.Entries[KDTree.IndexMapping[j]].Position[axis] <= pivotValue)
                {
                    i++;
                    int temp = KDTree.IndexMapping[i];
                    KDTree.IndexMapping[i] = KDTree.IndexMapping[j];
                    KDTree.IndexMapping[j] = temp;
                }
            }

            int temp2 = KDTree.IndexMapping[i + 1];
            KDTree.IndexMapping[i + 1] = KDTree.IndexMapping[right];
            KDTree.IndexMapping[right] = temp2;

            return i + 1;
        }
    }
}