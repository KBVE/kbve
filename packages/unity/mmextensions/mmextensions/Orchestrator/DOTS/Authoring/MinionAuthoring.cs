using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Authoring component for converting GameObjects to ECS minions
    /// Attach this to prefabs that should become ECS entities
    /// </summary>
    [DisallowMultipleComponent]
    public class MinionAuthoring : MonoBehaviour
    {
        [Header("Minion Configuration")]
        public MinionType minionType = MinionType.Basic;
        public FactionType faction = FactionType.Enemy;

        [Header("Stats")]
        [Range(1, 1000)]
        public float health = 100f;
        [Range(0.5f, 20f)]
        public float speed = 4f;
        [Range(1f, 100f)]
        public float attackDamage = 10f;
        [Range(1f, 10f)]
        public float attackRange = 2f;
        [Range(5f, 50f)]
        public float detectionRange = 10f;
        [Range(1, 100)]
        public int level = 1;

        [Header("Behavior")]
        public MinionStateFlags initialStateFlags = MinionStateFlags.None;
        public bool hasLifetime = false;
        [Range(1f, 300f)]
        public float lifetime = 60f;

        [Header("Visuals")]
        public GameObject modelPrefab;
        public Material[] materialVariants;
        public float scale = 1f;

        [Header("Debug")]
        public bool showGizmos = true;
        public Color gizmoColor = Color.red;

        private void OnDrawGizmosSelected()
        {
            if (!showGizmos) return;

            // Draw detection range
            Gizmos.color = new Color(gizmoColor.r, gizmoColor.g, gizmoColor.b, 0.3f);
            Gizmos.DrawWireSphere(transform.position, detectionRange);

            // Draw attack range
            Gizmos.color = Color.red;
            Gizmos.DrawWireSphere(transform.position, attackRange);

            // Draw speed indicator
            Gizmos.color = Color.green;
            Gizmos.DrawRay(transform.position, transform.forward * speed);
        }

        /// <summary>
        /// Validate stats when values change in inspector
        /// </summary>
        private void OnValidate()
        {
            // Ensure health is positive
            health = Mathf.Max(1f, health);

            // Ensure speed is reasonable
            speed = Mathf.Clamp(speed, 0.5f, 20f);

            // Ensure ranges make sense
            detectionRange = Mathf.Max(attackRange + 1f, detectionRange);
        }
    }

    /// <summary>
    /// Baker to convert MinionAuthoring to ECS components
    /// </summary>
    public class MinionBaker : Unity.Entities.Baker<MinionAuthoring>
    {
        public override void Bake(MinionAuthoring authoring)
        {
            var entity = GetEntity(TransformUsageFlags.Dynamic);

            // Add core minion data
            AddComponent(entity, new MinionData
            {
                Health = authoring.health,
                MaxHealth = authoring.health,
                Speed = authoring.speed,
                AttackDamage = authoring.attackDamage,
                AttackRange = authoring.attackRange,
                DetectionRange = authoring.detectionRange,
                Faction = authoring.faction,
                Type = authoring.minionType,
                Level = authoring.level,
                StateFlags = authoring.initialStateFlags
            });

            // Add spatial position
            AddComponent(entity, SpatialPosition.Create(
                new float3(authoring.transform.position.x,
                          authoring.transform.position.y,
                          authoring.transform.position.z)
            ));

            // Add lifetime if configured
            if (authoring.hasLifetime)
            {
                AddComponent(entity, new MinionLifetime
                {
                    SpawnTime = 0f, // Will be set at spawn time
                    MaxLifetime = authoring.lifetime
                });
            }

            // Add visual reference if exists
            if (authoring.modelPrefab != null)
            {
                AddComponent(entity, new MinionVisualReference
                {
                    PrefabReference = GetEntity(authoring.modelPrefab, TransformUsageFlags.Renderable),
                    Scale = authoring.scale
                });
            }

            // Add buffer for spatial query results
            AddBuffer<SpatialQueryResult>(entity);
        }
    }

    /// <summary>
    /// Component to reference visual prefab
    /// </summary>
    public struct MinionVisualReference : IComponentData
    {
        public Entity PrefabReference;
        public float Scale;
    }

    /// <summary>
    /// Utility class for runtime minion creation
    /// </summary>
    public static class MinionFactory
    {
        /// <summary>
        /// Create minion entity with specified configuration
        /// </summary>
        public static Entity CreateMinion(
            EntityManager entityManager,
            float3 position,
            MinionType type,
            FactionType faction,
            int level = 1)
        {
            var entity = entityManager.CreateEntity();

            // Add all required components
            entityManager.AddComponentData(entity, new MinionData
            {
                Health = GetBaseHealth(type) * level,
                MaxHealth = GetBaseHealth(type) * level,
                Speed = GetBaseSpeed(type),
                AttackDamage = GetBaseDamage(type) * level,
                AttackRange = 2f,
                DetectionRange = 10f,
                Faction = faction,
                Type = type,
                Level = level,
                StateFlags = MinionStateFlags.None
            });

            entityManager.AddComponentData(entity, SpatialPosition.Create(position));

            entityManager.AddBuffer<SpatialQueryResult>(entity);

            return entity;
        }

        private static float GetBaseHealth(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Tank:
                    return 200f;
                case MinionType.Boss:
                    return 500f;
                case MinionType.Fast:
                    return 50f;
                default:
                    return 100f;
            }
        }

        private static float GetBaseSpeed(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Fast:
                    return 8f;
                case MinionType.Flying:
                    return 6f;
                case MinionType.Tank:
                    return 2f;
                default:
                    return 4f;
            }
        }

        private static float GetBaseDamage(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Boss:
                    return 50f;
                case MinionType.Tank:
                    return 20f;
                case MinionType.Ranged:
                    return 15f;
                default:
                    return 10f;
            }
        }
    }
}