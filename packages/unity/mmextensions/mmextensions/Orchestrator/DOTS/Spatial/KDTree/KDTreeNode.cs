using Unity.Mathematics;
using Unity.Collections;
using Unity.Entities;
using System;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// KD-Tree node structure for spatial indexing
    /// </summary>
    public struct KDTreeNode
    {
        public float3 Position;
        public Entity Entity;
        public int LeftChild;
        public int RightChild;
        public int ParentIndex;
        public int Depth;
        public byte SplitAxis; // 0=X, 1=Y, 2=Z
        public bool IsLeaf;

        public static KDTreeNode CreateLeaf(Entity entity, float3 position, int parentIndex, int depth)
        {
            return new KDTreeNode
            {
                Entity = entity,
                Position = position,
                LeftChild = -1,
                RightChild = -1,
                ParentIndex = parentIndex,
                Depth = depth,
                SplitAxis = (byte)(depth % 3),
                IsLeaf = true
            };
        }

        public static KDTreeNode CreateInternal(float3 position, int parentIndex, int depth)
        {
            return new KDTreeNode
            {
                Entity = Entity.Null,
                Position = position,
                LeftChild = -1,
                RightChild = -1,
                ParentIndex = parentIndex,
                Depth = depth,
                SplitAxis = (byte)(depth % 3),
                IsLeaf = false
            };
        }
    }

    /// <summary>
    /// KD-Tree structure for efficient spatial queries
    /// </summary>
    public struct KDTree : IDisposable
    {
        public NativeList<KDTreeNode> Nodes;
        public int RootIndex;
        public int NodeCount;
        public float3 BoundsMin;
        public float3 BoundsMax;

        public KDTree(int capacity, Allocator allocator)
        {
            Nodes = new NativeList<KDTreeNode>(capacity, allocator);
            RootIndex = -1;
            NodeCount = 0;
            BoundsMin = new float3(float.MaxValue);
            BoundsMax = new float3(float.MinValue);
        }

        public void Clear()
        {
            Nodes.Clear();
            RootIndex = -1;
            NodeCount = 0;
            BoundsMin = new float3(float.MaxValue);
            BoundsMax = new float3(float.MinValue);
        }

        public void Dispose()
        {
            if (Nodes.IsCreated)
                Nodes.Dispose();
        }

        public void UpdateBounds(float3 position)
        {
            BoundsMin = math.min(BoundsMin, position);
            BoundsMax = math.max(BoundsMax, position);
        }
    }

    /// <summary>
    /// Query result for KD-Tree searches
    /// </summary>
    public struct KDTreeQueryResult
    {
        public Entity Entity;
        public float3 Position;
        public float DistanceSq;

        public float Distance => math.sqrt(DistanceSq);
    }

    /// <summary>
    /// Priority queue for K-nearest neighbor searches
    /// </summary>
    public struct KNNPriorityQueue : IDisposable
    {
        public NativeList<KDTreeQueryResult> Results;
        public int K;
        public float MaxDistanceSq;

        public KNNPriorityQueue(int k, Allocator allocator)
        {
            Results = new NativeList<KDTreeQueryResult>(k, allocator);
            K = k;
            MaxDistanceSq = float.MaxValue;
        }

        public void Add(Entity entity, float3 position, float distanceSq)
        {
            if (Results.Length < K)
            {
                Results.Add(new KDTreeQueryResult
                {
                    Entity = entity,
                    Position = position,
                    DistanceSq = distanceSq
                });

                if (Results.Length == K)
                {
                    // Sort and update max distance
                    Results.Sort(new DistanceComparer());
                    MaxDistanceSq = Results[K - 1].DistanceSq;
                }
            }
            else if (distanceSq < MaxDistanceSq)
            {
                // Replace furthest result
                Results[K - 1] = new KDTreeQueryResult
                {
                    Entity = entity,
                    Position = position,
                    DistanceSq = distanceSq
                };

                Results.Sort(new DistanceComparer());
                MaxDistanceSq = Results[K - 1].DistanceSq;
            }
        }

        public void Dispose()
        {
            if (Results.IsCreated)
                Results.Dispose();
        }
    }

    public struct DistanceComparer : IComparer<KDTreeQueryResult>
    {
        public int Compare(KDTreeQueryResult x, KDTreeQueryResult y)
        {
            return x.DistanceSq.CompareTo(y.DistanceSq);
        }
    }
}