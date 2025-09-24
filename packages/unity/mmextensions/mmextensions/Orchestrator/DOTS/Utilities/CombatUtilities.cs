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
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case DamageType.Physical:
                    return (resistances & DamageResistance.Physical) != 0;
                case DamageType.Magical:
                    return (resistances & DamageResistance.Magical) != 0;
                case DamageType.Fire:
                    return (resistances & DamageResistance.Fire) != 0;
                case DamageType.Ice:
                    return (resistances & DamageResistance.Ice) != 0;
                case DamageType.Lightning:
                    return (resistances & DamageResistance.Lightning) != 0;
                case DamageType.Poison:
                    return (resistances & DamageResistance.Poison) != 0;
                default:
                    return false;
            }
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
        public static void CalculateKnockback(
            in float3 attackerPosition,
            in float3 targetPosition,
            float knockbackForce,
            float damage,
            MinionType targetType,
            out float3 knockback)
        {
            if (knockbackForce <= 0f)
            {
                knockback = float3.zero;
                return;
            }

            // Calculate direction
            float3 direction = math.normalize(targetPosition - attackerPosition);

            // Scale by damage (more damage = more knockback)
            float damageMultiplier = math.sqrt(damage / 10f); // Diminishing returns

            // Apply type-based resistance
            float typeResistance = 1f; // default
            switch (targetType)
            {
                case MinionType.Tank:
                    typeResistance = 0.3f;    // Tanks resist knockback
                    break;
                case MinionType.Flying:
                    typeResistance = 0.7f;    // Flying units less affected
                    break;
                case MinionType.Boss:
                    typeResistance = 0.1f;    // Bosses heavily resist
                    break;
                default:
                    typeResistance = 1f;
                    break;
            }

            knockback = direction * knockbackForce * damageMultiplier * typeResistance;
        }

        /// <summary>
        /// Calculate line of sight between two positions (simple version)
        /// </summary>
        [BurstCompile]
        public static bool HasLineOfSight(in float3 from, in float3 to, float maxDistance = 100f)
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
        public static void GetOptimalAttackPosition(
            in float3 targetPosition,
            in float3 currentPosition,
            MinionType attackerType,
            float attackRange,
            out float3 attackPosition)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (attackerType)
            {
                case MinionType.Ranged:
                    GetRangedAttackPosition(in targetPosition, in currentPosition, attackRange, out attackPosition);
                    break;
                case MinionType.Tank:
                    GetTankAttackPosition(in targetPosition, in currentPosition, attackRange, out attackPosition);
                    break;
                case MinionType.Fast:
                    GetHitAndRunPosition(in targetPosition, in currentPosition, attackRange, out attackPosition);
                    break;
                case MinionType.Flying:
                    GetFlyingAttackPosition(in targetPosition, in currentPosition, attackRange, out attackPosition);
                    break;
                default:
                    GetMeleeAttackPosition(in targetPosition, in currentPosition, attackRange, out attackPosition);
                    break;
            }
        }

        [BurstCompile]
        private static void GetMeleeAttackPosition(in float3 target, in float3 current, float range, out float3 position)
        {
            float3 direction = math.normalize(target - current);
            position = target - direction * (range * 0.8f); // Get close but not too close
        }

        [BurstCompile]
        private static void GetRangedAttackPosition(in float3 target, in float3 current, float range, out float3 position)
        {
            float3 direction = math.normalize(target - current);
            position = target - direction * (range * 0.9f); // Stay at max range
        }

        [BurstCompile]
        private static void GetTankAttackPosition(in float3 target, in float3 current, float range, out float3 position)
        {
            // Tanks charge directly at the target
            float3 direction = math.normalize(target - current);
            position = target - direction * (range * 0.5f); // Get very close
        }

        [BurstCompile]
        private static void GetHitAndRunPosition(in float3 target, in float3 current, float range, out float3 position)
        {
            // Fast units hit from the side when possible
            float3 toTarget = target - current;
            float3 sideDirection = new float3(-toTarget.z, toTarget.y, toTarget.x); // Perpendicular
            sideDirection = math.normalize(sideDirection);

            position = target + sideDirection * (range * 0.7f);
        }

        [BurstCompile]
        private static void GetFlyingAttackPosition(in float3 target, in float3 current, float range, out float3 position)
        {
            // Flying units attack from above when possible
            float3 direction = math.normalize(target - current);
            position = target - direction * (range * 0.8f);
            position.y += 3f; // Add height advantage
        }

        /// <summary>
        /// Calculate formation position for group movement
        /// </summary>
        [BurstCompile]
        public static void CalculateFormationPosition(
            in float3 leaderPosition,
            in float3 leaderDirection,
            int unitIndex,
            int totalUnits,
            FormationType formation,
            out float3 formationPosition)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (formation)
            {
                case FormationType.Line:
                    CalculateLineFormation(in leaderPosition, in leaderDirection, unitIndex, totalUnits, out formationPosition);
                    break;
                case FormationType.Wedge:
                    CalculateWedgeFormation(in leaderPosition, in leaderDirection, unitIndex, totalUnits, out formationPosition);
                    break;
                case FormationType.Circle:
                    CalculateCircleFormation(in leaderPosition, unitIndex, totalUnits, out formationPosition);
                    break;
                case FormationType.Column:
                    CalculateColumnFormation(in leaderPosition, in leaderDirection, unitIndex, out formationPosition);
                    break;
                default:
                    formationPosition = leaderPosition;
                    break;
            }
        }

        [BurstCompile]
        private static void CalculateLineFormation(in float3 leader, in float3 direction, int index, int total, out float3 position)
        {
            float3 right = math.cross(direction, math.up());
            float spacing = 2f;
            float offset = (index - total / 2f) * spacing;
            position = leader + right * offset - direction * 2f;
        }

        [BurstCompile]
        private static void CalculateWedgeFormation(in float3 leader, in float3 direction, int index, int total, out float3 position)
        {
            float3 right = math.cross(direction, math.up());
            float row = index / 2;
            float side = (index % 2 == 0) ? -1f : 1f;
            position = leader + right * (side * (row + 1) * 1.5f) - direction * (row * 2f);
        }

        [BurstCompile]
        private static void CalculateCircleFormation(in float3 leader, int index, int total, out float3 position)
        {
            float angle = (index / (float)total) * 2f * math.PI;
            float radius = 3f;
            position = leader + new float3(math.cos(angle) * radius, 0, math.sin(angle) * radius);
        }

        [BurstCompile]
        private static void CalculateColumnFormation(in float3 leader, in float3 direction, int index, out float3 position)
        {
            position = leader - direction * (index * 2f);
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

    // Spatial query components removed - using Unity Physics for spatial queries instead
}