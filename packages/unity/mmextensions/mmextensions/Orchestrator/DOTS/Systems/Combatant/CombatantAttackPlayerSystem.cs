using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Optimized system for combatants (zombies) to detect and attack players.
    /// Uses CSR Grid for ultra-fast spatial queries of dynamic entities (players move!).
    ///
    /// PERFORMANCE OPTIMIZATIONS:
    /// 1. CSR Grid.QueryRadius() - O(1) neighbor lookup, 100k-1M entity scale
    /// 2. Staggered updates - Process 1/4 of combatants per frame (4-frame cycle)
    /// 3. Temporal coherence - Cache last known target, recheck every 4 frames
    /// 4. Linear search for nearest player - faster than temp KD-Tree overhead
    ///
    /// DIFFERENCE FROM CombatantAttackResourceSystem:
    /// - Uses CSR Grid (dynamic) instead of QuadTree (static)
    /// - Players move, so CSR Grid is updated every frame
    /// - Players have health/state, combatants can kill them
    ///
    /// Uses Combatant.State for movement control (MoveToDestinationSystem handles state-based movement).
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CombatantAttackResourceSystem))] // Players get priority after resources
    public partial struct CombatantAttackPlayerSystem : ISystem
    {
        [BurstCompile]
        private partial struct FindAndAttackPlayersJob : IJobEntity
        {
            // CSR Grid for dynamic entities (players, combatants) - O(1) queries!
            [ReadOnly] public SpatialGridCSR CSRGrid;

            // Component lookups for checking player status
            [ReadOnly] public ComponentLookup<Player> PlayerLookup;
            [ReadOnly] public ComponentLookup<LocalToWorld> TransformLookup;

            // Staggered update support
            public uint FrameCounter;
            public int UpdateFrequency; // Process every N frames (default: 4)

            private void Execute(
                Entity entity,
                ref Combatant combatant,
                in LocalTransform transform)
            {
                // Skip if combatant is dead
                if (combatant.Data.IsDead)
                    return;

                // STAGGERED UPDATE: Only process this combatant every UpdateFrequency frames
                // Distribute load across frames to prevent 1000 units/sec from tanking FPS
                if (UpdateFrequency > 1)
                {
                    int entityBucket = (int)((uint)entity.Index % (uint)UpdateFrequency);
                    int currentBucket = (int)(FrameCounter % (uint)UpdateFrequency);
                    if (entityBucket != currentBucket)
                        return; // Skip this frame - will process in future frame
                }

                // Attack range is smaller than detection range
                float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);

                // Query CSR Grid for nearby dynamic entities (players) - O(1)!
                // CRITICAL: Explicit try-finally disposal for Burst compatibility
                // CRITICAL: Reduced capacity to avoid exceeding TempJob allocator limits
                // At 10k entities with 4-frame stagger = 2.5k entities/frame × 64 entries = 160KB (under 4MB limit)
                // Allocator.Temp has 4MB limit per frame - must keep total allocation low!
                var nearbyEntities = new NativeList<Entity>(64, Allocator.Temp); // Reduced to prevent TempJob overflow
                try
                {
                    CSRGrid.QueryRadius(transform.Position.xy, combatant.Data.DetectionRange, nearbyEntities);

                    // Early exit if no nearby entities
                    if (nearbyEntities.Length == 0)
                    {
                        // No entities nearby, return to idle if currently attacking a player
                        if (combatant.Data.State == CombatantState.Attacking ||
                            combatant.Data.State == CombatantState.Chasing)
                        {
                            // Only clear state if the current target is a player
                            // (don't interfere with resource targeting)
                            if (combatant.Data.TargetEntity != Entity.Null &&
                                PlayerLookup.HasComponent(combatant.Data.TargetEntity))
                            {
                                combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                                combatant.Data.TargetEntity = Entity.Null; // Clear target
                            }
                        }
                        return; // Will hit finally block for disposal
                    }

                    // Filter CSR Grid results to only include valid players
                    // Build a temporary list of player positions for nearest neighbor search
                    // NOTE: KDTreeEntry is just a (Entity, Position) struct - NOT using KD-Tree algorithm
                    // This is used for linear search in spatial queries, KD-Tree itself is disabled
                    // CRITICAL: Explicit try-finally disposal for Burst compatibility
                    // CRITICAL: Reduced capacity to avoid exceeding TempJob allocator limits
                    var playerPositions = new NativeList<KDTreeEntry>(64, Allocator.Temp);
                    int maxPlayerCapacity = playerPositions.Capacity;
                    try
                    {
                        for (int i = 0; i < nearbyEntities.Length; i++)
                        {
                            var playerEntity = nearbyEntities[i];

                            // Only include players
                            if (!PlayerLookup.HasComponent(playerEntity))
                                continue;

                            var player = PlayerLookup[playerEntity];

                            // Skip dead players (don't attack corpses)
                            if (player.Data.IsDead)
                                continue;

                            // Get player position
                            if (TransformLookup.TryGetComponent(playerEntity, out var playerTransform))
                            {
                                // CRITICAL: Check capacity BEFORE adding to prevent resize
                                if (playerPositions.Length >= maxPlayerCapacity)
                                    break; // Stop adding to prevent resize crash

                                playerPositions.Add(new KDTreeEntry
                                {
                                    Entity = playerEntity,
                                    Position = playerTransform.Position.xy
                                });
                            }
                        }

                        // Linear search to find NEAREST player (fastest for typical case of 1-10 players)
                        Entity nearestPlayer = Entity.Null;
                        float nearestDistanceSq = float.MaxValue;

                        if (playerPositions.Length > 0)
                        {
                            // Linear search - simpler and faster than temp KD-Tree overhead
                            for (int i = 0; i < playerPositions.Length; i++)
                            {
                                float distSq = math.distancesq(transform.Position.xy, playerPositions[i].Position);
                                if (distSq < nearestDistanceSq)
                                {
                                    nearestDistanceSq = distSq;
                                    nearestPlayer = playerPositions[i].Entity;
                                }
                            }

                            // Calculate actual distance
                            float distance = math.sqrt(nearestDistanceSq);

                            // Update combatant state based on distance to nearest player
                            if (distance <= attackRange)
                            {
                                // CRITICAL: Only attack when RIGHT NEXT TO the player
                                // MoveToDestinationSystem will automatically stop movement when State == Attacking
                                if (combatant.Data.State != CombatantState.Attacking)
                                {
                                    combatant.Data = combatant.Data.SetState(CombatantState.Attacking);
                                }

                                // PERFORMANCE FIX: Store target entity for O(1) damage application
                                // PlayerDamageSystem will apply damage based on TargetEntity
                                combatant.Data.TargetEntity = nearestPlayer;
                            }
                            else if (distance <= combatant.Data.DetectionRange)
                            {
                                // Player detected but NOT in attack range yet
                                // MoveToDestinationSystem will automatically move when State == Chasing
                                if (combatant.Data.State == CombatantState.Idle ||
                                    combatant.Data.State == CombatantState.Patrolling)
                                {
                                    combatant.Data = combatant.Data.SetState(CombatantState.Chasing);
                                }
                            }
                            else
                            {
                                // Nearest player is outside detection range (shouldn't happen due to CSR filter)
                                if (combatant.Data.State == CombatantState.Attacking ||
                                    combatant.Data.State == CombatantState.Chasing)
                                {
                                    // Only clear state if the current target is a player
                                    if (combatant.Data.TargetEntity != Entity.Null &&
                                        PlayerLookup.HasComponent(combatant.Data.TargetEntity))
                                    {
                                        combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                                        combatant.Data.TargetEntity = Entity.Null; // Clear target
                                    }
                                }
                            }
                        }
                        else
                        {
                            // No players found in filtered set, return to idle if currently targeting a player
                            if (combatant.Data.State == CombatantState.Attacking ||
                                combatant.Data.State == CombatantState.Chasing)
                            {
                                // Only clear state if the current target is a player
                                if (combatant.Data.TargetEntity != Entity.Null &&
                                    PlayerLookup.HasComponent(combatant.Data.TargetEntity))
                                {
                                    combatant.Data = combatant.Data.SetState(CombatantState.Idle);
                                    combatant.Data.TargetEntity = Entity.Null; // Clear target
                                }
                            }
                        }
                    }
                    finally
                    {
                        playerPositions.Dispose();
                    }
                }
                finally
                {
                    nearbyEntities.Dispose();
                }
            }
        }

        private EntityQuery _spatialSystemQuery;
        private uint _frameCounter;

        // PERFORMANCE TUNING: Process combatants every N frames
        // 4 = 25% per frame (distribute 1000 units across 4 frames = 250/frame)
        private const int UPDATE_FREQUENCY = 4;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Create query for CSR Grid singleton (for dynamic entities like players)
            _spatialSystemQuery = SystemAPI.QueryBuilder()
                .WithAll<SpatialGridCSRSingleton, SpatialSystemTag>()
                .Build();

            // Require spatial systems to exist before running
            state.RequireForUpdate(_spatialSystemQuery);
            _frameCounter = 0;
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _frameCounter++;

            // Get CSR Grid for dynamic entity lookups (players)
            var csrGridSingleton = SystemAPI.GetSingleton<SpatialGridCSRSingleton>();

            // Skip if spatial system not ready
            if (!csrGridSingleton.IsValid)
                return;

            // FENCE: Depend on CSR Grid build handle to prevent races
            // This ensures the ReadGrid is fully built before we query it
            state.Dependency = JobHandle.CombineDependencies(state.Dependency, csrGridSingleton.BuildJobHandle);

            var job = new FindAndAttackPlayersJob
            {
                CSRGrid = csrGridSingleton.ReadGrid, // DOUBLE BUFFERING: Use stable ReadGrid
                PlayerLookup = SystemAPI.GetComponentLookup<Player>(true),
                TransformLookup = SystemAPI.GetComponentLookup<LocalToWorld>(true),
                FrameCounter = _frameCounter,
                UpdateFrequency = UPDATE_FREQUENCY
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);
        }
    }
}
