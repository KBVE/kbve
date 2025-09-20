using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Cave spawner authoring component - place this on GameObjects in scene to create zombie spawning caves
    /// Based on Age-of-Sprites factory pattern where scene objects spawn runtime entities
    /// </summary>
    [DisallowMultipleComponent]
    public class CaveSpawnerAuthoring : MonoBehaviour
    {
        [Header("Spawn Configuration")]
        [Tooltip("Prefab to spawn (should have MinionAuthoring with Tank type for zombies)")]
        public GameObject zombiePrefab;

        [Tooltip("Number of zombies to spawn per wave")]
        [Range(1, 20)]
        public int spawnCount = 3;

        [Tooltip("Time between spawns (seconds)")]
        [Range(1f, 60f)]
        public float spawnDuration = 5f;

        [Header("Spawn Area")]
        [Tooltip("Radius around cave to spawn zombies")]
        [Range(1f, 20f)]
        public float spawnRadius = 8f;

        [Tooltip("Random offset range for spawn positions")]
        [Range(0f, 5f)]
        public float randomOffset = 2f;

        [Header("Timing")]
        [Tooltip("Initial delay before first spawn")]
        [Range(0f, 10f)]
        public float initialDelay = 2f;

        [Tooltip("Start spawning immediately")]
        public bool spawnOnStart = true;

        [Header("Visual")]
        [Tooltip("Show spawn area in scene view")]
        public bool showGizmos = true;
        public Color gizmoColor = Color.red;

        private void OnDrawGizmosSelected()
        {
            if (!showGizmos) return;

            // Draw spawn radius
            Gizmos.color = new Color(gizmoColor.r, gizmoColor.g, gizmoColor.b, 0.3f);
            Gizmos.DrawWireSphere(transform.position, spawnRadius);

            // Draw cave center
            Gizmos.color = gizmoColor;
            Gizmos.DrawWireCube(transform.position, Vector3.one * 2f);
        }

        private void OnValidate()
        {
            spawnCount = Mathf.Max(1, spawnCount);
            spawnDuration = Mathf.Max(1f, spawnDuration);
            spawnRadius = Mathf.Max(1f, spawnRadius);
        }
    }

    /// <summary>
    /// Baker to convert Cave spawner to ECS entity
    /// </summary>
    public class CaveSpawnerBaker : Baker<CaveSpawnerAuthoring>
    {
        public override void Bake(CaveSpawnerAuthoring authoring)
        {
            if (authoring.zombiePrefab == null)
            {
                UnityEngine.Debug.LogWarning($"[CaveSpawnerBaker] No zombie prefab assigned to {authoring.name}");
                return;
            }

            var entity = GetEntity(TransformUsageFlags.Dynamic);

            // Add factory data for spawning
            AddComponent(entity, new FactoryData
            {
                prefab = GetEntity(authoring.zombiePrefab, TransformUsageFlags.Dynamic),
                instantiatePos = new float2(authoring.transform.position.x, authoring.transform.position.z),
                count = authoring.spawnCount,
                duration = authoring.spawnDuration
            });

            // Add factory timer
            AddComponent(entity, new FactoryTimer
            {
                value = authoring.spawnOnStart ? authoring.initialDelay : authoring.spawnDuration
            });

            // Add cave spawner tag
            AddComponent<CaveSpawnerTag>(entity);

            // Add cave-specific configuration
            AddComponent(entity, new CaveSpawnerConfig
            {
                spawnRadius = authoring.spawnRadius,
                randomOffset = authoring.randomOffset,
                initialDelay = authoring.initialDelay,
                spawnOnStart = authoring.spawnOnStart
            });

            // Add WorldPosition2D for 2D positioning
            AddComponent(entity, new WorldPosition2D
            {
                Value = new float2(authoring.transform.position.x, authoring.transform.position.z)
            });
        }
    }

    /// <summary>
    /// Cave-specific spawner configuration
    /// </summary>
    public struct CaveSpawnerConfig : IComponentData
    {
        public float spawnRadius;
        public float randomOffset;
        public float initialDelay;
        public bool spawnOnStart;
    }
}