using Unity.Mathematics;
using Unity.Collections;
using Unity.Entities;
using Unity.Burst;
using Unity.Jobs;
using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// Builds and maintains KD-Tree structure for spatial indexing
    /// </summary>
    [BurstCompile]
    public struct KDTreeBuilder
    {
        /// <summary>
        /// Build KD-Tree from entity positions
        /// </summary>
        public static void BuildTree(
            ref KDTree tree,
            NativeArray<Entity> entities,
            NativeArray<float3> positions)
        {
            tree.Clear();

            if (entities.Length == 0) return;

            // Create temporary arrays for sorting
            var indices = new NativeArray<int>(entities.Length, Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                indices[i] = i;
                tree.UpdateBounds(positions[i]);
            }

            // Build tree recursively
            tree.RootIndex = BuildRecursive(
                ref tree,
                entities,
                positions,
                indices,
                0,
                entities.Length - 1,
                0,
                -1
            );

            indices.Dispose();
        }

        private static int BuildRecursive(
            ref KDTree tree,
            NativeArray<Entity> entities,
            NativeArray<float3> positions,
            NativeArray<int> indices,
            int start,
            int end,
            int depth,
            int parentIndex)
        {
            if (start > end) return -1;

            int axis = depth % 3;
            int mid = (start + end) / 2;

            // Sort by axis
            QuickSortByAxis(positions, indices, start, end, axis);

            // Create node
            int nodeIndex = tree.Nodes.Length;
            var midEntity = entities[indices[mid]];
            var midPos = positions[indices[mid]];

            if (start == end)
            {
                // Leaf node
                tree.Nodes.Add(KDTreeNode.CreateLeaf(midEntity, midPos, parentIndex, depth));
            }
            else
            {
                // Internal node
                tree.Nodes.Add(KDTreeNode.CreateInternal(midPos, parentIndex, depth));

                // Build children
                int leftChild = BuildRecursive(
                    ref tree, entities, positions, indices,
                    start, mid - 1, depth + 1, nodeIndex
                );

                int rightChild = BuildRecursive(
                    ref tree, entities, positions, indices,
                    mid + 1, end, depth + 1, nodeIndex
                );

                // Update node with children indices
                var node = tree.Nodes[nodeIndex];
                node.LeftChild = leftChild;
                node.RightChild = rightChild;
                tree.Nodes[nodeIndex] = node;
            }

            tree.NodeCount++;
            return nodeIndex;
        }

        private static void QuickSortByAxis(
            NativeArray<float3> positions,
            NativeArray<int> indices,
            int left,
            int right,
            int axis)
        {
            if (left < right)
            {
                int pivot = Partition(positions, indices, left, right, axis);
                QuickSortByAxis(positions, indices, left, pivot - 1, axis);
                QuickSortByAxis(positions, indices, pivot + 1, right, axis);
            }
        }

        private static int Partition(
            NativeArray<float3> positions,
            NativeArray<int> indices,
            int left,
            int right,
            int axis)
        {
            float pivotValue = positions[indices[right]][axis];
            int i = left - 1;

            for (int j = left; j < right; j++)
            {
                if (positions[indices[j]][axis] <= pivotValue)
                {
                    i++;
                    Swap(ref indices, i, j);
                }
            }

            Swap(ref indices, i + 1, right);
            return i + 1;
        }

        private static void Swap(ref NativeArray<int> array, int i, int j)
        {
            int temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    /// <summary>
    /// Job for parallel KD-Tree building
    /// </summary>
    [BurstCompile]
    public struct BuildKDTreeJob : IJob
    {
        public NativeArray<Entity> Entities;
        public NativeArray<float3> Positions;
        [NativeDisableParallelForRestriction]
        public KDTree Tree;

        public void Execute()
        {
            KDTreeBuilder.BuildTree(ref Tree, Entities, Positions);
        }
    }

    /// <summary>
    /// Incremental tree builder for dynamic updates
    /// </summary>
    public struct IncrementalKDTreeBuilder
    {
        private int rebuildThreshold;
        private int insertionsSinceRebuild;
        private NativeList<Entity> pendingEntities;
        private NativeList<float3> pendingPositions;

        public IncrementalKDTreeBuilder(int threshold, Allocator allocator)
        {
            rebuildThreshold = threshold;
            insertionsSinceRebuild = 0;
            pendingEntities = new NativeList<Entity>(threshold, allocator);
            pendingPositions = new NativeList<float3>(threshold, allocator);
        }

        public void Insert(Entity entity, float3 position)
        {
            pendingEntities.Add(entity);
            pendingPositions.Add(position);
            insertionsSinceRebuild++;
        }

        public bool NeedsRebuild => insertionsSinceRebuild >= rebuildThreshold;

        public void Rebuild(ref KDTree tree)
        {
            if (pendingEntities.Length == 0) return;

            // Combine existing and pending
            var allEntities = new NativeList<Entity>(Allocator.Temp);
            var allPositions = new NativeList<float3>(Allocator.Temp);

            // Add existing nodes
            for (int i = 0; i < tree.Nodes.Length; i++)
            {
                if (tree.Nodes[i].IsLeaf && tree.Nodes[i].Entity != Entity.Null)
                {
                    allEntities.Add(tree.Nodes[i].Entity);
                    allPositions.Add(tree.Nodes[i].Position);
                }
            }

            // Add pending
            allEntities.AddRange(pendingEntities);
            allPositions.AddRange(pendingPositions);

            // Rebuild tree
            KDTreeBuilder.BuildTree(
                ref tree,
                allEntities.AsArray(),
                allPositions.AsArray()
            );

            // Clean up
            allEntities.Dispose();
            allPositions.Dispose();
            pendingEntities.Clear();
            pendingPositions.Clear();
            insertionsSinceRebuild = 0;
        }

        public void Dispose()
        {
            if (pendingEntities.IsCreated) pendingEntities.Dispose();
            if (pendingPositions.IsCreated) pendingPositions.Dispose();
        }
    }
}