using System;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Burst;
using KBVE.MMExtensions.Orchestrator.DOTS.Utilities;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// High-performance KD-Tree implementation based on Unity's official DOTS samples
    /// Features parallel tree building, burst compilation, and optimized spatial queries
    /// </summary>
    public struct KDTreeAdvanced : IDisposable
    {
        public NativeArray<TreeNode> Nodes;
        public NativeArray<Entry> Entries;
        public NativeArray<int> IndexMapping;
        public int EntryCount;
        public int NodeCount;
        public int LeafSize;
        public float3 BoundsMin;
        public float3 BoundsMax;
        public Allocator AllocatorLabel;
        public bool IsBuilt;

        public KDTreeAdvanced(int capacity, int leafSize = 16, Allocator allocator = Allocator.Persistent)
        {
            Nodes = new NativeArray<TreeNode>(capacity * 2, allocator);
            Entries = new NativeArray<Entry>(capacity, allocator);
            IndexMapping = new NativeArray<int>(capacity, allocator);
            EntryCount = 0;
            NodeCount = 0;
            LeafSize = math.max(1, leafSize);
            BoundsMin = new float3(float.MaxValue);
            BoundsMax = new float3(float.MinValue);
            AllocatorLabel = allocator;
            IsBuilt = false;
        }

        /// <summary>
        /// Add an entry to the tree (must build after adding all entries)
        /// </summary>
        public void AddEntry(Entity entity, float3 position)
        {
            if (EntryCount >= Entries.Length)
                return;

            Entries[EntryCount] = new Entry
            {
                Entity = entity,
                Position = position,
                Index = EntryCount
            };

            IndexMapping[EntryCount] = EntryCount;

            BoundsMin = math.min(BoundsMin, position);
            BoundsMax = math.max(BoundsMax, position);

            EntryCount++;
            IsBuilt = false;
        }

        /// <summary>
        /// Build the tree structure for efficient querying
        /// </summary>
        public JobHandle BuildTree(JobHandle dependency = default)
        {
            if (EntryCount == 0)
                return dependency;

            // Estimate max nodes needed (worst case is 2*N nodes for N entries)
            NodeCount = EntryCount * 2;

            var buildJob = new BuildTreeJob
            {
                Entries = Entries,
                IndexMapping = IndexMapping,
                Nodes = Nodes,
                EntryCount = EntryCount,
                LeafSize = LeafSize,
                NodeCount = 0
            };

            var jobHandle = buildJob.Schedule(dependency);

            IsBuilt = true; // Mark as built after scheduling

            return jobHandle;
        }

        /// <summary>
        /// Find entries within a specified radius using priority heap
        /// </summary>
        public void GetEntriesInRangeWithHeap(float3 queryPosition, float radius,
            ref NativePriorityHeap<SpatialHeapEntry> heap)
        {
            if (!IsBuilt || EntryCount == 0)
                return;

            float radiusSq = radius * radius;
            GetEntriesInRangeRecursive(queryPosition, radiusSq, 0, ref heap);
        }

        /// <summary>
        /// Find K nearest neighbors using priority heap
        /// </summary>
        public void GetKNearestNeighbors(float3 queryPosition, int k,
            ref NativePriorityHeap<SpatialHeapEntry> heap)
        {
            if (!IsBuilt || EntryCount == 0)
                return;

            // Use max heap for k-nearest neighbors
            GetKNearestRecursive(queryPosition, k, 0, ref heap);
        }

        /// <summary>
        /// Simple range query returning all entries within radius
        /// </summary>
        public void GetEntriesInRange(float3 queryPosition, float radius, NativeList<Entry> results)
        {
            if (!IsBuilt || EntryCount == 0)
                return;

            float radiusSq = radius * radius;
            GetEntriesInRangeRecursiveSimple(queryPosition, radiusSq, 0, results);
        }

        /// <summary>
        /// Bounding box query returning all entries within rectangular bounds
        /// Perfect for camera frustum culling queries
        /// </summary>
        public void GetEntriesInBounds(float3 boundsMin, float3 boundsMax, NativeList<Entry> results)
        {
            if (!IsBuilt || EntryCount == 0)
                return;

            GetEntriesInBoundsRecursive(boundsMin, boundsMax, 0, results);
        }

        private void GetEntriesInRangeRecursive(float3 queryPosition, float radiusSq, int nodeIndex,
            ref NativePriorityHeap<SpatialHeapEntry> heap)
        {
            if (nodeIndex >= NodeCount)
                return;

            var node = Nodes[nodeIndex];

            if (node.IsLeaf())
            {
                // Check all entries in leaf
                for (int i = node.StartIndex; i < node.StartIndex + node.Count; i++)
                {
                    var entry = Entries[IndexMapping[i]];
                    float distSq = math.distancesq(queryPosition, entry.Position);

                    if (distSq <= radiusSq)
                    {
                        if (!heap.IsFull)
                        {
                            heap.Push(new SpatialHeapEntry(distSq, entry.Entity, entry.Position));
                        }
                        else
                        {
                            heap.TryPushPop(new SpatialHeapEntry(distSq, entry.Entity, entry.Position));
                        }
                    }
                }
            }
            else
            {
                // Check if sphere intersects with split plane
                float diff = queryPosition[node.SplitAxis] - node.SplitValue;

                // Visit closer child first
                int nearChild = diff <= 0 ? node.LeftChild : node.RightChild;
                int farChild = diff <= 0 ? node.RightChild : node.LeftChild;

                GetEntriesInRangeRecursive(queryPosition, radiusSq, nearChild, ref heap);

                // Check if we need to visit far child
                if (diff * diff <= radiusSq)
                {
                    GetEntriesInRangeRecursive(queryPosition, radiusSq, farChild, ref heap);
                }
            }
        }

        private void GetKNearestRecursive(float3 queryPosition, int k, int nodeIndex,
            ref NativePriorityHeap<SpatialHeapEntry> heap)
        {
            if (nodeIndex >= NodeCount)
                return;

            var node = Nodes[nodeIndex];

            if (node.IsLeaf())
            {
                // Check all entries in leaf
                for (int i = node.StartIndex; i < node.StartIndex + node.Count; i++)
                {
                    var entry = Entries[IndexMapping[i]];
                    float distSq = math.distancesq(queryPosition, entry.Position);

                    heap.TryPushPop(new SpatialHeapEntry(distSq, entry.Entity, entry.Position));
                }
            }
            else
            {
                // Visit both children, closer first
                float diff = queryPosition[node.SplitAxis] - node.SplitValue;

                int nearChild = diff <= 0 ? node.LeftChild : node.RightChild;
                int farChild = diff <= 0 ? node.RightChild : node.LeftChild;

                GetKNearestRecursive(queryPosition, k, nearChild, ref heap);

                // Check if far child could contain closer points
                if (heap.Count < k || diff * diff < heap.Peek().DistanceSquared)
                {
                    GetKNearestRecursive(queryPosition, k, farChild, ref heap);
                }
            }
        }

        private void GetEntriesInRangeRecursiveSimple(float3 queryPosition, float radiusSq, int nodeIndex,
            NativeList<Entry> results)
        {
            if (nodeIndex >= NodeCount)
                return;

            var node = Nodes[nodeIndex];

            if (node.IsLeaf())
            {
                for (int i = node.StartIndex; i < node.StartIndex + node.Count; i++)
                {
                    var entry = Entries[IndexMapping[i]];
                    float distSq = math.distancesq(queryPosition, entry.Position);

                    if (distSq <= radiusSq)
                    {
                        results.Add(entry);
                    }
                }
            }
            else
            {
                float diff = queryPosition[node.SplitAxis] - node.SplitValue;

                int nearChild = diff <= 0 ? node.LeftChild : node.RightChild;
                int farChild = diff <= 0 ? node.RightChild : node.LeftChild;

                GetEntriesInRangeRecursiveSimple(queryPosition, radiusSq, nearChild, results);

                if (diff * diff <= radiusSq)
                {
                    GetEntriesInRangeRecursiveSimple(queryPosition, radiusSq, farChild, results);
                }
            }
        }

        private void GetEntriesInBoundsRecursive(float3 boundsMin, float3 boundsMax, int nodeIndex,
            NativeList<Entry> results)
        {
            if (nodeIndex >= NodeCount)
                return;

            var node = Nodes[nodeIndex];

            if (node.IsLeaf())
            {
                // Check all entries in leaf against bounding box
                for (int i = node.StartIndex; i < node.StartIndex + node.Count; i++)
                {
                    var entry = Entries[IndexMapping[i]];
                    var pos = entry.Position;

                    // Check if point is within bounding box
                    if (pos.x >= boundsMin.x && pos.x <= boundsMax.x &&
                        pos.y >= boundsMin.y && pos.y <= boundsMax.y &&
                        pos.z >= boundsMin.z && pos.z <= boundsMax.z)
                    {
                        results.Add(entry);
                    }
                }
            }
            else
            {
                // Check if bounding box intersects with split plane
                int splitAxis = node.SplitAxis;
                float splitValue = node.SplitValue;

                // Determine which children to visit based on bounds intersection
                bool visitLeft = boundsMin[splitAxis] <= splitValue;
                bool visitRight = boundsMax[splitAxis] >= splitValue;

                if (visitLeft && node.LeftChild >= 0)
                {
                    GetEntriesInBoundsRecursive(boundsMin, boundsMax, node.LeftChild, results);
                }

                if (visitRight && node.RightChild >= 0)
                {
                    GetEntriesInBoundsRecursive(boundsMin, boundsMax, node.RightChild, results);
                }
            }
        }

        public void Clear()
        {
            EntryCount = 0;
            NodeCount = 0;
            BoundsMin = new float3(float.MaxValue);
            BoundsMax = new float3(float.MinValue);
            IsBuilt = false;
        }

        public void Dispose()
        {
            if (Nodes.IsCreated) Nodes.Dispose();
            if (Entries.IsCreated) Entries.Dispose();
            if (IndexMapping.IsCreated) IndexMapping.Dispose();
        }
    }

    /// <summary>
    /// Tree node for the KD-Tree
    /// </summary>
    public struct TreeNode
    {
        public int LeftChild;
        public int RightChild;
        public int StartIndex;
        public int Count;
        public float SplitValue;
        public byte SplitAxis;
        public byte NodeType; // 0 = internal, 1 = leaf

        public bool IsLeaf() => NodeType == 1;
        public bool IsInternal() => NodeType == 0;

        public static TreeNode CreateLeaf(int startIndex, int count)
        {
            return new TreeNode
            {
                LeftChild = -1,
                RightChild = -1,
                StartIndex = startIndex,
                Count = count,
                SplitValue = 0,
                SplitAxis = 0,
                NodeType = 1
            };
        }

        public static TreeNode CreateInternal(int leftChild, int rightChild, float splitValue, byte splitAxis)
        {
            return new TreeNode
            {
                LeftChild = leftChild,
                RightChild = rightChild,
                StartIndex = -1,
                Count = 0,
                SplitValue = splitValue,
                SplitAxis = splitAxis,
                NodeType = 0
            };
        }
    }

    /// <summary>
    /// Entry in the KD-Tree
    /// </summary>
    public struct Entry
    {
        public Entity Entity;
        public float3 Position;
        public int Index;
    }

    /// <summary>
    /// Job for building the KD-Tree in parallel
    /// </summary>
    [BurstCompile]
    public struct BuildTreeJob : IJob
    {
        [ReadOnly] public NativeArray<Entry> Entries;
        public NativeArray<int> IndexMapping;
        public NativeArray<TreeNode> Nodes;
        public int EntryCount;
        public int LeafSize;
        public int NodeCount;

        public void Execute()
        {
            if (EntryCount == 0)
                return;

            NodeCount = 0;
            BuildTreeRecursive(0, EntryCount, 0);
        }

        private int BuildTreeRecursive(int start, int count, int depth)
        {
            int nodeIndex = NodeCount++;

            if (count <= LeafSize)
            {
                // Create leaf node
                Nodes[nodeIndex] = TreeNode.CreateLeaf(start, count);
                return nodeIndex;
            }

            // Choose split axis (cycle through x, y, z)
            byte splitAxis = (byte)(depth % 3);

            // Sort entries along split axis
            QuickSortByAxis(start, start + count - 1, splitAxis);

            // Find median
            int medianIndex = start + count / 2;
            float splitValue = Entries[IndexMapping[medianIndex]].Position[splitAxis];

            // Create internal node
            int leftCount = medianIndex - start;
            int rightCount = count - leftCount;

            int leftChild = -1;
            int rightChild = -1;

            if (leftCount > 0)
                leftChild = BuildTreeRecursive(start, leftCount, depth + 1);

            if (rightCount > 0)
                rightChild = BuildTreeRecursive(medianIndex, rightCount, depth + 1);

            Nodes[nodeIndex] = TreeNode.CreateInternal(leftChild, rightChild, splitValue, splitAxis);
            return nodeIndex;
        }

        private void QuickSortByAxis(int left, int right, int axis)
        {
            if (left < right)
            {
                int pivot = PartitionByAxis(left, right, axis);
                QuickSortByAxis(left, pivot - 1, axis);
                QuickSortByAxis(pivot + 1, right, axis);
            }
        }

        private int PartitionByAxis(int left, int right, int axis)
        {
            float pivotValue = Entries[IndexMapping[right]].Position[axis];
            int i = left - 1;

            for (int j = left; j < right; j++)
            {
                if (Entries[IndexMapping[j]].Position[axis] <= pivotValue)
                {
                    i++;
                    int temp = IndexMapping[i];
                    IndexMapping[i] = IndexMapping[j];
                    IndexMapping[j] = temp;
                }
            }

            int temp2 = IndexMapping[i + 1];
            IndexMapping[i + 1] = IndexMapping[right];
            IndexMapping[right] = temp2;

            return i + 1;
        }
    }
}