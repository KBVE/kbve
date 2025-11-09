using System;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Entities;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Entry for 2D KD-Tree containing entity and position data
    /// </summary>
    public struct KDTreeEntry : IEquatable<KDTreeEntry>
    {
        public Entity Entity;
        public float2 Position;

        public bool Equals(KDTreeEntry other)
        {
            return Entity.Equals(other.Entity) && Position.Equals(other.Position);
        }

        public override int GetHashCode()
        {
            return (int)math.hash(new uint3((uint)Entity.Index, (uint)Entity.Version, math.hash(Position)));
        }
    }

    /// <summary>
    /// High-performance 2D KD-Tree for nearest neighbor queries.
    ///
    /// Performance Characteristics:
    /// - Build: O(N log N)
    /// - Nearest Neighbor: O(log N) average, O(N) worst case
    /// - K-Nearest Neighbors: O(K log N)
    /// - Range Query: O(sqrt(N) + K) where K is result count
    ///
    /// Best for:
    /// - Finding exact nearest neighbor (better than QuadTree)
    /// - Finding K nearest entities
    /// - Static or semi-static data (rebuild cost is higher than QuadTree)
    ///
    /// Complement to QuadTree:
    /// - QuadTree: Better for radius queries, dynamic updates
    /// - KDTree: Better for exact nearest neighbor, batch queries
    /// </summary>
    [BurstCompile]
    public struct KDTree2D : IDisposable
    {
        private NativeArray<KDNode> _nodes;
        private NativeArray<KDTreeEntry> _entries;
        private int _root;
        private int _count;
        private bool _isCreated;

        private const int INVALID_NODE = -1;

        /// <summary>
        /// KD-Tree node structure
        /// </summary>
        private struct KDNode
        {
            public int EntryIndex;  // Index into _entries array
            public int Left;        // Left child node index
            public int Right;       // Right child node index
            public byte SplitAxis;  // 0 = X axis, 1 = Y axis
        }

        public bool IsCreated => _isCreated;
        public int Count => _count;

        /// <summary>
        /// Create a new KD-Tree with initial capacity
        /// </summary>
        public KDTree2D(int initialCapacity, Allocator allocator = Allocator.Persistent)
        {
            _nodes = new NativeArray<KDNode>(initialCapacity, allocator);
            _entries = new NativeArray<KDTreeEntry>(initialCapacity, allocator);
            _root = INVALID_NODE;
            _count = 0;
            _isCreated = true;
        }

        /// <summary>
        /// Build KD-Tree from array of entries (replaces existing tree)
        /// This is the most efficient way to construct a KD-Tree
        /// </summary>
        public void Build(NativeArray<KDTreeEntry> entries)
        {
            _count = entries.Length;

            // Ensure capacity
            if (_nodes.Length < _count)
            {
                _nodes.Dispose();
                _entries.Dispose();
                _nodes = new NativeArray<KDNode>(_count, Allocator.Persistent);
                _entries = new NativeArray<KDTreeEntry>(_count, Allocator.Persistent);
            }

            // Copy entries
            NativeArray<KDTreeEntry>.Copy(entries, _entries, _count);

            // Build tree recursively
            if (_count > 0)
            {
                _root = BuildRecursive(0, _count, 0);
            }
            else
            {
                _root = INVALID_NODE;
            }
        }

        /// <summary>
        /// Recursively build KD-Tree using median split
        /// </summary>
        private int BuildRecursive(int start, int end, byte depth)
        {
            if (start >= end)
                return INVALID_NODE;

            // Choose split axis (alternate between X and Y)
            byte axis = (byte)(depth % 2);

            // Find median using partial sort
            int medianIndex = (start + end) / 2;
            PartialSort(start, end, medianIndex, axis);

            // Create node
            var node = new KDNode
            {
                EntryIndex = medianIndex,
                SplitAxis = axis,
                Left = BuildRecursive(start, medianIndex, (byte)(depth + 1)),
                Right = BuildRecursive(medianIndex + 1, end, (byte)(depth + 1))
            };

            _nodes[medianIndex] = node;
            return medianIndex;
        }

        /// <summary>
        /// Partial quicksort to find median (optimized for KD-Tree construction)
        /// </summary>
        private void PartialSort(int start, int end, int k, byte axis)
        {
            if (start >= end)
                return;

            int pivotIndex = Partition(start, end, axis);

            if (pivotIndex == k)
                return;
            else if (k < pivotIndex)
                PartialSort(start, pivotIndex, k, axis);
            else
                PartialSort(pivotIndex + 1, end, k, axis);
        }

        /// <summary>
        /// Partition for quickselect algorithm
        /// </summary>
        private int Partition(int start, int end, byte axis)
        {
            int pivotIndex = (start + end - 1) / 2;
            var pivotPos = _entries[pivotIndex].Position;
            float pivotValue = GetAxisValue(in pivotPos, axis);

            // Move pivot to end
            Swap(pivotIndex, end - 1);

            int storeIndex = start;
            for (int i = start; i < end - 1; i++)
            {
                var entryPos = _entries[i].Position;
                if (GetAxisValue(in entryPos, axis) < pivotValue)
                {
                    Swap(i, storeIndex);
                    storeIndex++;
                }
            }

            // Move pivot to final position
            Swap(storeIndex, end - 1);
            return storeIndex;
        }

        /// <summary>
        /// Swap two entries
        /// </summary>
        [BurstCompile]
        private void Swap(int a, int b)
        {
            var temp = _entries[a];
            _entries[a] = _entries[b];
            _entries[b] = temp;
        }

        /// <summary>
        /// Get value for specific axis
        /// Pass by reference to satisfy Burst constraints for external functions
        /// </summary>
        [BurstCompile]
        private static float GetAxisValue(in float2 point, byte axis)
        {
            return axis == 0 ? point.x : point.y;
        }

        /// <summary>
        /// Find nearest neighbor to query point
        /// Returns entity and distance squared
        /// </summary>
        public bool FindNearest(float2 queryPoint, out Entity nearestEntity, out float distanceSq)
        {
            nearestEntity = Entity.Null;
            distanceSq = float.MaxValue;

            if (_root == INVALID_NODE || _count == 0)
                return false;

            FindNearestRecursive(_root, queryPoint, ref nearestEntity, ref distanceSq);
            return nearestEntity != Entity.Null;
        }

        /// <summary>
        /// Recursive nearest neighbor search
        /// </summary>
        private void FindNearestRecursive(int nodeIndex, float2 queryPoint, ref Entity bestEntity, ref float bestDistSq)
        {
            if (nodeIndex == INVALID_NODE)
                return;

            var node = _nodes[nodeIndex];
            var entry = _entries[node.EntryIndex];
            var entryPos = entry.Position;

            // Check if this node is closer than current best
            float distSq = math.distancesq(queryPoint, entryPos);
            if (distSq < bestDistSq)
            {
                bestDistSq = distSq;
                bestEntity = entry.Entity;
            }

            // Determine which side to search first
            byte axis = node.SplitAxis;
            float splitValue = GetAxisValue(in entryPos, axis);
            float queryValue = GetAxisValue(in queryPoint, axis);
            float axisDist = queryValue - splitValue;

            // Search near side first
            int nearNode = axisDist < 0 ? node.Left : node.Right;
            int farNode = axisDist < 0 ? node.Right : node.Left;

            FindNearestRecursive(nearNode, queryPoint, ref bestEntity, ref bestDistSq);

            // Check if we need to search far side (if splitting plane is within current best distance)
            if (axisDist * axisDist < bestDistSq)
            {
                FindNearestRecursive(farNode, queryPoint, ref bestEntity, ref bestDistSq);
            }
        }

        /// <summary>
        /// Find K nearest neighbors to query point
        /// Results are stored in provided NativeList (will be cleared first)
        /// </summary>
        public void FindKNearest(float2 queryPoint, int k, NativeList<Entity> results)
        {
            results.Clear();

            if (_root == INVALID_NODE || _count == 0 || k <= 0)
                return;

            // Use a priority queue implemented as a max-heap (stores k closest points)
            var heap = new NativeList<KNearestEntry>(k, Allocator.Temp);

            FindKNearestRecursive(_root, queryPoint, k, heap);

            // Extract results from heap
            for (int i = 0; i < heap.Length; i++)
            {
                results.Add(heap[i].Entity);
            }

            heap.Dispose();
        }

        /// <summary>
        /// Helper struct for K-nearest search
        /// </summary>
        private struct KNearestEntry
        {
            public Entity Entity;
            public float DistanceSq;
        }

        /// <summary>
        /// Recursive K-nearest neighbor search
        /// </summary>
        private void FindKNearestRecursive(int nodeIndex, float2 queryPoint, int k, NativeList<KNearestEntry> heap)
        {
            if (nodeIndex == INVALID_NODE)
                return;

            var node = _nodes[nodeIndex];
            var entry = _entries[node.EntryIndex];
            var entryPos = entry.Position;

            // Calculate distance to this node
            float distSq = math.distancesq(queryPoint, entryPos);

            // Add to heap if we have room or if it's closer than worst element
            if (heap.Length < k)
            {
                heap.Add(new KNearestEntry { Entity = entry.Entity, DistanceSq = distSq });
                if (heap.Length == k)
                {
                    // Heapify once when we reach capacity
                    BuildMaxHeap(heap);
                }
            }
            else if (distSq < heap[0].DistanceSq)
            {
                // Replace worst element and re-heapify
                heap[0] = new KNearestEntry { Entity = entry.Entity, DistanceSq = distSq };
                MaxHeapify(heap, 0);
            }

            // Determine search order
            byte axis = node.SplitAxis;
            float splitValue = GetAxisValue(in entryPos, axis);
            float queryValue = GetAxisValue(in queryPoint, axis);
            float axisDist = queryValue - splitValue;

            // Search near side first
            int nearNode = axisDist < 0 ? node.Left : node.Right;
            int farNode = axisDist < 0 ? node.Right : node.Left;

            FindKNearestRecursive(nearNode, queryPoint, k, heap);

            // Check if we need to search far side
            float worstDistSq = heap.Length < k ? float.MaxValue : heap[0].DistanceSq;
            if (axisDist * axisDist < worstDistSq)
            {
                FindKNearestRecursive(farNode, queryPoint, k, heap);
            }
        }

        /// <summary>
        /// Build max heap (worst distance at root)
        /// </summary>
        private void BuildMaxHeap(NativeList<KNearestEntry> heap)
        {
            for (int i = heap.Length / 2 - 1; i >= 0; i--)
            {
                MaxHeapify(heap, i);
            }
        }

        /// <summary>
        /// Max-heapify operation
        /// </summary>
        private void MaxHeapify(NativeList<KNearestEntry> heap, int i)
        {
            int largest = i;
            int left = 2 * i + 1;
            int right = 2 * i + 2;

            if (left < heap.Length && heap[left].DistanceSq > heap[largest].DistanceSq)
                largest = left;

            if (right < heap.Length && heap[right].DistanceSq > heap[largest].DistanceSq)
                largest = right;

            if (largest != i)
            {
                var temp = heap[i];
                heap[i] = heap[largest];
                heap[largest] = temp;
                MaxHeapify(heap, largest);
            }
        }

        /// <summary>
        /// Query all entities within a radius
        /// </summary>
        public void QueryRadius(float2 center, float radius, NativeList<Entity> results)
        {
            results.Clear();

            if (_root == INVALID_NODE || _count == 0)
                return;

            float radiusSq = radius * radius;
            QueryRadiusRecursive(_root, center, radiusSq, results);
        }

        /// <summary>
        /// Recursive radius query
        /// </summary>
        private void QueryRadiusRecursive(int nodeIndex, float2 center, float radiusSq, NativeList<Entity> results)
        {
            if (nodeIndex == INVALID_NODE)
                return;

            var node = _nodes[nodeIndex];
            var entry = _entries[node.EntryIndex];
            var entryPos = entry.Position;

            // Check if this point is within radius
            float distSq = math.distancesq(center, entryPos);
            if (distSq <= radiusSq)
            {
                results.Add(entry.Entity);
            }

            // Check which sides to search
            byte axis = node.SplitAxis;
            float splitValue = GetAxisValue(in entryPos, axis);
            float queryValue = GetAxisValue(in center, axis);
            float axisDist = math.abs(queryValue - splitValue);

            // Always search the side containing the query point
            if (queryValue < splitValue)
            {
                QueryRadiusRecursive(node.Left, center, radiusSq, results);
                // Only search far side if splitting plane intersects query sphere
                if (axisDist <= radiusSq)
                    QueryRadiusRecursive(node.Right, center, radiusSq, results);
            }
            else
            {
                QueryRadiusRecursive(node.Right, center, radiusSq, results);
                if (axisDist <= radiusSq)
                    QueryRadiusRecursive(node.Left, center, radiusSq, results);
            }
        }

        /// <summary>
        /// Clear the tree
        /// </summary>
        public void Clear()
        {
            _root = INVALID_NODE;
            _count = 0;
        }

        /// <summary>
        /// Dispose native collections
        /// </summary>
        public void Dispose()
        {
            if (_nodes.IsCreated)
                _nodes.Dispose();

            if (_entries.IsCreated)
                _entries.Dispose();

            _isCreated = false;
        }
    }
}
