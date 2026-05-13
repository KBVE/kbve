// ============================================================================
// File:        TownManager.cs
// Project:     KBVE/kbve — Issue #3472: TileMap GameObject
// Description: Town manager that loads 2x2 grid of 50x50 chunks (200x200 total)
//              using Unity Addressables for memory-efficient world loading.
// ============================================================================
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace KBVE.TileMap
{
    public class TownManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private AssetReference _chunkPrefabRef;
        [SerializeField] private Transform _playerTransform;

        [Header("Town Config")]
        [SerializeField] private string _townName = "Silver";
        [SerializeField] private int _gridWidth = 2;  // 2 chunks wide
        [SerializeField] private int _gridHeight = 2; // 2 chunks tall
        [SerializeField] private float _renderDistance = 80f;
        [SerializeField] private float _unloadDistance = 120f;

        private TileMapChunk[,] _chunks;
        private AsyncOperationHandle<GameObject>[] _handles;

        public int TotalTilesX => _gridWidth * TileMapChunk.CHUNK_SIZE;  // 100
        public int TotalTilesY => _gridHeight * TileMapChunk.CHUNK_SIZE; // 100

        private async void Start()
        {
            if (_chunkPrefabRef == null)
            {
                Debug.LogError("[TownManager] Chunk prefab reference not set!");
                return;
            }
            await LoadTown();
        }

        public async Task LoadTown()
        {
            _chunks = new TileMapChunk[_gridWidth, _gridHeight];
            _handles = new AsyncOperationHandle<GameObject>[_gridWidth * _gridHeight];

            Debug.Log($"[TownManager] Loading town '{_townName}' ({_gridWidth}x{_gridHeight} chunks)...");

            int idx = 0;
            for (int x = 0; x < _gridWidth; x++)
            {
                for (int y = 0; y < _gridHeight; y++)
                {
                    var handle = _chunkPrefabRef.InstantiateAsync(transform);
                    _handles[idx++] = handle;
                    await handle.Task;

                    if (handle.Status != AsyncOperationStatus.Succeeded)
                    {
                        Debug.LogError($"[TownManager] Failed to load chunk ({x},{y})");
                        continue;
                    }

                    var chunk = handle.Result.GetComponent<TileMapChunk>();
                    chunk.Initialize(new Vector2Int(x, y));
                    chunk.gameObject.name = $"Chunk_{_townName}_{x}_{y}";
                    _chunks[x, y] = chunk;

                    // Populate with terrain data (placeholder - replace with actual data)
                    PopulateChunk(chunk, x, y);
                }
            }

            Debug.Log($"[TownManager] Town '{_townName}' loaded! Total tiles: {TotalTilesX}x{TotalTilesY}");
        }

        private void Update()
        {
            if (_chunks == null || _playerTransform == null) return;

            Vector3 playerPos = _playerTransform.position;

            for (int x = 0; x < _gridWidth; x++)
            {
                for (int y = 0; y < _gridHeight; y++)
                {
                    var chunk = _chunks[x, y];
                    if (chunk == null) continue;

                    // Center of chunk in world space
                    float cx = (x + 0.5f) * TileMapChunk.CHUNK_SIZE;
                    float cy = (y + 0.5f) * TileMapChunk.CHUNK_SIZE;
                    float dist = Vector2.Distance(
                        new Vector2(playerPos.x, playerPos.z),
                        new Vector2(cx, cy)
                    );

                    if (dist < _renderDistance)
                        chunk.SetVisible(true);
                    else if (dist > _unloadDistance)
                    {
                        chunk.Unload();
                        chunk.SetVisible(false);
                    }
                    else
                        chunk.SetVisible(false);
                }
            }
        }

        private void PopulateChunk(TileMapChunk chunk, int chunkX, int chunkY)
        {
            // TODO: Load actual terrain data from saved map files
            // For now, fill with grass (type 1)
            for (int x = 0; x < TileMapChunk.CHUNK_SIZE; x++)
            {
                for (int y = 0; y < TileMapChunk.CHUNK_SIZE; y++)
                {
                    chunk.SetTile(x, y, new TileData
                    {
                        TileTypeId = 1, // Grass
                        IsWalkable = true,
                        Height = 0f
                    });
                }
            }
        }

        private void OnDestroy()
        {
            if (_handles == null) return;
            foreach (var handle in _handles)
            {
                if (handle.IsValid())
                    Addressables.ReleaseInstance(handle);
            }
        }
    }
}
