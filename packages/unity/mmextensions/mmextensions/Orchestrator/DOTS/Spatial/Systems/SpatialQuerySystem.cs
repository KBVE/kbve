using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Jobs;
using KBVE.MMExtensions.Orchestrator.DOTS.Utilities;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial
{
    /// <summary>
    /// Handles spatial queries for minions using advanced KDTree and priority heaps
    /// Provides efficient k-nearest neighbor and range queries
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(SpatialIndexingSystem))]
    public partial class SpatialQuerySystem : SystemBase
    {
        private SpatialIndexingSystem _spatialIndexing;
        private EntityQuery _queryRequestsQuery;

        protected override void OnCreate()
        {
            _spatialIndexing = World.GetOrCreateSystemManaged<SpatialIndexingSystem>();

            _queryRequestsQuery = GetEntityQuery(
                ComponentType.ReadWrite<DynamicBuffer<SpatialQueryResult>>(),
                ComponentType.ReadOnly<SpatialQueryRequest>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            RequireForUpdate(_queryRequestsQuery);
        }

        protected override void OnUpdate()
        {
            var kdTree = _spatialIndexing.GetKDTree();

            if (!kdTree.IsBuilt || kdTree.EntryCount == 0)
                return;

            // Process different types of spatial queries
            ProcessRangeQueries(kdTree);
            ProcessKNearestQueries(kdTree);
            ProcessClosestEnemyQueries(kdTree);
        }

        /// <summary>
        /// Process range-based spatial queries (all entities within radius)
        /// </summary>
        private void ProcessRangeQueries(KDTreeAdvanced kdTree)
        {
            Entities
                .WithName("ProcessRangeQueries")
                .WithAll<SpatialQueryRequest>()
                .WithoutBurst() // NativePriorityHeap allocation
                .ForEach((Entity entity,
                    ref DynamicBuffer<SpatialQueryResult> results,
                    in SpatialQueryRequest request,
                    in SpatialPosition position) =>
                {
                    if (request.Type != QueryType.AllInRadius && request.Type != QueryType.AOETargets)
                        return;

                    results.Clear();

                    // Use priority heap for efficient range queries
                    var heap = new NativePriorityHeap<SpatialHeapEntry>(
                        math.min(request.MaxResults, 100),
                        Allocator.Temp,
                        HeapComparison.Min
                    );

                    kdTree.GetEntriesInRangeWithHeap(position.Position, request.QueryRadius, ref heap);

                    // Convert heap results to query results
                    while (!heap.IsEmpty)
                    {
                        var entry = heap.Pop();
                        results.Add(new SpatialQueryResult
                        {
                            TargetEntity = entry.Entity,
                            Distance = math.sqrt(entry.DistanceSquared),
                            Position = entry.Position
                        });
                    }

                    heap.Dispose();
                })
                .Run();
        }

        /// <summary>
        /// Process k-nearest neighbor queries
        /// </summary>
        private void ProcessKNearestQueries(KDTreeAdvanced kdTree)
        {
            Entities
                .WithName("ProcessKNearestQueries")
                .WithAll<SpatialQueryRequest>()
                .WithoutBurst() // NativePriorityHeap allocation
                .ForEach((Entity entity,
                    ref DynamicBuffer<SpatialQueryResult> results,
                    in SpatialQueryRequest request,
                    in SpatialPosition position) =>
                {
                    if (request.Type != QueryType.Nearest)
                        return;

                    results.Clear();

                    // Use max heap for k-nearest neighbors (keeps closest k)
                    var heap = new NativePriorityHeap<SpatialHeapEntry>(
                        request.MaxResults,
                        Allocator.Temp,
                        HeapComparison.Max
                    );

                    kdTree.GetKNearestNeighbors(position.Position, request.MaxResults, ref heap);

                    // Convert heap results to query results (sorted by distance)
                    var tempResults = new NativeList<SpatialHeapEntry>(heap.Count, Allocator.Temp);

                    while (!heap.IsEmpty)
                    {
                        tempResults.Add(heap.Pop());
                    }

                    // Add results in ascending distance order
                    for (int i = tempResults.Length - 1; i >= 0; i--)
                    {
                        var entry = tempResults[i];
                        results.Add(new SpatialQueryResult
                        {
                            TargetEntity = entry.Entity,
                            Distance = math.sqrt(entry.DistanceSquared),
                            Position = entry.Position
                        });
                    }

                    heap.Dispose();
                    tempResults.Dispose();
                })
                .Run();
        }

        /// <summary>
        /// Process closest enemy/ally queries with faction filtering
        /// </summary>
        private void ProcessClosestEnemyQueries(KDTreeAdvanced kdTree)
        {
            var minionDataLookup = SystemAPI.GetComponentLookup<MinionData>(true);

            Entities
                .WithName("ProcessClosestEnemyQueries")
                .WithAll<SpatialQueryRequest>()
                .WithReadOnly(minionDataLookup)
                .WithoutBurst() // NativePriorityHeap allocation
                .ForEach((Entity entity,
                    ref DynamicBuffer<SpatialQueryResult> results,
                    in SpatialQueryRequest request,
                    in SpatialPosition position,
                    in MinionData minion) =>
                {
                    if (request.Type != QueryType.ClosestEnemy && request.Type != QueryType.ClosestAlly)
                        return;

                    results.Clear();

                    // Find all entities in range first
                    var rangeResults = new NativeList<Entry>(Allocator.Temp);
                    kdTree.GetEntriesInRange(position.Position, request.QueryRadius, rangeResults);

                    Entity closestEntity = Entity.Null;
                    float closestDistanceSq = float.MaxValue;
                    float3 closestPosition = float3.zero;

                    // Filter by faction and find closest
                    foreach (var entry in rangeResults)
                    {
                        if (entry.Entity == entity) continue; // Skip self

                        if (minionDataLookup.HasComponent(entry.Entity))
                        {
                            var targetMinion = minionDataLookup[entry.Entity];
                            bool isValidTarget = false;

                            if (request.Type == QueryType.ClosestEnemy)
                            {
                                isValidTarget = IsHostileFaction(minion.Faction, targetMinion.Faction);
                            }
                            else if (request.Type == QueryType.ClosestAlly)
                            {
                                isValidTarget = IsAlliedFaction(minion.Faction, targetMinion.Faction);
                            }

                            if (isValidTarget)
                            {
                                float distSq = math.distancesq(position.Position, entry.Position);
                                if (distSq < closestDistanceSq)
                                {
                                    closestDistanceSq = distSq;
                                    closestEntity = entry.Entity;
                                    closestPosition = entry.Position;
                                }
                            }
                        }
                    }

                    // Add result if found
                    if (closestEntity != Entity.Null)
                    {
                        results.Add(new SpatialQueryResult
                        {
                            TargetEntity = closestEntity,
                            Distance = math.sqrt(closestDistanceSq),
                            Position = closestPosition
                        });
                    }

                    rangeResults.Dispose();
                })
                .Run();
        }

        private static bool IsHostileFaction(FactionType source, FactionType target)
        {
            return (source, target) switch
            {
                (FactionType.Player, FactionType.Enemy) => true,
                (FactionType.Player, FactionType.Undead) => true,
                (FactionType.Player, FactionType.Demon) => true,
                (FactionType.Enemy, FactionType.Player) => true,
                (FactionType.Enemy, FactionType.Ally) => true,
                (FactionType.Ally, FactionType.Enemy) => true,
                (FactionType.Ally, FactionType.Undead) => true,
                (FactionType.Ally, FactionType.Demon) => true,
                _ => false
            };
        }

        private static bool IsAlliedFaction(FactionType source, FactionType target)
        {
            return (source, target) switch
            {
                (FactionType.Player, FactionType.Ally) => true,
                (FactionType.Ally, FactionType.Player) => true,
                (FactionType.Enemy, FactionType.Undead) => true,
                (FactionType.Enemy, FactionType.Demon) => true,
                (FactionType.Undead, FactionType.Enemy) => true,
                (FactionType.Demon, FactionType.Enemy) => true,
                _ => source == target && source != FactionType.Neutral
            };
        }
    }

    /// <summary>
    /// System for processing high-priority spatial queries in jobs
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(SpatialQuerySystem))]
    public partial class HighPrioritySpatialQuerySystem : SystemBase
    {
        private SpatialIndexingSystem _spatialIndexing;

        protected override void OnCreate()
        {
            _spatialIndexing = World.GetOrCreateSystemManaged<SpatialIndexingSystem>();
        }

        protected override void OnUpdate()
        {
            var kdTree = _spatialIndexing.GetKDTree();

            if (!kdTree.IsBuilt)
                return;

            // Process urgent queries (boss AI, player targeting, etc.)
            // These run without burst for complex faction logic
            Entities
                .WithName("ProcessHighPriorityQueries")
                .WithAll<HighPrioritySpatialQuery>()
                .WithoutBurst()
                .ForEach((Entity entity,
                    ref DynamicBuffer<SpatialQueryResult> results,
                    in SpatialQueryRequest request,
                    in SpatialPosition position) =>
                {
                    results.Clear();

                    // High-priority queries get more comprehensive search
                    var heap = new NativePriorityHeap<SpatialHeapEntry>(
                        math.min(request.MaxResults * 2, 200),
                        Allocator.Temp,
                        HeapComparison.Min
                    );

                    kdTree.GetEntriesInRangeWithHeap(position.Position, request.QueryRadius, ref heap);

                    while (!heap.IsEmpty && results.Length < request.MaxResults)
                    {
                        var entry = heap.Pop();
                        results.Add(new SpatialQueryResult
                        {
                            TargetEntity = entry.Entity,
                            Distance = math.sqrt(entry.DistanceSquared),
                            Position = entry.Position
                        });
                    }

                    heap.Dispose();
                })
                .Run();
        }
    }

    /// <summary>
    /// Tag component for high-priority spatial queries (bosses, players, etc.)
    /// </summary>
    public struct HighPrioritySpatialQuery : IComponentData
    {
        public float Priority; // Higher values = more urgent
        public bool RequiresLineOfSight;
    }
}