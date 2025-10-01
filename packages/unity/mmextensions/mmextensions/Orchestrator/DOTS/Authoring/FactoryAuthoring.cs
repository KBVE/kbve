using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{

    /// <summary>
    /// Factory authoring component , will be replaced by the HordeAuthoring.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform))]
    [HelpURL("https://kbve.com/application/unity/#factoryauthoring")]
    public class FactoryAuthoring : MonoBehaviour
    {
        private class FactoryBaker : Baker<FactoryAuthoring>
        {
            public override void Bake(FactoryAuthoring authoring)
            {

                // Safety check: prevent baking a factory with no prefab assigned.
                // Without this, we'd create an invalid entity that can't spawn anything.
                if (authoring.Prefab == null)
                {
                    UnityEngine.Debug.LogError($"[FactoryBaker] {authoring.name} has no prefab assigned!");
                    return;
                }

                var entity = GetEntity(TransformUsageFlags.None);
                var prefabEntity = GetEntity(authoring.Prefab, TransformUsageFlags.Dynamic);
                var spawnPos = new float2(authoring.transform.position.x, authoring.transform.position.z) + authoring.SpawnOffset;

                // Clamp unsafe authoring values so they don't break runtime
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

        [Header("Spawning Configuration")]
        [Tooltip("The prefab to spawn")]
        public GameObject Prefab;

        [Tooltip("Offset from factory position for spawning")]
        public float2 SpawnOffset;

        [Tooltip("Time between spawns in seconds")]
        [Min(0.01f)]
        public float Duration = 1f;

        [Tooltip("Number of entities to spawn per wave")]
        [Min(1)]
        public int SpawnCount = 1;

        [Tooltip("Maximum waves to spawn (100 waves = 100k zombies at 1k per wave)")]
        [Min(0)]
        public int MaxWaves = 100;

        [Tooltip("Start with random timer value")]
        public bool RandomInitialDuration;

        private void OnDrawGizmosSelected()
        {
            // Draw spawn position
            Vector3 spawnPos = transform.position + new Vector3(SpawnOffset.x, 0, SpawnOffset.y);
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(spawnPos, 1f);

            // Draw line from factory to spawn position
            Gizmos.color = Color.green;
            Gizmos.DrawLine(transform.position, spawnPos);
        }

        void OnValidate()
        {
            if (SpawnCount < 1) SpawnCount = 1;
            if (MaxWaves < 0) MaxWaves = 0;
        }

    }
}