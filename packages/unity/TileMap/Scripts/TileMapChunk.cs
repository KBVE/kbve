// ============================================================================
// File:        TileMapChunk.cs
// Project:     KBVE/kbve — Issue #3472: TileMap GameObject
// Description: Addressable 50x50 tile chunk prefab with lazy loading
// ============================================================================
using UnityEngine;
using UnityEngine.AddressableAssets;

namespace KBVE.TileMap
{
    [System.Serializable]
    public struct TileData
    {
        public int TileTypeId;
        public bool IsWalkable;
        public float Height;
    }

    public class TileMapChunk : MonoBehaviour
    {
        public const int CHUNK_SIZE = 50;

        [SerializeField] private Vector2Int _chunkCoord;
        [SerializeField] private TileData[] _tiles; // Flattened 50x50
        private bool _isRendered;

        public Vector2Int ChunkCoord => _chunkCoord;

        public void Initialize(Vector2Int coord)
        {
            _chunkCoord = coord;
            _tiles = new TileData[CHUNK_SIZE * CHUNK_SIZE];
            transform.position = new Vector3(coord.x * CHUNK_SIZE, 0, coord.y * CHUNK_SIZE);
            _isRendered = false;
        }

        public TileData GetTile(int localX, int localY)
        {
            if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE)
                return default;
            return _tiles[localY * CHUNK_SIZE + localX];
        }

        public void SetTile(int localX, int localY, TileData data)
        {
            if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE)
                return;
            _tiles[localY * CHUNK_SIZE + localX] = data;
        }

        /// <summary>Lazy render - only create visual objects when needed</summary>
        public void SetVisible(bool visible)
        {
            if (visible && !_isRendered)
            {
                RenderTiles();
                _isRendered = true;
            }
            gameObject.SetActive(visible);
        }

        private void RenderTiles()
        {
            // TODO: Create mesh/sprites for each tile
            // Use GPU instancing or combined mesh for performance
            Debug.Log($"Rendering chunk ({_chunkCoord.x}, {_chunkCoord.y})");
        }

        public void Unload()
        {
            // Destroy child renderers to free memory
            foreach (Transform child in transform)
                Destroy(child.gameObject);
            _isRendered = false;
        }
    }
}
