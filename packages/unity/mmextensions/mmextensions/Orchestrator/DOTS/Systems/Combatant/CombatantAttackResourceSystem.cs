using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Optimized system for combatants to detect and attack resources.
    /// Uses HYBRID approach: QuadTree for spatial filtering + KD-Tree for exact nearest neighbor!
    ///
    /// Two-stage optimization:
    /// 1. QuadTree.QueryRadius() - O(log N) spatial filtering to get nearby entities
    /// 2. Filter for resources only
    /// 3. KD-Tree.FindNearest() - O(log K) to find nearest from filtered set (K << N)
    ///
    /// This is better than either alone:
    /// - QuadTree alone: Returns ALL nearby entities, requires manual distance sorting
    /// - KD-Tree alone: Searches entire world, returns nearest entity (might not be a resource)
    /// - BOTH together: Spatial filter + exact nearest = best of both worlds!
    ///
    /// Uses Combatant.State for movement control (MoveToDestinationSystem handles state-based movement).
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CombatantAttackResourceSystem : ISystem
    {
        [BurstCompile]
        private partial struct FindAndAttackResourcesJob : IJobEntity
        {
            // Dynamic QuadTree for moving entities (combatants, players)
            [ReadOnly] public QuadTree2D DynamicQuadTree;

            // Static QuadTree for non-moving entities (resources, structures)
            [ReadOnly] public QuadTree2D StaticQuadTree;

            // KD-Tree for O(log K) exact nearest neighbor from filtered set
            [ReadOnly] public KDTree2D KDTree;

            // Component lookups for checking resource status
            [ReadOnly] public ComponentLookup<Resource> ResourceLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> TransformLookup;

            private void Execute(
                ref Combatant combatant,
                in LocalTransform transform)
            {
                // Skip if combatant is dead
                if (combatant.Data.IsDead)
                    return;

                // Attack range is smaller than detection range
                float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);

                // DUAL QUADTREE + KD-TREE APPROACH: Query both static and dynamic trees
                // Step 1: Query STATIC QuadTree for resources/structures
                var nearbyStatic = new NativeList<Entity>(Allocator.Temp);
                StaticQuadTree.QueryRadius(transform.Position.xy, combatant.Data.DetectionRange, nearbyStatic);

                // Step 2: Query DYNAMIC QuadTree for other combatants (future PvP support)
                var nearbyDynamic = new NativeList<Entity>(Allocator.Temp);
                DynamicQuadTree.QueryRadius(transform.Position.xy, combatant.Data.DetectionRange, nearbyDynamic);

                // Combine results (for now, we only care about static resources)
                var nearbyEntities = nearbyStatic;

                // Early exit if no nearby entities
                if (nearbyEntities.Length == 0)
                {
                    nearbyEntities.Dispose();
                    nearbyDynamic.Dispose();
                    // No entities nearby, return to idle
                    if (combatant.Data.State == CombatantState.Attacking ||
                        combatant.Data.State == CombatantState.Chasing)
                    {
                        combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                    }
                    return;
                }

                // Step 2: Filter QuadTree results to only include valid resources
                // Build a temporary list of resource positions for KD-Tree
                var resourcePositions = new NativeList<KDTreeEntry>(nearbyEntities.Length, Allocator.Temp);
                for (int i = 0; i < nearbyEntities.Length; i++)
                {
                    var entity = nearbyEntities[i];

                    // Only include resources
                    if (!ResourceLookup.HasComponent(entity))
                        continue;

                    var resource = ResourceLookup[entity];

                    // Skip depleted resources
                    if (resource.Data.IsDepleted)
                        continue;

                    // Get resource position
                    if (TransformLookup.TryGetComponent(entity, out var resourceTransform))
                    {
                        resourcePositions.Add(new KDTreeEntry
                        {
                            Entity = entity,
                            Position = resourceTransform.Position.xy
                        });
                    }
                }

                nearbyEntities.Dispose();
                nearbyDynamic.Dispose();

                // Step 3: Use KD-Tree to find NEAREST resource from filtered set
                // For small sets (<10), use linear search; for larger sets, build temp KD-Tree
                Entity nearestResource = Entity.Null;
                float nearestDistanceSq = float.MaxValue;

                if (resourcePositions.Length > 0)
                {
                    if (resourcePositions.Length <= 10)
                    {
                        // Linear search for small sets (faster than KD-Tree overhead)
                        for (int i = 0; i < resourcePositions.Length; i++)
                        {
                            float distSq = math.distancesq(transform.Position.xy, resourcePositions[i].Position);
                            if (distSq < nearestDistanceSq)
                            {
                                nearestDistanceSq = distSq;
                                nearestResource = resourcePositions[i].Entity;
                            }
                        }
                    }
                    else
                    {
                        // KD-Tree for larger sets (O(log K) vs O(K))
                        var tempKDTree = new KDTree2D(resourcePositions.Length, Allocator.Temp);
                        tempKDTree.Build(resourcePositions.AsArray());
                        tempKDTree.FindNearest(transform.Position.xy, out nearestResource, out nearestDistanceSq);
                        tempKDTree.Dispose();
                    }

                    resourcePositions.Dispose();

                    // Calculate actual distance
                    float distance = math.sqrt(nearestDistanceSq);

                    // Update combatant state based on distance to nearest resource
                    if (distance <= attackRange)
                    {
                        // CRITICAL: Only attack when RIGHT NEXT TO the resource
                        // MoveToDestinationSystem will automatically stop movement when State == Attacking
                        if (combatant.Data.State != CombatantState.Attacking)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Attacking);
                        }
                    }
                    else if (distance <= combatant.Data.DetectionRange)
                    {
                        // Resource detected but NOT in attack range yet
                        // MoveToDestinationSystem will automatically move when State == Chasing
                        if (combatant.Data.State == CombatantState.Idle ||
                            combatant.Data.State == CombatantState.Patrolling)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Chasing);
                        }
                    }
                    else
                    {
                        // Nearest resource is outside detection range (shouldn't happen due to QuadTree filter)
                        if (combatant.Data.State == CombatantState.Attacking ||
                            combatant.Data.State == CombatantState.Chasing)
                        {
                            combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                        }
                    }
                }
                else
                {
                    resourcePositions.Dispose();
                    // No resources found in filtered set, return to idle
                    if (combatant.Data.State == CombatantState.Attacking ||
                        combatant.Data.State == CombatantState.Chasing)
                    {
                        combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                    }
                }
            }
        }

        private EntityQuery _spatialSystemQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Create query for spatial system singleton (has BOTH QuadTrees + KD-Tree)
            _spatialSystemQuery = SystemAPI.QueryBuilder()
                .WithAll<QuadTreeSingleton, StaticQuadTreeSingleton, KDTreeSingleton, SpatialSystemTag>()
                .Build();

            // Require spatial systems to exist before running
            state.RequireForUpdate(_spatialSystemQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Get all spatial structures from singletons
            var dynamicQuadTreeSingleton = SystemAPI.GetSingleton<QuadTreeSingleton>();
            var staticQuadTreeSingleton = SystemAPI.GetSingleton<StaticQuadTreeSingleton>();
            var kdTreeSingleton = SystemAPI.GetSingleton<KDTreeSingleton>();

            // Skip if any spatial system not ready
            if (!dynamicQuadTreeSingleton.IsValid || !staticQuadTreeSingleton.IsValid || !kdTreeSingleton.IsValid)
                return;

            var job = new FindAndAttackResourcesJob
            {
                DynamicQuadTree = dynamicQuadTreeSingleton.QuadTree,
                StaticQuadTree = staticQuadTreeSingleton.QuadTree,
                KDTree = kdTreeSingleton.KDTree,
                ResourceLookup = SystemAPI.GetComponentLookup<Resource>(true),
                TransformLookup = SystemAPI.GetComponentLookup<LocalToWorld>(true)
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);
        }
    }
}