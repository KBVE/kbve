using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Factory authoring component - exact match to Age-of-Sprites pattern
    /// Place this on GameObjects to create spawning factories
    /// </summary>
    public class FactoryAuthoring : MonoBehaviour
    {
        private class FactoryBaker : Baker<FactoryAuthoring>
        {
            public override void Bake(FactoryAuthoring authoring)
            {
                var entity = GetEntity(TransformUsageFlags.None);

                if (authoring.Prefab == null)
                {
                    UnityEngine.Debug.LogError($"[FactoryBaker] {authoring.name} has no prefab assigned!");
                    return;
                }

                var prefabEntity = GetEntity(authoring.Prefab, TransformUsageFlags.Dynamic);
                var spawnPos = new float2(authoring.transform.position.x, authoring.transform.position.z) + authoring.SpawnOffset;

                AddComponent(entity, new FactoryData
                {
                    prefab = prefabEntity,
                    instantiatePos = spawnPos,
                    count = authoring.SpawnCount,
                    duration = authoring.Duration,
                    wavesSpawned = 0,
                    maxWaves = authoring.MaxWaves
                });

                AddComponent(entity, new FactoryTimer
                {
                    value = authoring.RandomInitialDuration ?
                        UnityEngine.Random.Range(0f, authoring.Duration) :
                        authoring.Duration
                });

            }
        }

        [Header("Spawning Configuration")]
        [Tooltip("The prefab to spawn")]
        public GameObject Prefab;

        [Tooltip("Offset from factory position for spawning")]
        public float2 SpawnOffset;

        [Tooltip("Time between spawns in seconds")]
        public float Duration = 1f;

        [Tooltip("Number of entities to spawn per wave")]
        public int SpawnCount = 1;

        [Tooltip("Maximum waves to spawn (100 waves = 100k zombies at 1k per wave)")]
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
    }
}