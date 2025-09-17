using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Utilities
{
    /// <summary>
    /// Utility functions for combat calculations and spatial combat queries
    /// All functions are burst-compiled for maximum performance
    /// </summary>
    [BurstCompile]
    public static class CombatUtilities
    {
        /// <summary>
        /// Calculate final damage after applying defense, resistances, and damage type modifiers
        /// </summary>
        [BurstCompile]
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
            damage *= (1f - math.clamp(damageReduction, 0f, 0.95f)); // Cap at 95% reduction

            // Apply resistances
            if (HasResistance(damageType, resistances))
            {
                damage *= 0.5f; // 50% reduction for resistances
            }

            return math.max(1f, damage);
        }

        /// <summary>
        /// Check if target has resistance to specific damage type
        /// </summary>
        [BurstCompile]
        public static bool HasResistance(DamageType type, DamageResistance resistances)
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

        /// <summary>
        /// Roll for critical hit based on crit chance
        /// </summary>
        [BurstCompile]
        public static bool RollCritical(float critChance, ref Unity.Mathematics.Random random)
        {
            return random.NextFloat() < math.clamp(critChance, 0f, 1f);
        }

        /// <summary>
        /// Apply critical hit multiplier to damage
        /// </summary>
        [BurstCompile]
        public static float ApplyCritical(float damage, float critMultiplier)
        {
            return damage * math.max(1f, critMultiplier);
        }

        /// <summary>
        /// Roll for dodge based on dodge chance
        /// </summary>
        [BurstCompile]
        public static bool RollDodge(float dodgeChance, ref Unity.Mathematics.Random random)
        {
            return random.NextFloat() < math.clamp(dodgeChance, 0f, 0.95f); // Cap at 95%
        }

        /// <summary>
        /// Roll for block and calculate blocked damage
        /// </summary>
        [BurstCompile]
        public static float RollBlock(float damage, float blockChance, float blockReduction, ref Unity.Mathematics.Random random)
        {
            if (random.NextFloat() < math.clamp(blockChance, 0f, 1f))
            {
                return damage * (1f - math.clamp(blockReduction, 0f, 1f));
            }
            return damage;
        }

        /// <summary>
        /// Calculate knockback force based on damage and entity properties
        /// </summary>
        [BurstCompile]
        public static float3 CalculateKnockback(
            float3 attackerPosition,
            float3 targetPosition,
            float knockbackForce,
            float damage,
            MinionType targetType)
        {
            if (knockbackForce <= 0f)
                return float3.zero;

            // Calculate direction
            float3 direction = math.normalize(targetPosition - attackerPosition);

            // Scale by damage (more damage = more knockback)
            float damageMultiplier = math.sqrt(damage / 10f); // Diminishing returns

            // Apply type-based resistance
            float typeResistance = targetType switch
            {
                MinionType.Tank => 0.3f,    // Tanks resist knockback
                MinionType.Flying => 0.7f,  // Flying units less affected
                MinionType.Boss => 0.1f,    // Bosses heavily resist
                _ => 1f
            };

            return direction * knockbackForce * damageMultiplier * typeResistance;
        }

        /// <summary>
        /// Calculate line of sight between two positions (simple version)
        /// </summary>
        [BurstCompile]
        public static bool HasLineOfSight(float3 from, float3 to, float maxDistance = 100f)
        {
            float distance = math.distance(from, to);
            return distance <= maxDistance; // Simplified - in full version would raycast
        }

        /// <summary>
        /// Calculate threat level of target based on distance, health, and damage
        /// Higher values = higher threat
        /// </summary>
        [BurstCompile]
        public static float CalculateThreatLevel(
            float distance,
            float targetHealth,
            float targetDamage,
            float maxDistance)
        {
            if (distance > maxDistance)
                return 0f;

            // Closer = more threatening
            float distanceFactor = 1f - (distance / maxDistance);

            // More damage = more threatening
            float damageFactor = math.sqrt(targetDamage / 50f); // Normalized around 50 damage

            // Lower health = easier target (less threatening in terms of duration)
            float healthFactor = math.sqrt(targetHealth / 100f); // Normalized around 100 health

            return distanceFactor * 2f + damageFactor * 1.5f + healthFactor * 0.5f;
        }

        /// <summary>
        /// Get optimal attack position relative to target (for different minion types)
        /// </summary>
        [BurstCompile]
        public static float3 GetOptimalAttackPosition(
            float3 targetPosition,
            float3 currentPosition,
            MinionType attackerType,
            float attackRange)
        {
            return attackerType switch
            {
                MinionType.Ranged => GetRangedAttackPosition(targetPosition, currentPosition, attackRange),
                MinionType.Tank => GetTankAttackPosition(targetPosition, currentPosition, attackRange),
                MinionType.Fast => GetHitAndRunPosition(targetPosition, currentPosition, attackRange),
                MinionType.Flying => GetFlyingAttackPosition(targetPosition, currentPosition, attackRange),
                _ => GetMeleeAttackPosition(targetPosition, currentPosition, attackRange)
            };
        }

        [BurstCompile]
        private static float3 GetMeleeAttackPosition(float3 target, float3 current, float range)
        {
            float3 direction = math.normalize(target - current);
            return target - direction * (range * 0.8f); // Get close but not too close
        }

        [BurstCompile]
        private static float3 GetRangedAttackPosition(float3 target, float3 current, float range)
        {
            float3 direction = math.normalize(target - current);
            return target - direction * (range * 0.9f); // Stay at max range
        }

        [BurstCompile]
        private static float3 GetTankAttackPosition(float3 target, float3 current, float range)
        {
            // Tanks charge directly at the target
            float3 direction = math.normalize(target - current);
            return target - direction * (range * 0.5f); // Get very close
        }

        [BurstCompile]
        private static float3 GetHitAndRunPosition(float3 target, float3 current, float range)
        {
            // Fast units hit from the side when possible
            float3 toTarget = target - current;
            float3 sideDirection = new float3(-toTarget.z, toTarget.y, toTarget.x); // Perpendicular
            sideDirection = math.normalize(sideDirection);

            return target + sideDirection * (range * 0.7f);
        }

        [BurstCompile]
        private static float3 GetFlyingAttackPosition(float3 target, float3 current, float range)
        {
            // Flying units attack from above when possible
            float3 direction = math.normalize(target - current);
            float3 attackPos = target - direction * (range * 0.8f);
            attackPos.y += 3f; // Add height advantage
            return attackPos;
        }

        /// <summary>
        /// Calculate formation position for group movement
        /// </summary>
        [BurstCompile]
        public static float3 CalculateFormationPosition(
            float3 leaderPosition,
            float3 leaderDirection,
            int unitIndex,
            int totalUnits,
            FormationType formation)
        {
            return formation switch
            {
                FormationType.Line => CalculateLineFormation(leaderPosition, leaderDirection, unitIndex, totalUnits),
                FormationType.Wedge => CalculateWedgeFormation(leaderPosition, leaderDirection, unitIndex, totalUnits),
                FormationType.Circle => CalculateCircleFormation(leaderPosition, unitIndex, totalUnits),
                FormationType.Column => CalculateColumnFormation(leaderPosition, leaderDirection, unitIndex),
                _ => leaderPosition
            };
        }

        [BurstCompile]
        private static float3 CalculateLineFormation(float3 leader, float3 direction, int index, int total)
        {
            float3 right = math.cross(direction, math.up());
            float spacing = 2f;
            float offset = (index - total / 2f) * spacing;
            return leader + right * offset - direction * 2f;
        }

        [BurstCompile]
        private static float3 CalculateWedgeFormation(float3 leader, float3 direction, int index, int total)
        {
            float3 right = math.cross(direction, math.up());
            float row = index / 2;
            float side = (index % 2 == 0) ? -1f : 1f;
            return leader + right * (side * (row + 1) * 1.5f) - direction * (row * 2f);
        }

        [BurstCompile]
        private static float3 CalculateCircleFormation(float3 leader, int index, int total)
        {
            float angle = (index / (float)total) * 2f * math.PI;
            float radius = 3f;
            return leader + new float3(math.cos(angle) * radius, 0, math.sin(angle) * radius);
        }

        [BurstCompile]
        private static float3 CalculateColumnFormation(float3 leader, float3 direction, int index)
        {
            return leader - direction * (index * 2f);
        }
    }

    /// <summary>
    /// Formation types for group movement
    /// </summary>
    public enum FormationType : byte
    {
        None,
        Line,
        Wedge,
        Circle,
        Column,
        Scatter
    }

    /// <summary>
    /// Component for advanced spatial combat queries
    /// </summary>
    public struct AdvancedSpatialQuery : IComponentData
    {
        public QueryType PrimaryQuery;
        public QueryType SecondaryQuery;
        public float PrimaryRadius;
        public float SecondaryRadius;
        public int MaxPrimaryResults;
        public int MaxSecondaryResults;
        public FactionFilter TargetFactions;
        public bool RequireLineOfSight;
        public float ThreatThreshold;
        public float LastQueryTime;
        public float QueryInterval;

        public static AdvancedSpatialQuery CreateCombatQuery(float detectionRadius = 15f, float attackRadius = 5f)
        {
            return new AdvancedSpatialQuery
            {
                PrimaryQuery = QueryType.ClosestEnemy,
                SecondaryQuery = QueryType.AllInRadius,
                PrimaryRadius = detectionRadius,
                SecondaryRadius = attackRadius,
                MaxPrimaryResults = 1,
                MaxSecondaryResults = 10,
                TargetFactions = FactionFilter.Enemy,
                RequireLineOfSight = true,
                ThreatThreshold = 0.3f,
                LastQueryTime = 0f,
                QueryInterval = 0.1f // Query 10 times per second
            };
        }
    }
}