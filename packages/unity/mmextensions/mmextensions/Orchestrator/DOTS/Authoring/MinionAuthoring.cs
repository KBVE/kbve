using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;
using NSprites;
using NSprites.Authoring;

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

        [Header("NSprites Foundation Rendering")]
        public Sprite minionSprite;
        [SerializeField] public RegisterSpriteAuthoringModule RegisterSpriteData;
        [SerializeField] public SpriteSettingsAuthoringModule RenderSettings = new SpriteSettingsAuthoringModule
        {
            Pivot = new Unity.Mathematics.float2(0.5f, 0.5f), // Center pivot
            Size = new Unity.Mathematics.float2(1f, 1f), // Default size
            DrawMode = SpriteSettingsAuthoringModule.DrawModeType.Simple,
            TilingAndOffset = new Unity.Mathematics.float4(1f, 1f, 0f, 0f), // No tiling/offset
            Flip = new Unity.Mathematics.bool2(false, false) // No flipping
        };
        [SerializeField] public SortingAuthoringModule Sorting = new SortingAuthoringModule
        {
            StaticSorting = false,
            SortingIndex = 0,
            SortingLayer = 0  // Must be 0-3 due to NSprites Foundation limit
        };

        [Header("Pathfinding Settings")]
        [Tooltip("Enable A* pathfinding for this minion")]
        public bool enablePathfinding = true;
        [Tooltip("Movement speed in units per second")]
        [Range(0.5f, 20f)]
        public float moveSpeed = 3f;
        [Tooltip("Distance to stop from target")]
        [Range(0.1f, 5f)]
        public float stoppingDistance = 1.5f;
        [Tooltip("Agent radius for pathfinding collision")]
        [Range(0.1f, 2f)]
        public float agentRadius = 0.5f;
        [Tooltip("Agent height for pathfinding")]
        [Range(0.5f, 5f)]
        public float agentHeight = 2f;
        [Tooltip("Enable RVO collision avoidance")]
        public bool enableCollisionAvoidance = true;
        [Tooltip("Radius for detecting targets to chase")]
        [Range(5f, 50f)]
        public float targetDetectionRadius = 15f;
        [Tooltip("Layer mask for ground detection")]
        public LayerMask groundLayerMask = -1;

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
    /// Following Unity's official ECS prefab baking pattern
    /// </summary>
    public class MinionBaker : Unity.Entities.Baker<MinionAuthoring>
    {
        public override void Bake(MinionAuthoring authoring)
        {
            // Use single entity with Dynamic transform for both gameplay AND rendering
            // This is what Foundation expects and allows movement + sprite rendering
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

            // Register this entity as an EntityPrefab following Unity's pattern
            AddComponent(entity, new EntityPrefabComponent
            {
                Value = entity
            });

            // Add buffer for spatial query results
            AddBuffer<SpatialQueryResult>(entity);

            // Let Foundation handle ALL sprite rendering setup
            AddNSpritesFoundationRendering(authoring);

            // Add A* Pathfinding ECS components if enabled
            if (authoring.enablePathfinding)
            {
                AddComponent(entity, new Pathfinding.ECS.DestinationPoint
                {
                    destination = new float3(authoring.transform.position.x, authoring.transform.position.y, authoring.transform.position.z),
                    facingDirection = float3.zero
                });

                AddComponent(entity, new Pathfinding.ECS.MovementSettings
                {
                    follower = new Pathfinding.PID.PIDMovement
                    {
                        speed = authoring.moveSpeed,
                        rotationSpeed = 360f, // degrees per second
                        maxRotationSpeed = 400f, // slightly higher than rotationSpeed
                        maxOnSpotRotationSpeed = 720f, // fast rotation when turning on spot
                        slowdownTime = 0.5f,
                        slowdownTimeWhenTurningOnSpot = 0.2f,
                        desiredWallDistance = authoring.agentRadius * 1.5f,
                        leadInRadiusWhenApproachingDestination = 2f,
                        allowRotatingOnSpot = true // Enable rotation on spot
                    },
                    stopDistance = authoring.stoppingDistance,
                    rotationSmoothing = 0.1f,
                    positionSmoothing = 0f,
                    groundMask = authoring.groundLayerMask,
                    isStopped = false
                });

                AddComponent(entity, new Pathfinding.ECS.MovementState());

                AddComponent(entity, new Pathfinding.ECS.AgentCylinderShape
                {
                    radius = authoring.agentRadius,
                    height = authoring.agentHeight
                });

                AddComponent(entity, new Pathfinding.ECS.SimulateMovement());
                AddComponent(entity, new Pathfinding.ECS.AgentMovementPlane());
                AddComponent(entity, new Pathfinding.ECS.SearchState());

                // Add RVO collision avoidance if enabled
                if (authoring.enableCollisionAvoidance)
                {
                    AddComponent(entity, new Pathfinding.ECS.RVO.RVOAgent
                    {
                        agentTimeHorizon = 2f,
                        obstacleTimeHorizon = 1f,
                        maxNeighbours = 10,
                        layer = Pathfinding.RVO.RVOLayer.DefaultAgent,
                        collidesWith = Pathfinding.RVO.RVOLayer.DefaultAgent,
                        priority = 0.5f,
                        priorityMultiplier = 1f,
                        flowFollowingStrength = 0f,
                        locked = false
                    });
                }
            }
        }

        private void AddNSpritesFoundationRendering(MinionAuthoring authoring)
        {
            if (authoring.minionSprite == null)
            {
                Debug.LogWarning($"[MinionBaker] No sprite assigned to {authoring.name}. NSprites rendering will not work.");
                return;
            }

            // Validate Foundation modules are set up
            if (!authoring.RegisterSpriteData.IsValid(out var message))
            {
                Debug.LogError($"[MinionBaker] RegisterSpriteData not valid on {authoring.name}: {message}");
                return;
            }

            // Let Foundation handle EVERYTHING - this is the pure Foundation approach
            DependsOn(authoring);

            // Register sprite data - Foundation handles entity management internally
            authoring.RegisterSpriteData.Bake(this, authoring.minionSprite.texture);

            // Calculate UV and size data for Foundation modules
            var uvAtlas = (float4)NSpritesUtils.GetTextureST(authoring.minionSprite);
            var nativeSize = authoring.minionSprite.GetNativeSize(uvAtlas.xy);

            // Use Foundation's rendering settings module - adds all sprite components
            authoring.RenderSettings.Bake(this, authoring, nativeSize, uvAtlas);

            // Use Foundation's sorting module - handles sorting components
            authoring.Sorting.Bake(this);

            Debug.Log($"[MinionBaker] Foundation handled all sprite rendering for {authoring.name} with sprite {authoring.minionSprite.name}");
        }

    }



    /// <summary>
    /// Component for spawning waves of zombies in SubScene
    /// </summary>
    public struct ZombieWaveSpawner : IComponentData
    {
        public MinionType spawnType;
        public FactionType spawnFaction;
        public int zombiesPerWave;
        public float spawnInterval;
        public float waveRadius;
        public float2 gridTopLeft;
        public float2 gridBottomRight;
        public bool spawnWithinGrid;
        public bool allowEdgeSpawning;
        public float edgeSpawnProbability;
        public bool spawnOnStart;
        public int maxWaves;
        public float initialDelay;
    }

    /// <summary>
    /// Component for tracking spawn timing
    /// </summary>
    public struct SpawnTimer : IComponentData
    {
        public float lastSpawnTime;
        public int wavesSpawned;
        public bool hasSpawnedInitial;
        public bool isInitialized;
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