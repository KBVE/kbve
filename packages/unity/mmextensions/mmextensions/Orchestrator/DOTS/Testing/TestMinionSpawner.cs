using UnityEngine;
using Unity.Mathematics;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Testing
{
    /// <summary>
    /// Simple test script for spawning minions
    /// Attach to a GameObject in your scene for testing
    /// </summary>
    public class TestMinionSpawner : MonoBehaviour
    {
        [Header("Spawn Configuration")]
        [SerializeField] private MinionType minionTypeToSpawn = MinionType.Tank; // Zombie
        [SerializeField] private FactionType factionType = FactionType.Enemy;
        [SerializeField] private float spawnRadius = 5f;

        [Header("Input Settings")]
        [SerializeField] private KeyCode singleSpawnKey = KeyCode.Z;
        [SerializeField] private KeyCode waveSpawnKey = KeyCode.X;
        [SerializeField] private bool spawnAtMouseClick = true;

        [Header("Wave Settings")]
        [SerializeField] private int waveCount = 5;
        [SerializeField] private float waveSpreadRadius = 3f;

        [Header("Prefab Manager")]
        [SerializeField] private bool usePrefabManager = true;
        [SerializeField] private MinionPrefabRegistry prefabRegistry;

        [Header("Debug")]
        [SerializeField] private bool showSpawnGizmos = true;
        [SerializeField] private Color gizmoColor = Color.green;

        private MinionPrefabManager _prefabManager;
        private Camera _mainCamera;
        private float3 _lastSpawnPosition;

        private async void Start()
        {
            _mainCamera = Camera.main;

            // Initialize prefab manager if needed
            if (usePrefabManager)
            {
                _prefabManager = MinionPrefabManager.Instance;

                if (prefabRegistry != null)
                {
                    _prefabManager.SetRegistry(prefabRegistry);
                }

                await _prefabManager.InitializeAsync();
                Debug.Log("[TestMinionSpawner] Prefab manager initialized");
            }

            // Wait for DOTS to be ready
            await UniTask.WaitUntil(() => DOTSSingleton.IsInitialized);
            Debug.Log("[TestMinionSpawner] DOTS ready - spawner active");
        }

        private void Update()
        {
            // Handle keyboard spawning
            if (Input.GetKeyDown(singleSpawnKey))
            {
                SpawnSingleAtPlayer();
            }

            if (Input.GetKeyDown(waveSpawnKey))
            {
                SpawnWaveAtPlayer();
            }

            // Handle mouse click spawning
            if (spawnAtMouseClick && Input.GetMouseButtonDown(0))
            {
                SpawnAtMousePosition();
            }

            // Debug spawn at center
            if (Input.GetKeyDown(KeyCode.Space))
            {
                SpawnAtPosition(float3.zero);
            }
        }

        private void SpawnSingleAtPlayer()
        {
            var position = new float3(transform.position) + GetRandomOffset();
            SpawnAtPosition(position);
            Debug.Log($"[TestMinionSpawner] Spawned {minionTypeToSpawn} at player position");
        }

        private void SpawnWaveAtPlayer()
        {
            var center = new float3(transform.position);
            SpawnWave(center);
            Debug.Log($"[TestMinionSpawner] Spawned wave of {waveCount} {minionTypeToSpawn} at player");
        }

        private void SpawnAtMousePosition()
        {
            if (_mainCamera == null) return;

            // Raycast to get world position
            Ray ray = _mainCamera.ScreenPointToRay(Input.mousePosition);

            // For 2D (assuming your game is 2D with sprites)
            if (Physics2D.Raycast(ray.origin, ray.direction))
            {
                Vector3 worldPos = _mainCamera.ScreenToWorldPoint(Input.mousePosition);
                worldPos.z = 0;
                SpawnAtPosition(new float3(worldPos));
                Debug.Log($"[TestMinionSpawner] Spawned {minionTypeToSpawn} at mouse position (2D)");
            }
            // For 3D
            else if (Physics.Raycast(ray, out RaycastHit hit, 100f))
            {
                SpawnAtPosition(new float3(hit.point));
                Debug.Log($"[TestMinionSpawner] Spawned {minionTypeToSpawn} at mouse position (3D)");
            }
            else
            {
                // Fallback: spawn at camera forward position
                Vector3 spawnPos = ray.origin + ray.direction * 10f;
                spawnPos.y = 0; // Ground level
                SpawnAtPosition(new float3(spawnPos));
            }
        }

        private async void SpawnAtPosition(float3 position)
        {
            _lastSpawnPosition = position;

            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[TestMinionSpawner] DOTS not initialized yet");
                return;
            }

            if (usePrefabManager && _prefabManager != null)
            {
                // Use prefab manager for spawning
                var entity = await _prefabManager.SpawnMinionAsync(minionTypeToSpawn, position, factionType);
                if (entity != Unity.Entities.Entity.Null)
                {
                    Debug.Log($"[TestMinionSpawner] Spawned entity {entity} via PrefabManager");
                }
            }
            else
            {
                // Use direct DOTS spawning
                DOTSSingleton.RequestSingleSpawn(position, minionTypeToSpawn, factionType);
                Debug.Log($"[TestMinionSpawner] Spawned via DOTSSingleton");
            }
        }

        private async void SpawnWave(float3 center)
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[TestMinionSpawner] DOTS not initialized yet");
                return;
            }

            if (usePrefabManager && _prefabManager != null)
            {
                // Use prefab manager for wave spawning
                var entities = await _prefabManager.SpawnMinionWaveAsync(
                    minionTypeToSpawn,
                    center,
                    waveCount,
                    waveSpreadRadius,
                    factionType
                );
                Debug.Log($"[TestMinionSpawner] Spawned {entities.Count} entities via PrefabManager");
            }
            else
            {
                // Use direct DOTS bulk spawning
                DOTSSingleton.RequestBulkSpawn(center, waveCount, minionTypeToSpawn, factionType);
                Debug.Log($"[TestMinionSpawner] Spawned wave via DOTSSingleton");
            }
        }

        private float3 GetRandomOffset()
        {
            var angle = UnityEngine.Random.Range(0f, math.PI * 2f);
            var distance = UnityEngine.Random.Range(0f, spawnRadius);
            return new float3(
                math.cos(angle) * distance,
                0,
                math.sin(angle) * distance
            );
        }

        private void OnDrawGizmos()
        {
            if (!showSpawnGizmos) return;

            // Draw spawn radius around player
            Gizmos.color = gizmoColor;
            Gizmos.DrawWireSphere(transform.position, spawnRadius);

            // Draw wave spawn radius
            Gizmos.color = new Color(gizmoColor.r, gizmoColor.g, gizmoColor.b, 0.5f);
            Gizmos.DrawWireSphere(transform.position, waveSpreadRadius);

            // Draw last spawn position
            if (_lastSpawnPosition.x != 0 || _lastSpawnPosition.z != 0)
            {
                Gizmos.color = Color.yellow;
                Gizmos.DrawWireCube(new Vector3(_lastSpawnPosition.x, _lastSpawnPosition.y, _lastSpawnPosition.z), Vector3.one * 0.5f);
            }
        }

        // Context menu helpers for testing in editor
        [ContextMenu("Spawn Single Test Minion")]
        private void TestSpawnSingle()
        {
            if (!Application.isPlaying)
            {
                Debug.LogError("Can only spawn in Play mode");
                return;
            }
            SpawnAtPosition(new float3(transform.position));
        }

        [ContextMenu("Spawn Test Wave")]
        private void TestSpawnWave()
        {
            if (!Application.isPlaying)
            {
                Debug.LogError("Can only spawn in Play mode");
                return;
            }
            SpawnWave(new float3(transform.position));
        }
    }
}