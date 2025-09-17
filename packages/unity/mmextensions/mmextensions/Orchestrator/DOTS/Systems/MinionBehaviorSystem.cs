using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using Unity.Collections;

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

            // Target acquisition for hostile minions
            var minionDataLookup = SystemAPI.GetComponentLookup<MinionData>(true);
            var transformLookup = SystemAPI.GetComponentLookup<LocalTransform>(true);

            Entities
                .WithName("AcquireTargets")
                .WithReadOnly(minionDataLookup)
                .WithReadOnly(transformLookup)
                .ForEach((Entity entity,
                    ref CombatTarget combatTarget,
                    ref MinionData minion,
                    in LocalTransform transform,
                    in DynamicBuffer<SpatialQueryResult> queryResults) =>
                {
                    // Skip if already has valid target
                    if (combatTarget.HasTarget && combatTarget.TimeSinceTargetSeen < 2f)
                    {
                        return;
                    }

                    Entity bestTarget = Entity.Null;
                    float bestDistance = minion.DetectionRange;

                    // Check spatial query results for enemies
                    foreach (var result in queryResults)
                    {
                        if (result.TargetEntity == entity) continue;

                        // Check if valid target based on faction
                        if (minionDataLookup.HasComponent(result.TargetEntity))
                        {
                            var targetMinion = minionDataLookup[result.TargetEntity];

                            if (IsHostileFaction(minion.Faction, targetMinion.Faction))
                            {
                                if (result.Distance < bestDistance)
                                {
                                    bestDistance = result.Distance;
                                    bestTarget = result.TargetEntity;
                                }
                            }
                        }
                    }

                    // Set new target
                    if (bestTarget != Entity.Null)
                    {
                        var targetTransform = transformLookup[bestTarget];
                        combatTarget.SetTarget(bestTarget, targetTransform.Position, bestDistance);
                        minion.StateFlags |= MinionStateFlags.Aggro;
                    }
                    else
                    {
                        combatTarget.LoseTarget();
                        minion.StateFlags &= ~MinionStateFlags.Aggro;
                    }
                })
                .ScheduleParallel();

            // Update movement based on combat state
            Entities
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

                    // Different behavior based on minion type
                    switch (minion.Type)
                    {
                        case MinionType.Ranged:
                            // Keep distance from target
                            if (distanceToTarget < minion.AttackRange * 0.8f)
                            {
                                // Too close, back away
                                float3 awayDir = math.normalize(transform.Position - combatTarget.TargetLastKnownPosition);
                                movementTarget.SetTarget(transform.Position + awayDir * 2f);
                            }
                            else if (distanceToTarget > minion.AttackRange * 0.9f)
                            {
                                // Too far, move closer
                                movementTarget.SetTarget(combatTarget.TargetLastKnownPosition, minion.AttackRange * 0.85f);
                            }
                            break;

                        case MinionType.Tank:
                            // Charge directly at target
                            if (distanceToTarget > minion.AttackRange)
                            {
                                movementTarget.SetTarget(combatTarget.TargetLastKnownPosition, minion.AttackRange * 0.9f);
                                minion.StateFlags |= MinionStateFlags.Charging;
                            }
                            else
                            {
                                minion.StateFlags &= ~MinionStateFlags.Charging;
                            }
                            break;

                        case MinionType.Fast:
                            // Hit and run tactics
                            if ((minion.StateFlags & MinionStateFlags.Fleeing) != 0)
                            {
                                // Run away after hitting
                                float3 fleeDir = math.normalize(transform.Position - combatTarget.TargetLastKnownPosition);
                                movementTarget.SetTarget(transform.Position + fleeDir * 5f);

                                // Stop fleeing after a moment
                                if (distanceToTarget > minion.AttackRange * 2f)
                                {
                                    minion.StateFlags &= ~MinionStateFlags.Fleeing;
                                }
                            }
                            else if (distanceToTarget > minion.AttackRange)
                            {
                                // Move in to attack
                                movementTarget.SetTarget(combatTarget.TargetLastKnownPosition, minion.AttackRange * 0.9f);
                            }
                            else
                            {
                                // Start fleeing after attack
                                minion.StateFlags |= MinionStateFlags.Fleeing;
                            }
                            break;

                        default:
                            // Basic minions just move to attack range
                            if (distanceToTarget > minion.AttackRange)
                            {
                                movementTarget.SetTarget(combatTarget.TargetLastKnownPosition, minion.AttackRange * 0.9f);
                            }
                            break;
                    }
                })
                .ScheduleParallel();

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