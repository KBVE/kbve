using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using Unity.Collections;
using KBVE.MMExtensions.Orchestrator.DOTS.Utilities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Handles AI behavior for minions with combat integration
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(MinionCombatSystem))]
    public partial class MinionBehaviorSystem : SystemBase
    {
        private Unity.Mathematics.Random _random;
        private EntityQuery _playerQuery;

        protected override void OnCreate()
        {
            _random = new Unity.Mathematics.Random((uint)System.DateTime.Now.Ticks);

            // Query for player entities
            _playerQuery = GetEntityQuery(
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.ReadOnly<LocalTransform>()
            );
        }

        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            float elapsedTime = (float)SystemAPI.Time.ElapsedTime;
            var randomLocal = _random;

            // Target acquisition for hostile minions using enhanced spatial queries
            var minionDataLookup = SystemAPI.GetComponentLookup<MinionData>(true);

            var targetAcquisitionJob = Entities
                .WithName("AcquireTargets")
                .WithReadOnly(minionDataLookup)
                .ForEach((Entity entity,
                    ref CombatTarget combatTarget,
                    ref MinionData minion,
                    in LocalTransform transform,
                    in DynamicBuffer<SpatialQueryResult> queryResults) =>
                {
                    // Update time since last target seen
                    combatTarget.TimeSinceTargetSeen += deltaTime;

                    // Check if current target is still valid
                    if (combatTarget.HasTarget)
                    {
                        bool targetStillValid = false;
                        float currentTargetDistance = float.MaxValue;

                        // Look for current target in spatial results
                        foreach (var result in queryResults)
                        {
                            if (result.TargetEntity == combatTarget.CurrentTarget)
                            {
                                targetStillValid = true;
                                currentTargetDistance = result.Distance;
                                combatTarget.TargetDistance = result.Distance;
                                combatTarget.TargetLastKnownPosition = result.Position;
                                combatTarget.TimeSinceTargetSeen = 0f;
                                break;
                            }
                        }

                        // Keep current target if still valid and in range
                        if (targetStillValid && currentTargetDistance <= minion.DetectionRange)
                        {
                            return; // Keep current target
                        }

                        // Lose target if not seen for too long or out of range
                        if (combatTarget.TimeSinceTargetSeen > 3f || currentTargetDistance > minion.DetectionRange * 1.2f)
                        {
                            combatTarget.LoseTarget();
                            minion.StateFlags &= ~MinionStateFlags.Aggro;
                        }
                    }

                    // Find new target using threat assessment
                    Entity bestTarget = Entity.Null;
                    float bestThreatLevel = 0f;
                    float3 bestTargetPosition = float3.zero;

                    foreach (var result in queryResults)
                    {
                        if (result.TargetEntity == entity) continue;

                        if (minionDataLookup.HasComponent(result.TargetEntity))
                        {
                            var targetMinion = minionDataLookup[result.TargetEntity];

                            if (IsHostileFaction(minion.Faction, targetMinion.Faction))
                            {
                                // Calculate threat level instead of just distance
                                float threatLevel = CombatUtilities.CalculateThreatLevel(
                                    result.Distance,
                                    targetMinion.Health,
                                    targetMinion.AttackDamage,
                                    minion.DetectionRange
                                );

                                if (threatLevel > bestThreatLevel)
                                {
                                    bestThreatLevel = threatLevel;
                                    bestTarget = result.TargetEntity;
                                    bestTargetPosition = result.Position;
                                }
                            }
                        }
                    }

                    // Set new target if threat level is significant
                    if (bestTarget != Entity.Null && bestThreatLevel > 0.3f)
                    {
                        combatTarget.SetTarget(bestTarget, bestTargetPosition, math.distance(transform.Position, bestTargetPosition));
                        minion.StateFlags |= MinionStateFlags.Aggro;
                    }
                });

            targetAcquisitionJob.ScheduleParallel();

            // Update movement based on combat state
            var combatMovementJob = Entities
                .WithName("CombatMovement")
                .ForEach((Entity entity,
                    ref MinionMovementTarget movementTarget,
                    ref MinionData minion,
                    in CombatTarget combatTarget,
                    in LocalTransform transform) =>
                {
                    if (!combatTarget.HasTarget)
                    {
                        // Patrol behavior when no target
                        PatrolBehavior(ref movementTarget, ref minion, transform.Position, elapsedTime);
                        return;
                    }

                    float distanceToTarget = combatTarget.TargetDistance;

                    // Use optimized attack positioning based on minion type
                    float3 optimalPosition = CombatUtilities.GetOptimalAttackPosition(
                        combatTarget.TargetLastKnownPosition,
                        transform.Position,
                        minion.Type,
                        minion.AttackRange
                    );

                    // Type-specific behavior modifications
                    switch (minion.Type)
                    {
                        case MinionType.Ranged:
                            // Maintain optimal range and avoid clustering
                            if (distanceToTarget < minion.AttackRange * 0.7f)
                            {
                                minion.StateFlags |= MinionStateFlags.Fleeing;
                            }
                            else if (distanceToTarget > minion.AttackRange * 1.1f)
                            {
                                minion.StateFlags &= ~MinionStateFlags.Fleeing;
                                movementTarget.SetTarget(optimalPosition, minion.AttackRange * 0.1f);
                            }
                            break;

                        case MinionType.Tank:
                            // Aggressive charging behavior
                            if (distanceToTarget > minion.AttackRange * 0.5f)
                            {
                                minion.StateFlags |= MinionStateFlags.Charging;
                                movementTarget.SetTarget(optimalPosition, minion.AttackRange * 0.2f);
                            }
                            else
                            {
                                minion.StateFlags &= ~MinionStateFlags.Charging;
                            }
                            break;

                        case MinionType.Fast:
                            // Dynamic hit-and-run tactics
                            if ((minion.StateFlags & MinionStateFlags.Fleeing) != 0)
                            {
                                float3 fleeDir = math.normalize(transform.Position - combatTarget.TargetLastKnownPosition);
                                movementTarget.SetTarget(transform.Position + fleeDir * 6f, 1f);

                                // Stop fleeing when far enough
                                if (distanceToTarget > minion.AttackRange * 2.5f)
                                {
                                    minion.StateFlags &= ~MinionStateFlags.Fleeing;
                                }
                            }
                            else
                            {
                                movementTarget.SetTarget(optimalPosition, minion.AttackRange * 0.3f);

                                // Start fleeing after getting close
                                if (distanceToTarget <= minion.AttackRange * 1.2f)
                                {
                                    minion.StateFlags |= MinionStateFlags.Fleeing;
                                }
                            }
                            break;

                        case MinionType.Flying:
                            // Aerial attack positioning with height advantage
                            movementTarget.SetTarget(optimalPosition, minion.AttackRange * 0.2f);
                            break;

                        default:
                            // Basic minions use straightforward approach
                            if (distanceToTarget > minion.AttackRange * 0.9f)
                            {
                                movementTarget.SetTarget(optimalPosition, minion.AttackRange * 0.1f);
                            }
                            break;
                    }
                });

            combatMovementJob.ScheduleParallel();

            // Boss behavior patterns
            Entities
                .WithName("BossBehavior")
                .ForEach((Entity entity,
                    ref MinionData minion,
                    ref CombatTarget target,
                    in LocalTransform transform) =>
                {
                    if (minion.Type != MinionType.Boss) return;

                    // Enrage at low health
                    if (minion.HealthPercentage < 0.3f && (minion.StateFlags & MinionStateFlags.Enraged) == 0)
                    {
                        minion.StateFlags |= MinionStateFlags.Enraged;
                        minion.Speed *= 1.5f;
                        minion.AttackDamage *= 1.5f;
                    }

                    // Phase-based behavior
                    if (minion.HealthPercentage < 0.5f)
                    {
                        // Spawn adds or trigger special attacks
                        // This would trigger spawn events
                    }
                })
                .ScheduleParallel();

            // Swarm behavior for basic minions
            var transformLookup = SystemAPI.GetComponentLookup<LocalTransform>(true);

            Entities
                .WithName("SwarmBehavior")
                .WithReadOnly(minionDataLookup)
                .WithReadOnly(transformLookup)
                .ForEach((Entity entity,
                    ref MinionMovementTarget movementTarget,
                    in MinionData minion,
                    in LocalTransform transform,
                    in DynamicBuffer<SpatialQueryResult> nearbyEntities) =>
                {
                    if (minion.Type != MinionType.Basic) return;
                    if ((minion.StateFlags & MinionStateFlags.Aggro) != 0) return;

                    // Calculate swarm center
                    float3 swarmCenter = transform.Position;
                    int swarmCount = 1;

                    foreach (var nearby in nearbyEntities)
                    {
                        if (!minionDataLookup.HasComponent(nearby.TargetEntity)) continue;

                        var nearbyMinion = minionDataLookup[nearby.TargetEntity];
                        if (nearbyMinion.Type == MinionType.Basic &&
                            nearbyMinion.Faction == minion.Faction)
                        {
                            var nearbyTransform = transformLookup[nearby.TargetEntity];
                            swarmCenter += nearbyTransform.Position;
                            swarmCount++;
                        }
                    }

                    swarmCenter /= swarmCount;

                    // Move towards swarm center if too far
                    float distToCenter = math.distance(transform.Position, swarmCenter);
                    if (distToCenter > 5f)
                    {
                        movementTarget.SetTarget(swarmCenter, 3f);
                    }
                })
                .ScheduleParallel();

            _random = randomLocal;
        }

        private static void PatrolBehavior(
            ref MinionMovementTarget movementTarget,
            ref MinionData minion,
            float3 currentPosition,
            float time)
        {
            // Simple circular patrol
            float radius = 10f;
            float3 patrolTarget = new float3(
                math.sin(time * 0.5f) * radius,
                currentPosition.y,
                math.cos(time * 0.5f) * radius
            );

            movementTarget.SetTarget(currentPosition + patrolTarget, 1f);
            minion.StateFlags |= MinionStateFlags.Moving;
        }

        private static bool IsHostileFaction(FactionType source, FactionType target)
        {
            // Define faction hostility rules
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
                (FactionType.Wildlife, _) => false, // Wildlife is neutral
                _ => false
            };
        }
    }

    /// <summary>
    /// Advanced AI behaviors for special minion types
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionBehaviorSystem))]
    public partial class AdvancedMinionBehaviorSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            var minionDataLookup = SystemAPI.GetComponentLookup<MinionData>(true);

            // Flying minion behavior - height variation
            Entities
                .WithName("FlyingBehavior")
                .ForEach((ref LocalTransform transform,
                    ref MinionData minion) =>
                {
                    if (minion.Type != MinionType.Flying) return;

                    // Maintain flying height
                    float targetHeight = 5f;
                    if (transform.Position.y < targetHeight)
                    {
                        transform.Position.y = math.lerp(transform.Position.y, targetHeight, deltaTime);
                    }
                })
                .ScheduleParallel();

            // Defensive behavior for tanks
            Entities
                .WithName("DefensiveBehavior")
                .WithReadOnly(minionDataLookup)
                .ForEach((ref MinionData minion,
                    ref DamageTaker taker,
                    in DynamicBuffer<SpatialQueryResult> nearbyAllies) =>
                {
                    if (minion.Type != MinionType.Tank) return;

                    // Count nearby allies
                    int allyCount = 0;
                    foreach (var result in nearbyAllies)
                    {
                        if (minionDataLookup.HasComponent(result.TargetEntity))
                        {
                            var ally = minionDataLookup[result.TargetEntity];
                            if (ally.Faction == minion.Faction)
                            {
                                allyCount++;
                            }
                        }
                    }

                    // Increase defense when protecting allies
                    if (allyCount > 2)
                    {
                        minion.StateFlags |= MinionStateFlags.Defending;
                        taker.DamageReduction = math.min(0.5f, taker.DamageReduction + 0.2f);
                    }
                    else
                    {
                        minion.StateFlags &= ~MinionStateFlags.Defending;
                        taker.DamageReduction = math.max(0f, taker.DamageReduction - 0.2f);
                    }
                })
                .ScheduleParallel();
        }
    }
}