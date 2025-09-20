using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using Unity.Jobs;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Processes combat interactions between minions
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionBehaviorSystem))]
    public partial class MinionCombatSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;
        private Unity.Mathematics.Random _random;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();
            _random = new Unity.Mathematics.Random((uint)System.DateTime.Now.Ticks);
        }

        protected override void OnUpdate()
        {
            var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;
            var randomLocal = _random;

            // Process attack attempts
            Entities
                .WithName("ProcessAttacks")
                .ForEach((Entity entity, int entityInQueryIndex,
                    ref DamageDealer dealer,
                    ref MinionData minion,
                    in CombatTarget target,
                    in LocalTransform transform) =>
                {
                    if (!target.HasTarget) return;
                    if (currentTime < dealer.LastAttackTime + dealer.AttackCooldown) return;
                    if (target.TargetDistance > minion.AttackRange) return;

                    // Create attack event
                    dealer.LastAttackTime = currentTime;
                    dealer.LastTarget = target.CurrentTarget;

                    // Queue damage application
                    ecb.AddComponent(entityInQueryIndex, target.CurrentTarget, new DamageEvent
                    {
                        Damage = dealer.BaseDamage,
                        Attacker = entity,
                        DamageType = dealer.Type,
                        HitPosition = transform.Position,
                        KnockbackForce = dealer.KnockbackForce
                    });

                    // Add combat event for visual feedback
                    // Note: Visual events handled by separate system
                })
                .ScheduleParallel();

            // Process damage events
            Entities
                .WithName("ProcessDamage")
                .ForEach((Entity entity, int entityInQueryIndex,
                    ref MinionData minion,
                    ref DamageTaker taker,
                    in DamageEvent damageEvent) =>
                {
                    // Check invulnerability
                    if (taker.IsInvulnerable) return;

                    // Calculate damage with defense and resistances
                    float finalDamage = CombatUtilities.CalculateDamage(
                        damageEvent.Damage,
                        taker.Defense,
                        taker.DamageReduction,
                        damageEvent.DamageType,
                        taker.Resistances
                    );

                    // Check for dodge (if we have combat stats)
                    if (SystemAPI.HasComponent<CombatStats>(entity))
                    {
                        var stats = SystemAPI.GetComponent<CombatStats>(entity);
                        if (randomLocal.NextFloat() < stats.DodgeChance)
                        {
                            finalDamage = 0f;
                            // TODO: Add dodge visual event
                        }
                        else if (randomLocal.NextFloat() < stats.BlockChance)
                        {
                            finalDamage *= (1f - stats.BlockReduction);
                            // TODO: Add block visual event
                        }
                    }

                    // Apply damage
                    minion.Health = math.max(0, minion.Health - finalDamage);
                    taker.LastDamageTime = currentTime;
                    taker.LastAttacker = damageEvent.Attacker;
                    taker.InvulnerabilityTimer = 0.1f; // Brief invulnerability

                    // Apply knockback if alive
                    if (minion.Health > 0 && damageEvent.KnockbackForce > 0)
                    {
                        ecb.AddComponent(entityInQueryIndex, entity, new KnockbackForce
                        {
                            Force = damageEvent.KnockbackForce,
                            Direction = math.normalize(SystemAPI.GetComponent<LocalTransform>(entity).Position - damageEvent.HitPosition),
                            Duration = 0.2f
                        });
                    }

                    // Mark as in combat
                    if (!SystemAPI.HasComponent<InCombat>(entity))
                    {
                        ecb.AddComponent(entityInQueryIndex, entity, new InCombat
                        {
                            CombatStartTime = currentTime,
                            TimeInCombat = 0f,
                            HitsReceived = 1,
                            DamageReceived = finalDamage
                        });
                    }

                    // Remove damage event
                    ecb.RemoveComponent<DamageEvent>(entityInQueryIndex, entity);
                })
                .ScheduleParallel();

            // Update invulnerability timers
            Entities
                .WithName("UpdateInvulnerability")
                .ForEach((ref DamageTaker taker) =>
                {
                    if (taker.InvulnerabilityTimer > 0)
                    {
                        taker.InvulnerabilityTimer = math.max(0, taker.InvulnerabilityTimer - deltaTime);
                    }
                })
                .ScheduleParallel();

            // Update combat state
            Entities
                .WithName("UpdateCombatState")
                .WithAll<InCombat>()
                .ForEach((Entity entity, int entityInQueryIndex,
                    ref InCombat combat,
                    in MinionData minion) =>
                {
                    combat.TimeInCombat += deltaTime;

                    // Exit combat after 5 seconds of no damage
                    if (currentTime - SystemAPI.GetComponent<DamageTaker>(entity).LastDamageTime > 5f)
                    {
                        ecb.RemoveComponent<InCombat>(entityInQueryIndex, entity);
                    }
                })
                .ScheduleParallel();

            // Process area of effect damage (simplified for now)
            Entities
                .WithName("ProcessAoEDamage")
                .WithAll<AreaDamageRequest>()
                .WithoutBurst()
                .ForEach((Entity entity, int entityInQueryIndex,
                    AreaDamageRequest aoeRequest) =>
                {
                    // Remove the AoE request (implementation simplified)
                    ecb.RemoveComponent<AreaDamageRequest>(entityInQueryIndex, entity);
                })
                .Run();

            _ecbSystem.AddJobHandleForProducer(Dependency);
        }
    }

    /// <summary>
    /// Temporary component for damage events
    /// </summary>
    public struct DamageEvent : IComponentData
    {
        public float Damage;
        public Entity Attacker;
        public DamageType DamageType;
        public float3 HitPosition;
        public float KnockbackForce;
    }

    /// <summary>
    /// Component for area damage requests
    /// </summary>
    public struct AreaDamageRequest : IComponentData
    {
        public float3 Center;
        public float Radius;
        public float Damage;
        public DamageType DamageType;
        public Entity Source;
        public FactionType AffectsFaction;
        public float KnockbackForce;
    }

    /// <summary>
    /// Component for knockback physics
    /// </summary>
    public struct KnockbackForce : IComponentData
    {
        public float Force;
        public float3 Direction;
        public float Duration;
        public float ElapsedTime;
    }

    /// <summary>
    /// System to apply knockback physics
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionCombatSystem))]
    public partial class KnockbackSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();
        }

        protected override void OnUpdate()
        {
            var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();
            float deltaTime = SystemAPI.Time.DeltaTime;

            Entities
                .WithName("ApplyKnockback")
                .ForEach((Entity entity, int entityInQueryIndex,
                    ref LocalTransform transform,
                    ref KnockbackForce knockback) =>
                {
                    knockback.ElapsedTime += deltaTime;

                    if (knockback.ElapsedTime >= knockback.Duration)
                    {
                        ecb.RemoveComponent<KnockbackForce>(entityInQueryIndex, entity);
                        return;
                    }

                    // Apply decreasing force over time
                    float forceFactor = 1f - (knockback.ElapsedTime / knockback.Duration);
                    float3 displacement = knockback.Direction * knockback.Force * forceFactor * deltaTime;

                    transform.Position += displacement;
                })
                .ScheduleParallel();

            _ecbSystem.AddJobHandleForProducer(Dependency);
        }
    }

    /// <summary>
    /// Utility functions for combat calculations
    /// </summary>
    public static class CombatUtilities
    {
        public static float CalculateDamage(
            float baseDamage,
            float defense,
            float damageReduction,
            DamageType damageType,
            DamageResistance resistances)
        {
            // True damage ignores all reductions
            if (damageType == DamageType.True)
                return baseDamage;

            // Apply defense (flat reduction)
            float damage = math.max(1f, baseDamage - defense);

            // Apply damage reduction (percentage)
            damage *= (1f - damageReduction);

            // Apply resistances
            if (HasResistance(damageType, resistances))
            {
                damage *= 0.5f; // 50% reduction for resistances
            }

            return math.max(1f, damage);
        }

        private static bool HasResistance(DamageType type, DamageResistance resistances)
        {
            return type switch
            {
                DamageType.Physical => (resistances & DamageResistance.Physical) != 0,
                DamageType.Magical => (resistances & DamageResistance.Magical) != 0,
                DamageType.Fire => (resistances & DamageResistance.Fire) != 0,
                DamageType.Ice => (resistances & DamageResistance.Ice) != 0,
                DamageType.Lightning => (resistances & DamageResistance.Lightning) != 0,
                DamageType.Poison => (resistances & DamageResistance.Poison) != 0,
                _ => false
            };
        }

        public static bool RollCritical(float critChance, ref Unity.Mathematics.Random random)
        {
            return random.NextFloat() < critChance;
        }

        public static float ApplyCritical(float damage, float critMultiplier)
        {
            return damage * critMultiplier;
        }
    }
}