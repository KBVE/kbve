using UnityEngine;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.Map
{
    [ExecuteAlways]
    [DisallowMultipleComponent]
    [AddComponentMenu("KBVE/Map/Tilemap Occupancy Baker")]
    public class TilemapOccupancyBaker : MonoBehaviour
    {
        public Tilemap targetTilemap;
        public Vector3Int size = new Vector3Int(10, 10, 1);
        public bool[,] occupancyMap;

        public void Bake()
        {
            if (targetTilemap == null)
            {
                Debug.LogError("[TilemapOccupancyBaker] No Tilemap assigned.");
                return;
            }

            BoundsInt bounds = new BoundsInt(
                targetTilemap.origin.x, targetTilemap.origin.y, 0,
                size.x, size.y, 1
            );

            occupancyMap = new bool[size.x, size.y];

            for (int x = 0; x < size.x; x++)
            {
                for (int y = 0; y < size.y; y++)
                {
                    Vector3Int pos = new Vector3Int(bounds.x + x, bounds.y + y, 0);
                    TileBase tile = targetTilemap.GetTile(pos);
                    occupancyMap[x, y] = tile != null;
                }
            }

            Debug.Log("[TilemapOccupancyBaker] Bake complete.");
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            if (occupancyMap == null || targetTilemap == null) return;

            Gizmos.color = Color.red;
            Vector3 cellSize = targetTilemap.cellSize;

            for (int x = 0; x < size.x; x++)
            {
                for (int y = 0; y < size.y; y++)
                {
                    if (occupancyMap[x, y])
                    {
                        Vector3 cellCenter = targetTilemap.CellToWorld(new Vector3Int(targetTilemap.origin.x + x, targetTilemap.origin.y + y, 0)) + cellSize / 2;
                        Gizmos.DrawWireCube(cellCenter, cellSize * 0.9f);
                    }
                }
            }
        }
#endif
    }
}
