using System;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Entities;
using Unity.Burst;
using Unity.Jobs;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Static utility class providing high-level spatial query operations.
    /// Wraps the low-level QuadTree and FlowField operations with convenient APIs.
    /// </summary>
    [BurstCompile]
    public static class SpatialQueryUtilities
    {
        /// <summary>
        /// Find all entities within a circular radius from a center point
        /// </summary>
        public static void GetEntitiesInRadius(QuadTree2D quadTree, float2 center, float radius,
            NativeList<Entity> results, uint layerMask = uint.MaxValue)
        {
            results.Clear();
            quadTree.QueryRadius(center, radius, results);

            // TODO: Filter by layer mask if needed
            if (layerMask != uint.MaxValue)
            {
                FilterByLayerMask(results, layerMask);
            }
        }

        /// <summary>
        /// Find all entities within a rectangular area
        /// </summary>
        public static void GetEntitiesInRectangle(QuadTree2D quadTree, float2 center, float2 size,
            NativeList<Entity> results, uint layerMask = uint.MaxValue)
        {
            var bounds = new AABB2D(center, size);
            results.Clear();
            quadTree.QueryRectangle(bounds, results);

            if (layerMask != uint.MaxValue)
            {
                FilterByLayerMask(results, layerMask);
            }
        }

        /// <summary>
        /// Find the nearest entity to a given position
        /// </summary>
        public static Entity FindNearestEntity(QuadTree2D quadTree, float2 position, out float distance,
            uint layerMask = uint.MaxValue)
        {
            var nearest = quadTree.FindNearest(position, out distance);

            // TODO: Verify layer mask matches if needed
            return nearest;
        }

        /// <summary>
        /// Find the K nearest entities to a position
        /// </summary>
        public static void FindKNearestEntities(QuadTree2D quadTree, float2 position, int k,
            NativeList<EntityDistance> results, uint layerMask = uint.MaxValue)
        {
            results.Clear();

            // Use a priority heap to efficiently find K nearest
            var heap = new NativePriorityHeap<EntityDistance>(k * 2, Allocator.Temp);
            var tempResults = new NativeList<Entity>(Allocator.Temp);

            // Query a reasonable radius to start with
            var searchRadius = 10f;
            var attempts = 0;
            const int maxAttempts = 5;

            while (attempts < maxAttempts && results.Length < k)
            {
                tempResults.Clear();
                quadTree.QueryRadius(position, searchRadius, tempResults);

                // Calculate distances and add to heap
                for (int i = 0; i < tempResults.Length; i++)
                {
                    var entity = tempResults[i];

                    // TODO: Get actual entity position for accurate distance
                    // For now, assume the entity is at the query position
                    var distance = 0f; // This should be calculated from entity's actual position

                    var entityDistance = new EntityDistance
                    {
                        Entity = entity,
                        Distance = distance
                    };

                    if (!heap.IsFull)
                    {
                        heap.Push(entityDistance);
                    }
                    else if (distance < heap.Peek().Distance)
                    {
                        heap.Pop();
                        heap.Push(entityDistance);
                    }
                }

                // If we don't have enough results, expand search radius
                if (tempResults.Length < k)
                {
                    searchRadius *= 2f;
                }

                attempts++;
            }

            // Extract results from heap
            while (!heap.IsEmpty && results.Length < k)
            {
                results.Add(heap.Pop());
            }

            heap.Dispose();
            tempResults.Dispose();
        }

        /// <summary>
        /// Check if a position is clear of obstacles (useful for pathfinding)
        /// </summary>
        public static bool IsPositionClear(QuadTree2D quadTree, float2 position, float clearanceRadius,
            uint obstacleLayerMask = 1u)
        {
            var tempResults = new NativeList<Entity>(Allocator.Temp);
            quadTree.QueryRadius(position, clearanceRadius, tempResults);

            // Check if any results are obstacles
            var isClear = true;
            for (int i = 0; i < tempResults.Length; i++)
            {
                // TODO: Check if entity has obstacle layer mask
                // For now, assume any entity in the area blocks movement
                isClear = false;
                break;
            }

            tempResults.Dispose();
            return isClear;
        }

        /// <summary>
        /// Get flow field direction for pathfinding at a given position
        /// </summary>
        public static float2 GetFlowDirection(FlowField2D flowField, float2 position, bool useSmoothing = true)
        {
            if (useSmoothing)
            {
                return flowField.GetSmoothFlowDirection(position);
            }
            else
            {
                return flowField.GetFlowDirection(position);
            }
        }

        /// <summary>
        /// Calculate the optimal path cost from start to goal using flow field
        /// </summary>
        public static float CalculatePathCost(FlowField2D flowField, float2 startPos, float2 goalPos)
        {
            if (!flowField.HasPath(startPos, goalPos))
            {
                return float.MaxValue;
            }

            var startGrid = flowField.WorldToGrid(startPos);
            var startCell = flowField.GetCell(startGrid);

            return startCell.DistanceToGoal;
        }

        /// <summary>
        /// Sample multiple points around a position to find the best available location
        /// </summary>
        public static float2 FindBestNearbyPosition(QuadTree2D quadTree, float2 targetPosition,
            float searchRadius, int sampleCount = 8, uint obstacleLayerMask = 1u)
        {
            var bestPosition = targetPosition;
            var bestScore = float.MinValue;

            // Sample positions in a circle around the target
            for (int i = 0; i < sampleCount; i++)
            {
                var angle = (i / (float)sampleCount) * 2f * math.PI;
                var offset = new float2(math.cos(angle), math.sin(angle)) * searchRadius;
                var samplePos = targetPosition + offset;

                // Score this position (higher is better)
                var score = ScorePosition(quadTree, samplePos, targetPosition, obstacleLayerMask);

                if (score > bestScore)
                {
                    bestScore = score;
                    bestPosition = samplePos;
                }
            }

            return bestPosition;
        }

        /// <summary>
        /// Score a position based on distance to target and obstacle avoidance
        /// </summary>
        private static float ScorePosition(QuadTree2D quadTree, float2 position, float2 target, uint obstacleLayerMask)
        {
            // Distance component (closer to target is better)
            var distanceToTarget = math.distance(position, target);
            var distanceScore = 1f / (1f + distanceToTarget);

            // Obstacle avoidance component
            var tempResults = new NativeList<Entity>(Allocator.Temp);
            quadTree.QueryRadius(position, 2f, tempResults);

            var obstacleScore = 1f / (1f + tempResults.Length); // Fewer nearby entities is better

            tempResults.Dispose();

            return distanceScore * 0.7f + obstacleScore * 0.3f;
        }

        /// <summary>
        /// Filter entity list by layer mask (placeholder for future implementation)
        /// </summary>
        private static void FilterByLayerMask(NativeList<Entity> entities, uint layerMask)
        {
            // TODO: Implement layer mask filtering
            // This would require looking up each entity's SpatialIndex component
            // and checking if its LayerMask intersects with the query mask
        }

        /// <summary>
        /// Perform a line-of-sight check between two positions
        /// </summary>
        public static bool HasLineOfSight(QuadTree2D quadTree, float2 start, float2 end,
            float checkRadius = 0.5f, uint obstacleLayerMask = 1u)
        {
            var direction = math.normalize(end - start);
            var distance = math.distance(start, end);
            var stepSize = checkRadius;
            var steps = (int)(distance / stepSize);

            for (int i = 1; i < steps; i++)
            {
                var checkPos = start + direction * (i * stepSize);

                if (!IsPositionClear(quadTree, checkPos, checkRadius, obstacleLayerMask))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Get the spatial bounds that contain all entities in a list
        /// </summary>
        public static AABB2D GetBoundingBox(NativeList<float2> positions)
        {
            if (positions.Length == 0)
            {
                return new AABB2D(float2.zero, float2.zero);
            }

            var min = positions[0];
            var max = positions[0];

            for (int i = 1; i < positions.Length; i++)
            {
                min = math.min(min, positions[i]);
                max = math.max(max, positions[i]);
            }

            var center = (min + max) * 0.5f;
            var size = max - min;

            return new AABB2D(center, size);
        }

        /// <summary>
        /// Generate a set of waypoints for navigation between two points
        /// </summary>
        public static void GenerateWaypoints(FlowField2D flowField, float2 start, float2 goal,
            NativeList<float2> waypoints, float waypointSpacing = 5f)
        {
            waypoints.Clear();

            if (!flowField.HasPath(start, goal))
            {
                return;
            }

            var current = start;
            var maxSteps = 1000; // Prevent infinite loops
            var steps = 0;

            waypoints.Add(start);

            while (math.distance(current, goal) > waypointSpacing && steps < maxSteps)
            {
                var flowDirection = flowField.GetSmoothFlowDirection(current);
                current += flowDirection * waypointSpacing;
                waypoints.Add(current);
                steps++;
            }

            waypoints.Add(goal);
        }
    }

    /// <summary>
    /// Helper struct for storing entity-distance pairs
    /// </summary>
    public struct EntityDistance : IComparable<EntityDistance>
    {
        public Entity Entity;
        public float Distance;

        public int CompareTo(EntityDistance other)
        {
            return Distance.CompareTo(other.Distance);
        }
    }

    /// <summary>
    /// Job for performing spatial queries in parallel
    /// </summary>
    [BurstCompile]
    public struct SpatialQueryJob : IJob
    {
        [ReadOnly] public QuadTree2D QuadTree;
        [ReadOnly] public float2 QueryPosition;
        [ReadOnly] public float QueryRadius;
        public NativeList<Entity> Results;

        public void Execute()
        {
            SpatialQueryUtilities.GetEntitiesInRadius(QuadTree, QueryPosition, QueryRadius, Results);
        }
    }

    /// <summary>
    /// Parallel job for performing multiple spatial queries
    /// </summary>
    [BurstCompile]
    public struct BatchSpatialQueryJob : IJobParallelFor
    {
        [ReadOnly] public QuadTree2D QuadTree;
        [ReadOnly] public NativeArray<float2> QueryPositions;
        [ReadOnly] public NativeArray<float> QueryRadii;
        [WriteOnly] public NativeArray<int> ResultCounts;

        public void Execute(int index)
        {
            var tempResults = new NativeList<Entity>(Allocator.Temp);
            SpatialQueryUtilities.GetEntitiesInRadius(QuadTree, QueryPositions[index], QueryRadii[index], tempResults);
            ResultCounts[index] = tempResults.Length;
            tempResults.Dispose();
        }
    }
}