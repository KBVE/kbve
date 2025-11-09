using System;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Entities;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Entry for 2D QuadTree containing entity and position data
    /// </summary>
    public struct QuadTreeEntry : IEquatable<QuadTreeEntry>
    {
        public Entity Entity;
        public float2 Position;
        public float Radius; // For circle-based queries

        public bool Equals(QuadTreeEntry other)
        {
            return Entity.Equals(other.Entity) && Position.Equals(other.Position);
        }

        public override int GetHashCode()
        {
            return (int)math.hash(new uint3((uint)Entity.Index, (uint)Entity.Version, math.hash(Position)));
        }
    }

    /// <summary>
    /// 2D axis-aligned bounding box for QuadTree
    /// </summary>
    public struct AABB2D
    {
        public float2 Min;
        public float2 Max;

        public AABB2D(float2 center, float2 size)
        {
            var halfSize = size * 0.5f;
            Min = center - halfSize;
            Max = center + halfSize;
        }

        public float2 Center => (Min + Max) * 0.5f;
        public float2 Size => Max - Min;

        public bool Contains(float2 point)
        {
            return point.x >= Min.x && point.x <= Max.x &&
                   point.y >= Min.y && point.y <= Max.y;
        }

        public bool Intersects(AABB2D other)
        {
            return !(other.Min.x > Max.x || other.Max.x < Min.x ||
                     other.Min.y > Max.y || other.Max.y < Min.y);
        }

        public bool IntersectsCircle(float2 center, float radius)
        {
            var closest = math.clamp(center, Min, Max);
            var distance = math.distance(center, closest);
            return distance <= radius;
        }
    }

    /// <summary>
    /// High-performance 2D QuadTree for spatial entity queries in 2D games.
    /// Optimized for fast insertion, removal, and range queries.
    /// </summary>
    [BurstCompile]
    public struct QuadTree2D : IDisposable
    {
        private NativeArray<QuadTreeNode> _nodes;
        private NativeList<QuadTreeEntry> _entries;
        private AABB2D _bounds;
        private int _maxDepth;
        private int _maxEntriesPerNode;
        private int _rootNodeIndex;
        private int _nextFreeNodeIndex; // Track next available node for O(1) allocation
        private bool _isCreated;

        private const int INVALID_NODE = -1;

        public QuadTree2D(AABB2D bounds, int maxDepth = 8, int maxEntriesPerNode = 16, Allocator allocator = Allocator.Persistent)
        {
            _bounds = bounds;
            _maxDepth = maxDepth;
            _maxEntriesPerNode = maxEntriesPerNode;
            _isCreated = true;

            // Estimate node count: 4^0 + 4^1 + ... + 4^maxDepth
            var maxNodes = (int)((math.pow(4, maxDepth + 1) - 1) / 3);
            _nodes = new NativeArray<QuadTreeNode>(maxNodes, allocator);
            _entries = new NativeList<QuadTreeEntry>(allocator);

            // Create root node
            _rootNodeIndex = 0;
            _nextFreeNodeIndex = 1; // Start allocating from index 1 (0 is root)
            _nodes[0] = new QuadTreeNode
            {
                Bounds = bounds,
                IsLeaf = true,
                FirstEntryIndex = -1,
                EntryCount = 0,
                FirstChildIndex = INVALID_NODE
            };
        }

        public bool IsCreated => _isCreated;

        /// <summary>
        /// Insert an entity into the QuadTree
        /// </summary>
        public void Insert(Entity entity, float2 position, float radius = 0f)
        {
            if (!_bounds.Contains(position))
                return; // Outside bounds

            var entry = new QuadTreeEntry
            {
                Entity = entity,
                Position = position,
                Radius = radius
            };

            InsertEntry(_rootNodeIndex, entry, 0);
        }

        /// <summary>
        /// Remove an entity from the QuadTree
        /// </summary>
        public bool Remove(Entity entity, float2 position)
        {
            return RemoveEntry(_rootNodeIndex, entity, position);
        }

        /// <summary>
        /// Query entities within a circular radius
        /// </summary>
        public void QueryRadius(float2 center, float radius, NativeList<Entity> results)
        {
            results.Clear();
            QueryRadiusRecursive(_rootNodeIndex, center, radius, results);
        }

        /// <summary>
        /// Query entities within a rectangular area
        /// </summary>
        public void QueryRectangle(AABB2D area, NativeList<Entity> results)
        {
            results.Clear();
            QueryRectangleRecursive(_rootNodeIndex, area, results);
        }

        /// <summary>
        /// Find the nearest entity to a given position
        /// </summary>
        public Entity FindNearest(float2 position, out float distance)
        {
            distance = float.MaxValue;
            var nearest = Entity.Null;
            FindNearestRecursive(_rootNodeIndex, position, ref nearest, ref distance);
            return nearest;
        }

        /// <summary>
        /// Clear all entries from the QuadTree
        /// </summary>
        public void Clear()
        {
            _entries.Clear();

            // Reset root node
            var rootNode = _nodes[_rootNodeIndex];
            rootNode.IsLeaf = true;
            rootNode.FirstEntryIndex = -1;
            rootNode.EntryCount = 0;
            rootNode.FirstChildIndex = INVALID_NODE;
            _nodes[_rootNodeIndex] = rootNode;

            // Reset free node tracking for next build
            _nextFreeNodeIndex = 1;
        }

        private void InsertEntry(int nodeIndex, QuadTreeEntry entry, int depth)
        {
            var node = _nodes[nodeIndex];

            if (node.IsLeaf)
            {
                // Add to leaf node
                if (node.EntryCount < _maxEntriesPerNode || depth >= _maxDepth)
                {
                    // Add entry to this node
                    if (node.FirstEntryIndex == -1)
                    {
                        node.FirstEntryIndex = _entries.Length;
                    }

                    _entries.Add(entry);
                    node.EntryCount++;
                    _nodes[nodeIndex] = node;
                }
                else
                {
                    // Split the node
                    SplitNode(nodeIndex);
                    InsertEntry(nodeIndex, entry, depth);
                }
            }
            else
            {
                // Find appropriate child and insert
                var childIndex = GetChildIndex(nodeIndex, entry.Position);
                if (childIndex != INVALID_NODE)
                {
                    InsertEntry(childIndex, entry, depth + 1);
                }
            }
        }

        private void SplitNode(int nodeIndex)
        {
            var node = _nodes[nodeIndex];
            if (!node.IsLeaf) return;

            var bounds = node.Bounds;
            var center = bounds.Center;
            var halfSize = bounds.Size * 0.5f;

            // Create four child nodes
            var firstChildIndex = GetNextAvailableNodeIndex();

            // SAFETY CHECK: If QuadTree is out of capacity, don't split
            // This prevents index out of range errors when the tree is full
            if (firstChildIndex == INVALID_NODE)
            {
                // QuadTree is at capacity - can't split further
                // Entity will stay in this leaf node even if it exceeds MaxEntitiesPerNode
                // PERFORMANCE WARNING: This will degrade query performance as leaf nodes become overcrowded
                // Consider increasing MaxQuadTreeDepth in SpatialSystemConfig or reducing entity count
                // NOTE: Cannot log from Burst job - use Unity Profiler to detect degraded performance
                return;
            }

            node.FirstChildIndex = firstChildIndex;
            node.IsLeaf = false;

            // Create child nodes directly (Burst-compatible)
            // Top-right (TR)
            _nodes[firstChildIndex + 0] = new QuadTreeNode
            {
                Bounds = new AABB2D(new float2(center.x + halfSize.x * 0.5f, center.y + halfSize.y * 0.5f), halfSize),
                IsLeaf = true,
                FirstEntryIndex = -1,
                EntryCount = 0,
                FirstChildIndex = INVALID_NODE
            };

            // Top-left (TL)
            _nodes[firstChildIndex + 1] = new QuadTreeNode
            {
                Bounds = new AABB2D(new float2(center.x - halfSize.x * 0.5f, center.y + halfSize.y * 0.5f), halfSize),
                IsLeaf = true,
                FirstEntryIndex = -1,
                EntryCount = 0,
                FirstChildIndex = INVALID_NODE
            };

            // Bottom-left (BL)
            _nodes[firstChildIndex + 2] = new QuadTreeNode
            {
                Bounds = new AABB2D(new float2(center.x - halfSize.x * 0.5f, center.y - halfSize.y * 0.5f), halfSize),
                IsLeaf = true,
                FirstEntryIndex = -1,
                EntryCount = 0,
                FirstChildIndex = INVALID_NODE
            };

            // Bottom-right (BR)
            _nodes[firstChildIndex + 3] = new QuadTreeNode
            {
                Bounds = new AABB2D(new float2(center.x + halfSize.x * 0.5f, center.y - halfSize.y * 0.5f), halfSize),
                IsLeaf = true,
                FirstEntryIndex = -1,
                EntryCount = 0,
                FirstChildIndex = INVALID_NODE
            };

            // Redistribute entries to children
            if (node.FirstEntryIndex != -1)
            {
                for (int i = 0; i < node.EntryCount; i++)
                {
                    var entry = _entries[node.FirstEntryIndex + i];
                    var childIndex = GetChildIndex(nodeIndex, entry.Position);
                    if (childIndex != INVALID_NODE)
                    {
                        InsertEntry(childIndex, entry, 0); // Depth doesn't matter for redistribution
                    }
                }
            }

            // Clear entries from this node
            node.FirstEntryIndex = -1;
            node.EntryCount = 0;
            _nodes[nodeIndex] = node;
        }

        private int GetChildIndex(int nodeIndex, float2 position)
        {
            var node = _nodes[nodeIndex];
            if (node.IsLeaf || node.FirstChildIndex == INVALID_NODE)
                return INVALID_NODE;

            var center = node.Bounds.Center;
            var childOffset = 0;

            if (position.x >= center.x) childOffset += 1; // Right
            if (position.y < center.y) childOffset += 2;  // Bottom

            // Adjust for our quadrant layout: TR, TL, BL, BR (Burst-compatible)
            // Manual mapping instead of array: TL=1, TR=0, BL=2, BR=3
            int quadrantIndex;
            switch (childOffset)
            {
                case 0: quadrantIndex = 1; break; // TL
                case 1: quadrantIndex = 0; break; // TR
                case 2: quadrantIndex = 2; break; // BL
                case 3: quadrantIndex = 3; break; // BR
                default: quadrantIndex = 0; break;
            }

            return node.FirstChildIndex + quadrantIndex;
        }

        private bool RemoveEntry(int nodeIndex, Entity entity, float2 position)
        {
            var node = _nodes[nodeIndex];

            if (node.IsLeaf)
            {
                // Search in leaf node
                if (node.FirstEntryIndex != -1)
                {
                    for (int i = 0; i < node.EntryCount; i++)
                    {
                        var entryIndex = node.FirstEntryIndex + i;
                        if (entryIndex < _entries.Length && _entries[entryIndex].Entity.Equals(entity))
                        {
                            // Remove by swapping with last entry
                            _entries.RemoveAtSwapBack(entryIndex);
                            node.EntryCount--;
                            _nodes[nodeIndex] = node;
                            return true;
                        }
                    }
                }
            }
            else
            {
                // Recurse to appropriate child
                var childIndex = GetChildIndex(nodeIndex, position);
                if (childIndex != INVALID_NODE)
                {
                    return RemoveEntry(childIndex, entity, position);
                }
            }

            return false;
        }

        private void QueryRadiusRecursive(int nodeIndex, float2 center, float radius, NativeList<Entity> results)
        {
            if (nodeIndex == INVALID_NODE) return;

            var node = _nodes[nodeIndex];

            // Check if circle intersects node bounds
            if (!node.Bounds.IntersectsCircle(center, radius))
                return;

            if (node.IsLeaf)
            {
                // Check entries in leaf node
                if (node.FirstEntryIndex != -1)
                {
                    for (int i = 0; i < node.EntryCount; i++)
                    {
                        var entryIndex = node.FirstEntryIndex + i;
                        if (entryIndex < _entries.Length)
                        {
                            var entry = _entries[entryIndex];
                            var distance = math.distance(center, entry.Position);
                            if (distance <= radius + entry.Radius)
                            {
                                results.Add(entry.Entity);
                            }
                        }
                    }
                }
            }
            else
            {
                // Recurse to children
                if (node.FirstChildIndex != INVALID_NODE)
                {
                    for (int i = 0; i < 4; i++)
                    {
                        QueryRadiusRecursive(node.FirstChildIndex + i, center, radius, results);
                    }
                }
            }
        }

        private void QueryRectangleRecursive(int nodeIndex, AABB2D area, NativeList<Entity> results)
        {
            if (nodeIndex == INVALID_NODE) return;

            var node = _nodes[nodeIndex];

            if (!node.Bounds.Intersects(area))
                return;

            if (node.IsLeaf)
            {
                if (node.FirstEntryIndex != -1)
                {
                    for (int i = 0; i < node.EntryCount; i++)
                    {
                        var entryIndex = node.FirstEntryIndex + i;
                        if (entryIndex < _entries.Length)
                        {
                            var entry = _entries[entryIndex];
                            if (area.Contains(entry.Position))
                            {
                                results.Add(entry.Entity);
                            }
                        }
                    }
                }
            }
            else
            {
                if (node.FirstChildIndex != INVALID_NODE)
                {
                    for (int i = 0; i < 4; i++)
                    {
                        QueryRectangleRecursive(node.FirstChildIndex + i, area, results);
                    }
                }
            }
        }

        private void FindNearestRecursive(int nodeIndex, float2 position, ref Entity nearest, ref float minDistance)
        {
            if (nodeIndex == INVALID_NODE) return;

            var node = _nodes[nodeIndex];

            // Early exit if this node can't contain anything closer
            var nodeDistance = math.distance(position, node.Bounds.Center) -
                              math.length(node.Bounds.Size) * 0.5f;
            if (nodeDistance > minDistance)
                return;

            if (node.IsLeaf)
            {
                if (node.FirstEntryIndex != -1)
                {
                    for (int i = 0; i < node.EntryCount; i++)
                    {
                        var entryIndex = node.FirstEntryIndex + i;
                        if (entryIndex < _entries.Length)
                        {
                            var entry = _entries[entryIndex];
                            var distance = math.distance(position, entry.Position);
                            if (distance < minDistance)
                            {
                                minDistance = distance;
                                nearest = entry.Entity;
                            }
                        }
                    }
                }
            }
            else
            {
                if (node.FirstChildIndex != INVALID_NODE)
                {
                    for (int i = 0; i < 4; i++)
                    {
                        FindNearestRecursive(node.FirstChildIndex + i, position, ref nearest, ref minDistance);
                    }
                }
            }
        }

        private int GetNextAvailableNodeIndex()
        {
            // O(1) node allocation using simple counter
            // When Clear() is called, _nextFreeNodeIndex resets to 1
            if (_nextFreeNodeIndex + 4 <= _nodes.Length) // Need 4 nodes for quad split
            {
                int index = _nextFreeNodeIndex;
                _nextFreeNodeIndex += 4; // Reserve 4 nodes for children
                return index;
            }
            return INVALID_NODE; // Out of capacity
        }

        public void Dispose()
        {
            if (_isCreated)
            {
                if (_nodes.IsCreated) _nodes.Dispose();
                if (_entries.IsCreated) _entries.Dispose();
                _isCreated = false;
            }
        }

        private struct QuadTreeNode
        {
            public AABB2D Bounds;
            public bool IsLeaf;
            public int FirstEntryIndex;
            public int EntryCount;
            public int FirstChildIndex;
        }
    }
}