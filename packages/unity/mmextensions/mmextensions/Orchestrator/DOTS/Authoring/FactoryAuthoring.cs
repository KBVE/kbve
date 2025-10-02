using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Serialization;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Factory authoring component (to be replaced by HordeAuthoring later).
    /// Spawns waves of a prefab entity at an offset from this GameObject.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform))]
    [HelpURL("https://kbve.com/application/unity/#factoryauthoring")]
    public class FactoryAuthoring : MonoBehaviour
    {
        // ─────────────────────────────────────────────────────────────────────────
        // Authoring fields
        // ─────────────────────────────────────────────────────────────────────────
        [Header("Spawning Configuration")]
        [Tooltip("The prefab to spawn")]
        [FormerlySerializedAs("_prefab")] public GameObject Prefab;

        [Tooltip("Offset from factory position for spawning (X,Z)")]
        [FormerlySerializedAs("_spawnOffset")] public float2 SpawnOffset;

        [Tooltip("Time between spawns in seconds")]
        [Min(0.01f)]
        [FormerlySerializedAs("_duration ")] public float Duration = 1f;

        [Tooltip("Number of entities to spawn per wave")]
        [Min(1)]
        [FormerlySerializedAs("_spawnCount ")] public int SpawnCount = 1;

        [Tooltip("Maximum waves to spawn (0 = infinite)")]
        [Min(0)]
        public int MaxWaves = 100;

        [Tooltip("Start with a random timer value between 0 and Duration")]
        [FormerlySerializedAs("_randomInitialDuration")] public bool RandomInitialDuration;

        // ─────────────────────────────────────────────────────────────────────────
        // Baker
        // ─────────────────────────────────────────────────────────────────────────
        private class FactoryBaker : Baker<FactoryAuthoring>
        {
            public override void Bake(FactoryAuthoring authoring)
            {
#if UNITY_EDITOR
                // Guard against missing prefab to avoid baking a broken entity.
                if (authoring.Prefab == null)
                {
                    Debug.LogError($"[FactoryBaker] '{authoring.name}' has no Prefab assigned.");
                    return;
                }
#endif
                // Get the entity representing this authoring object
                var entity = GetEntity(TransformUsageFlags.None);

                // Get the prefab entity; use Dynamic so it can be instantiated at runtime
                var prefabEntity = GetEntity(authoring.Prefab, TransformUsageFlags.Dynamic);

                // Use XZ as 2D plane in 3D worlds (Unity: Y is up). If you're fully 2D, change to XY.
                var pos = authoring.transform.position;
                var spawnPos = new float2(pos.x, pos.z) + authoring.SpawnOffset;

                // Clamp unsafe authoring values
                var duration = math.max(0.01f, authoring.Duration);
                var count = math.max(1, authoring.SpawnCount);
                var maxWaves = math.max(0, authoring.MaxWaves);

                AddComponent(entity, new FactoryData
                {
                    prefab = prefabEntity,
                    instantiatePos = spawnPos,
                    count = count,
                    duration = duration,
                    wavesSpawned = 0,
                    maxWaves = maxWaves
                });

                AddComponent(entity, new FactoryTimer
                {
                    value = authoring.RandomInitialDuration
                        ? UnityEngine.Random.Range(0f, duration)
                        : duration
                });
            }
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            // Visualize the spawn offset (XZ plane)
            Vector3 spawnPos = transform.position + new Vector3(SpawnOffset.x, 0f, SpawnOffset.y);
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(spawnPos, 1f);
            Gizmos.color = Color.green;
            Gizmos.DrawLine(transform.position, spawnPos);
        }

        private void OnValidate()
        {
            if (SpawnCount < 1) SpawnCount = 1;
            if (MaxWaves < 0) MaxWaves = 0;
            if (Duration < 0.01f) Duration = 0.01f;
        }
#endif
    }
}
